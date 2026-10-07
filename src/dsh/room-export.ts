// 导出请求不留下载任务：认证/项目解析由统一入口完成，响应只作为附件。
import type {IncomingMessage,ServerResponse} from 'node:http'
import {prepareRoomExport,generateRoomExport,readRoomExportCatalog} from '../core/room-export.ts'

export function createRoomExportRequests(){
  let active:AbortController|null=null,disposed=false
  return {
    dispose(){disposed=true;active?.abort()},
    async catalog(root:string,business:string){return readRoomExportCatalog({repoRoot:root,businessId:business})},
    async generate(req:IncomingMessage,res:ServerResponse,root:string,business:string,body:any,stillAuthorized:()=>boolean){
      if(disposed||active){reply(res,409,{code:'export-busy',error:'已有导出正在处理或收尾，请稍后再操作'});return}
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['materials','theme','brightness'].includes(key))||!Array.isArray(body.materials)||body.materials.length>80||body.materials.some((entry:any)=>!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).sort().join(',')!=='id,identity'||typeof entry.id!=='string'||entry.id.length>1024||typeof entry.identity!=='string'||!/^[a-f0-9]{64}$/.test(entry.identity))||new Set(body.materials.map((x:any)=>x.id)).size!==body.materials.length||!['light','dark'].includes(body.theme)||!Number.isInteger(body.brightness)||body.brightness<0||body.brightness>100){reply(res,400,{code:'export-input',error:'导出仅接受当前资料ID及清单身份、浅深主题和0–100亮度'});return}
      const controller=new AbortController();active=controller
      const abort=()=>{if(!res.writableFinished)controller.abort()}
      req.once('aborted',abort);res.once('close',abort)
      try{
        const verify=async()=>{const catalog=await readRoomExportCatalog({repoRoot:root,businessId:business});for(const entry of body.materials){const current=catalog.materials.find(x=>x.id===entry.id);if(!current||current.identity!==entry.identity){reply(res,409,{code:'export-changed',error:'所选资料已删除或身份变化，请关闭后重新打开资料清单',issues:[{code:'export-changed',message:'所选资料已删除或身份变化',materialId:entry.id}]});return false}}return true}
        if(!await verify()||controller.signal.aborted)return
        const prepared=await prepareRoomExport({repoRoot:root,businessId:business},{materials:body.materials.map((x:any)=>x.id),theme:body.theme,brightness:body.brightness,signal:controller.signal})
        if(controller.signal.aborted)return
        if(!prepared.ok){reply(res,422,{code:prepared.issues[0]?.code,error:'导出未完成，请核对所选资料',issues:prepared.issues});return}
        if(!await verify()||controller.signal.aborted)return
        const generated=await generateRoomExport(prepared.prepared,{signal:controller.signal})
        if(controller.signal.aborted)return
        if(!generated.ok){reply(res,422,{code:generated.issues[0]?.code,error:'导出未完成',issues:generated.issues});return}
        if(!stillAuthorized()){reply(res,403,{code:'export-context-changed',error:'项目访问上下文已变化，请重新进入房间'});return}
        const filename=encodeURIComponent(generated.filename).replace(/[!'()*]/g,x=>'%'+x.charCodeAt(0).toString(16).toUpperCase())
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="room-share.html"; filename*=UTF-8''${filename}`,'Content-Length':generated.bytes,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'X-Room-Export-SHA256':generated.sha256})
        res.end(generated.html)
      }catch{if(!controller.signal.aborted)reply(res,422,{code:'export-read',error:'房间或资料清单读取失败，请检查当前业务登记与文件'})}
      finally{req.off('aborted',abort);res.off('close',abort);if(active===controller)active=null}
    },
  }
}
function reply(res:ServerResponse,status:number,body:unknown){if(res.destroyed||res.headersSent)return;const text=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Content-Length':Buffer.byteLength(text)});res.end(text)}
