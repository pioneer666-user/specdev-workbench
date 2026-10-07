// 构建脚本：esbuild 把 src/dsh/index.ts（连带 src/core）打成 dist/index.js（ESM，node 平台），
// 再把建筑诊断命令行 src/cli/check-building.ts 打成 dist/check-building.js（建房 Skill 用，随包分发）。
// 发布流程：tsc --noEmit（类型检查）→ 本脚本 → npm pack。esbuild 不做类型检查。
import { build } from 'esbuild'
import { rmSync, mkdirSync } from 'node:fs'
import { buildOffline } from './offline-build.mjs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })
const shared = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  banner: {
    js: '// 构建产物：由 scripts/build.mjs 从 src/ 生成，请勿手改。\n',
  },
  logLevel: 'info',
}
await build({ ...shared, entryPoints: ['src/dsh/index.ts'], outfile: 'dist/index.js' })
console.log('已生成 dist/index.js')
await build({ ...shared, entryPoints: ['src/cli/check-building.ts'], outfile: 'dist/check-building.js' })
console.log('已生成 dist/check-building.js')
await build({ ...shared, entryPoints: ['src/cli/check-room.ts'], outfile: 'dist/check-room.js' })
console.log('已生成 dist/check-room.js')
// 内部底座须独立随包调用；仅装配自有core，官方原样模块从同包vendor动态定位。
await build({ ...shared, entryPoints: ['src/core/archify-render.ts'], outfile: 'dist/archify-node.js' })
console.log('已生成 dist/archify-node.js（内部接口，尚未接页面）')
await build({ ...shared, entryPoints: ['src/cli/check-chart.ts'], outfile: 'dist/check-chart.js' })
console.log('已生成 dist/check-chart.js')
await build({ ...shared, entryPoints: ['src/core/room-export.ts'], outfile: 'dist/room-export.js' })
await buildOffline()
console.log('已生成 dist/room-export.js（内部导出底座，无用户入口）')
