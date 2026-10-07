// 独立分享入口：初始化内嵌数据后复用完整产品房间，不覆盖在线fetch或宿主设置。
const data=JSON.parse(document.getElementById('room-export-data').textContent)
window.SpecDevOffline={format:'specdev-room-export/1',businessId:data.room.business.id,brightness:data.brightness,missingByInstance:data.missingByInstance,
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
