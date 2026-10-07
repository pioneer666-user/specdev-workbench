// 随包只读入口：实际登记路径 → 三文件 → 官方渲染 → 每条固定引用；不输出正文或HTML。
import path from 'node:path'
import { realpath, mkdtemp, readdir, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertRepoTopLevel } from '../core/git.ts'
import { readChartPage } from '../core/chart.ts'
import { readDescriptor } from '../core/descriptor.ts'
import { CoreError } from '../core/errors.ts'
import { lifecycleProblems } from '../core/lifecycle.ts'
import { parseChartContract } from '../core/chart-contract.ts'
import type { renderArchify } from '../core/archify-render.ts'
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const usage = '用法：node <包根>/dist/check-chart.js <仓根> <业务ID> <图ID> [--json]'
const validId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)
type Diagnostic = { stage: string; code: string; message: string; nodeId?: string; refId?: string; sectionTitle?: string; label?: string; groupIndex?: number; official?: unknown }
export async function checkChart(args: string[]) {
  const report = { schemaVersion: 1, kind: 'failed', ok: false, businessId: null as string | null, chartId: null as string | null, renderer: null as string | null, diagramType: null as string | null, nodeCount: 0, stateCount: 0, transitionCount: 0, referenceCount: 0, qualityProfile: null as string | null, officialWarnings: '', diagnostics: [] as Diagnostic[] }
  const add = (stage: string, code: string, message: string, extra = {}) => report.diagnostics.push({ stage, code, message, ...extra })
  const flags = args.filter(a => a.startsWith('--')), positional = args.filter(a => !a.startsWith('--'))
  if (positional.length !== 3 || flags.some(a => a !== '--json') || flags.length > 1 || !positional[0] || !validId(positional[1]) || !validId(positional[2])) { add('input', 'bad-request', usage); return { report, exitCode: 2 } }
  const [input, business, chart] = positional; report.businessId = business; report.chartId = chart
  let stage = 'repo', temporary: string | undefined
  try {
    const repo = await realpath(input); await assertRepoTopLevel(repo, { originalObjects: true })
    stage = 'read'
    for (const [relative, schema, id] of [['docs/specdev/project.json', 'specdev/project/1', null], [`docs/specdev/${business}/business.json`, 'specdev/business/1', business]] as const) {
      const descriptor = await readDescriptor<any>(repo, relative)
      if (!descriptor.data || descriptor.data.schema !== schema || (id !== null && descriptor.data.id !== id) || typeof descriptor.data.name !== 'string' || !descriptor.data.name.trim()) { add(stage, 'invalid-registration', `${relative} 登记无效`); return { report, exitCode: 1 } }
    }
    const registration = await readDescriptor<any>(repo, `docs/specdev/${business}/${chart}/chart.json`)
    try { parseChartContract(registration.data ? JSON.stringify(registration.data) : null, chart) }
    catch (error) { add(stage, 'invalid-registration', error instanceof Error ? error.message : String(error)); return { report, exitCode: 1 } }
    const page = await readChartPage(repo, business, chart, 'current', { originalObjects: true })
    report.diagramType = page.diagramType ?? 'workflow'
    if (page.rendererError) { add('marker', 'evidence-unreadable', page.rendererError); return { report, exitCode: 1 } }
    report.renderer = page.renderer ?? 'legacy'
    if (report.renderer !== '3.0.1') { add('marker', 'legacy-chart', '旧图请使用随包旧版 workflow 校验入口，不能作为新版通过'); return { report, exitCode: 1 } }
    if (page.version.sourceError || page.version.detailsError || page.version.files.details === null) { add(stage, 'chart-unreadable', page.version.sourceError ?? page.version.detailsError ?? '缺少 details.md'); return { report, exitCode: 1 } }
    const sourceText = report.diagramType === 'lifecycle' ? page.version.files.lifecycle : page.version.files.workflow
    let candidate: any
    try { candidate = JSON.parse(sourceText!) } catch { add('graph', 'bad-json', '图源不是合法JSON'); return { report, exitCode: 1 } }
    const lifecycle = report.diagramType === 'lifecycle'
    if (candidate?.diagram_type !== report.diagramType || !Array.isArray(lifecycle ? candidate.states : candidate.nodes)) { add('graph', 'unsupported-type', '图源与登记类型不一致'); return { report, exitCode: 1 } }
    report.qualityProfile = candidate.meta?.quality_profile ?? 'standard'
    if (typeof candidate.meta?.output !== 'string' || !candidate.meta.output.trim()) { add('workflow', 'missing-output', '新版meta.output必须填写；实际渲染输出只落仓外临时目录'); return { report, exitCode: 1 } }
    stage = 'resources'
    const { parseDetails } = await import(pathToFileURL(path.join(packageRoot, 'web/assets/details.js')).href) as { parseDetails(text: string): { sections: { id: string; body: string }[] } }
    const parsed = parseDetails(page.version.files.details!)
    const { validateSourcePairing, sourceGroups } = await import(pathToFileURL(path.join(packageRoot, 'web/assets/source-pairing.js')).href) as { sourceGroups(body: string): { labels: string[]; diagnostics: unknown[] }[]; validateSourcePairing(sections: { id: string; body: string }[], nodes: any[]): { code: string; message: string; nodeId: string; sectionTitle: string; label?: string; groupIndex: number }[] }
    const entities = lifecycle ? candidate.states : candidate.nodes
    const allIds = new Set<string>()
    if (lifecycle) {
      report.stateCount = candidate.states.length; report.transitionCount = candidate.transitions?.length ?? 0
      for (const problem of lifecycleProblems(candidate)) add('graph', problem.code, problem.message, { nodeId: problem.entityId })
    } else report.nodeCount = entities.length
    for (const node of entities) {
      const id = lifecycle ? `state:${node.id}` : node.id; allIds.add(id)
      const sections = parsed.sections.filter(s => s.id === id)
      if (sections.length !== 1 || !sections[0]?.body.trim()) add('details', 'node-details-coverage', '每个节点须有唯一非空同ID长说明', { nodeId: node?.id })
    }
    if (lifecycle) for (const transition of candidate.transitions ?? []) {
      const id = `transition:${transition.id}`; allIds.add(id)
      const sections = parsed.sections.filter(section => section.id === id)
      if (sections.length !== 1 || !sections[0]?.body.trim()) add('details', 'transition-details-coverage', '每个转移须有唯一非空transition:<id>说明', { nodeId: id })
      for (const section of sections) if (sourceGroups(section.body).some(group => group.labels.length || group.diagnostics.length)) add('pairing', 'transition-source-declaration-unsupported', '转移说明不能声明源码引用，围栏示例不生效', { nodeId: id })
    }
    for (const section of parsed.sections) if (!allIds.has(section.id)) add('details', 'unknown-details-node', '长说明含图外实体ID', { nodeId: section.id })
    const pairedSections = lifecycle ? parsed.sections.filter(section => section.id.startsWith('state:')).map(section => ({ ...section, id: section.id.slice(6) })) : parsed.sections
    for (const diagnostic of validateSourcePairing(pairedSections, entities)) {
      const { code, message, ...where } = diagnostic
      add('pairing', code, message, where)
    }
    if (report.diagnostics.length) return { report, exitCode: 1 }
    stage = 'render'
    const base = await realpath(tmpdir()), rel = path.relative(repo, base)
    if (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)) throw Error('临时根在业务仓内，拒绝运行')
    temporary = await mkdtemp(path.join(base, 'specdev-check-chart-'))
    const renderer = await import(pathToFileURL(path.join(packageRoot, 'dist/archify-node.js')).href) as { renderArchify: typeof renderArchify }
    const result = await renderer.renderArchify({ repoRoot: repo, graphId: `${business}/${chart}`, candidateText: sourceText!, version: '3.0.1' }, { tempRoot: temporary })
    if (!result.ok) { let official: unknown = result.diagnostics; try { official = JSON.parse(result.diagnostics) } catch { /* 非JSON原诊断原样保留。 */ } add(stage, result.code, result.error, { official }); return { report, exitCode: result.code === 'official-rejected' ? 1 : 2 } }
    // T17已核验完整vendor指纹；再用同包官方schema验证未替换output的原始图。
    const { validateSchema } = await import(pathToFileURL(path.join(packageRoot, 'vendor/archify-3.0.1/archify/renderers/shared/validator.mjs')).href) as { validateSchema(type: string, data: unknown): void }
    try { validateSchema(report.diagramType!, candidate) } catch (error) { add('graph', 'official-schema-rejected', error instanceof Error ? error.message : String(error)); return { report, exitCode: 1 } }
    report.officialWarnings = result.diagnostics
    report.referenceCount = result.references.length
    for (const ref of result.references) {
      const read = await result.readEvidence(ref.id)
      if (!read.ok) add('sources', 'source-unreadable', read.error ?? '引用无法读取', { refId: ref.id, nodeId: ref.entityId })
    }
    report.kind = 'checked'; report.ok = report.diagnostics.length === 0
    return { report, exitCode: report.ok ? 0 : 1 }
  } catch (error) {
    add(stage, error instanceof CoreError ? error.code : 'check-unavailable', error instanceof Error ? error.message : String(error))
    return { report, exitCode: error instanceof CoreError && ['invalid-renderer', 'invalid-renderer-contract', 'evidence-conflict', 'evidence-unreadable'].includes(error.code) ? 1 : 2 }
  } finally {
    // T17未确认停止会留下子目录；保全该证据，禁止递归删除仍存活的树。
    if (temporary && !(await readdir(temporary)).length) await rmdir(temporary)
  }
}
const args = process.argv.slice(2)
const { report, exitCode } = await checkChart(args)
if (args.includes('--json')) process.stdout.write(JSON.stringify(report) + '\n')
else { const text = report.ok ? `新版${report.diagramType}校验通过：${report.diagramType === 'lifecycle' ? `${report.stateCount}状态、${report.transitionCount}转移` : `${report.nodeCount}节点`}，${report.referenceCount}引用` : report.diagnostics.map(d => `${d.code}：${d.message}`).join('\n'); (exitCode === 2 ? process.stderr : process.stdout).write(text + '\n') }
process.exitCode = exitCode
