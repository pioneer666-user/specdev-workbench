// 离线图只桥接选中/ESC；固定来源保留原生外链动作，不启用在线证据弹层。
(() => {
  const config=JSON.parse(document.getElementById('specdev-official-config').textContent),svg=document.querySelector('.diagram-container > svg')
  if(!svg)return
  let alive=true,nativeOverlay=false
  const send=(action,fields={})=>{if(alive)parent.postMessage({type:'specdev-official',contextId:config.contextId,token:config.token,action,...fields},'*')}
  const selection=()=>{const nodes=[...svg.querySelectorAll('[data-node-id][data-focus-selected]')],id=nodes.length===1?nodes[0].getAttribute('data-node-id'):null;return config.entities.includes(id)?id:null}
  const sync=()=>{send('selection',{entityId:selection()});for(const link of document.querySelectorAll('#focus-evidence-links a.semantic-passport-source')){link.target='_blank';link.rel='noopener noreferrer'}}
  const open=event=>{
    if(event.type==='click'&&(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey))return
    if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return
    const link=event.target.closest?.('.semantic-passport-source'),container=document.getElementById('focus-evidence-links');if(!link||!container?.contains(link))return
    const id=selection();if(!id||document.getElementById('focus-id')?.textContent!==id)return
    const index=[...container.querySelectorAll('.semantic-passport-source')].indexOf(link),ref=config.refs.find(x=>x.entityId===id&&x.sourceIndex===index)
    if(!ref||!ref.href||link.href!==ref.href||link.querySelector('small')?.textContent!==ref.path)return
    const line=`L${ref.fromLine}${ref.toLine!==ref.fromLine?'–'+ref.toLine:''} ↗`
    if(link.querySelector('strong')?.textContent!==ref.authoredLabel||link.querySelector('code')?.textContent!==line)return
    link.target='_blank';link.rel='noopener noreferrer'
  }
  const capture=event=>{if(event.key==='Escape')nativeOverlay=document.documentElement.getAttribute('data-reader-rail')==='overlay'}
  const key=event=>{open(event);if(event.key==='Escape'&&!event.defaultPrevented&&!nativeOverlay&&!document.querySelector('dialog[open]'))send('escape')}
  const observer=new MutationObserver(sync);observer.observe(svg,{subtree:true,attributes:true,attributeFilter:['data-focus-selected']})
  const dispose=()=>{if(!alive)return;alive=false;observer.disconnect();document.removeEventListener('click',open,true);document.removeEventListener('keydown',capture,true);document.removeEventListener('keydown',key);window.removeEventListener('pagehide',dispose)}
  window.SpecDevOfficialBridge?.dispose();window.SpecDevOfficialBridge={dispose};document.addEventListener('click',open,true);document.addEventListener('keydown',capture,true);document.addEventListener('keydown',key);window.addEventListener('pagehide',dispose);sync()
})()
