// 独立分享入口：初始化内嵌数据后复用完整产品房间，不覆盖在线fetch或宿主设置。
import { AMBIENCE_BASE, AMBIENCE_TRACKS } from '../rooms/ambience-presets.js'
import { FOOTSTEP_BASE, footstepResource } from '../rooms/footstep-surfaces.js'
import { rainResource } from '../rooms/rain-presets.js'
const data=JSON.parse(document.getElementById('room-export-data').textContent)
window.SpecDevOffline={format:'specdev-room-export/1',businessId:data.room.business.id,brightness:data.brightness,missingByInstance:data.missingByInstance,
  async rainBytes(key, signal) {
    if (signal.aborted) throw new DOMException('雨声加载已取消', 'AbortError')
    const encoded=data.resources[rainResource(key)], prefix='data:audio/wav;base64,'
    if (typeof encoded!=='string'||!encoded.startsWith(prefix)) throw new Error('离线雨声资源缺失')
    return Uint8Array.from(atob(encoded.slice(prefix.length)),char=>char.charCodeAt(0)).buffer
  },
  async footstepBytes(key, signal) {
    if (signal.aborted) throw new DOMException('脚步加载已取消', 'AbortError')
    const resource = footstepResource(key), prefix = `data:${resource.mime};base64,`
    const encoded = data.resources[FOOTSTEP_BASE + resource.file]
    if (typeof encoded !== 'string' || !encoded.startsWith(prefix)) throw new Error('离线脚步资源缺失')
    return Uint8Array.from(atob(encoded.slice(prefix.length)), char => char.charCodeAt(0)).buffer
  },
  async audioBytes(key, signal) {
    if (signal.aborted) throw new DOMException('声音加载已取消', 'AbortError')
    if (!AMBIENCE_TRACKS.includes(key)) throw new Error('声音资源不在固定目录')
    const encoded = data.resources[`${AMBIENCE_BASE}${key}.mp3`]
    if (typeof encoded !== 'string' || !encoded.startsWith('data:audio/mpeg;base64,')) throw new Error('离线声音资源缺失')
    const bytes = Uint8Array.from(atob(encoded.slice('data:audio/mpeg;base64,'.length)), char => char.charCodeAt(0))
    return bytes.buffer
  },
  previewImage:url=>typeof data.resources[url]==='string'&&data.resources[url].startsWith('data:image/webp;base64,')?data.resources[url]:null,
  async fetch(value){const path=String(value).split('?')[0],q=new URLSearchParams(String(value).split('?')[1]||'');
    if(path==='/specdev-workbench/api/room')return new Response(JSON.stringify(data.room),{status:200})
    if(Object.hasOwn(data.resources,path))return new Response(JSON.stringify(data.resources[path]),{status:200})
    const doc=path==='/specdev-workbench/api/doc'?data.documents.find(x=>x.path===q.get('path')):null
    return doc?new Response(doc.text,{status:200}):new Response(JSON.stringify({error:'此资料未随包导出'}),{status:404})
  },chartDocument:id=>data.charts[id]?.page||null,loadScene:()=>import('../room-scene.js')}
window.SpecDevTheme={get:()=>({mode:data.theme}),subscribe:()=>()=>{}}
document.documentElement.dataset.theme=data.theme
let previousPeriod
const observer=new MutationObserver(()=>{const period=document.body.dataset.period;if(previousPeriod!==undefined&&period!==previousPeriod)document.documentElement.dataset.theme=period==='night'?'dark':'light';previousPeriod=period})
observer.observe(document.body,{attributes:true,attributeFilter:['data-period']})
window.addEventListener('pagehide',()=>observer.disconnect(),{once:true})
void import('../room.js')
