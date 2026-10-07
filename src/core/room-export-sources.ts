// 仅将已经由官方渲染器验证的引用投影为分享元数据；不读取源码或联网。
import {createHash} from 'node:crypto'
// @ts-expect-error 固定官方纯JS契约没有TypeScript声明，原文件保持只读。
import {parseRepositoryRemote,repositorySourceHref} from '../../vendor/archify-3.0.1/archify/renderers/shared/repository-location.mjs'
export function exportReferences(graph:any,type:'workflow'|'lifecycle',graphId:string,refs:readonly any[]){
  const repo=graph.meta?.repository,location=parseRepositoryRemote(repo?.url,{authored:true}),entities=graph[type==='lifecycle'?'states':'nodes']
  if(!location||!['github','gitee'].includes(location.provider)||location.protocol!=='https:'||location.endpoint!=='standard'||!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(location.path)||!/^[a-f0-9]{40}$/i.test(repo.revision))throw Error('来源链接仅支持合法HTTPS托管站和完整固定提交')
  const count=entities.reduce((n:number,node:any)=>n+(node.sources?.length||0),0)
  if(count!==refs.length||new Set(refs.map(ref=>ref.id)).size!==refs.length)throw Error('官方来源数量或身份重复')
  return refs.map(ref=>{
    const source=entities.find((node:any)=>node.id===ref.entityId)?.sources?.[ref.sourceIndex],label=source?.label??`引用 ${ref.sourceIndex+1}`
    if(!source||ref.graphId!==graphId||ref.diagramType!==type||source.path!==ref.path||source.line!==ref.fromLine||(source.end_line??source.line)!==ref.toLine||ref.label!==label||ref.commit!==repo.revision.toLowerCase()||ref.repositoryIdentity!==location.identity||ref.repositoryUrl!==location.url)throw Error('官方来源实体/路径/标签/行界/版本身份不一致')
    const id='ref-'+createHash('sha256').update(JSON.stringify([type,ref.entityId,ref.sourceIndex,location.identity,ref.commit,ref.path,ref.fromLine,ref.toLine,ref.label])).digest('hex')
    const href=repositorySourceHref(location.provider,location.url,ref.commit,{path:ref.path,line:ref.fromLine,endLine:ref.toLine})
    if(ref.id!==id||ref.href!==href)throw Error('固定来源ID或链接不一致')
    return{id:ref.id,graphId,diagramType:type,entityId:ref.entityId,sourceIndex:ref.sourceIndex,repositoryIdentity:location.identity,repositoryUrl:location.url,commit:ref.commit,path:ref.path,fromLine:ref.fromLine,toLine:ref.toLine,label:ref.label,href,authoredLabel:source.label||source.path.split('/').at(-1)}
  })
}
