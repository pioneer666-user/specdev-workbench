import { createWeatherSampling } from './weather-sampling.js'
const KEY='specdev-t44-explicit-sampling/1',ROOMS=['fairy-study','ceramic-study']
function downloadRecord(record){const blob=new Blob([JSON.stringify(record,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=record.runId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
// 此模块只由 ?t44-acceptance=1 动态加载。sessionStorage仅存作者显式采样证据，不存天气/声音偏好。
export async function installWeatherAcceptance({scene,sound,room,urlForRoom,fetchJson,isAlive,canStart=()=>true,onLock=()=>{},navigate=url=>location.assign(url)}) {
  if(!ROOMS.includes(room))throw Error('T44验收仅用于固定两房资料样例')
  const identity=await fetchJson('/specdev-workbench/assets/rooms/weather-build.json')
  if(!isAlive())return {pause(){},dispose(){}}
  const host={origin:location.origin,workspace:new URLSearchParams(location.search).get('workspace'),packageSha256:new URLSearchParams(location.search).get('t44-package')}
  let saved=null
  try{saved=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
  let record=saved,disposed=false,finishing=false,generation=0
  if(record&&(record.identity.id!==identity.id||JSON.stringify(record.host)!==JSON.stringify(host))){
    const panel=document.createElement('section'),text=document.createElement('p'),save=document.createElement('button');panel.className='room-t44-acceptance';text.textContent='既有采样属于其他候选或宿主，已保留。请保存旧记录后交执行核对；本页不混采或覆盖。';save.type='button';save.textContent='保存旧采样记录';save.addEventListener('click',()=>downloadRecord(record));panel.append(text,save);document.body.append(panel)
    return{pause(){},dispose(){panel.remove()}}
  }
  if(!record)record={format:'specdev-t44-sampling/1',runId:`T44-${Date.now()}`,identity,host,device:{userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null},viewport:null,segments:[],interruptions:[],closures:[],phase:'idle',complete:false}
  const panel=document.createElement('section'),text=document.createElement('p'),button=document.createElement('button'),download=document.createElement('button')
  panel.className='room-t44-acceptance';panel.setAttribute('aria-label','T44显式验收采样')
  button.type=download.type='button';download.textContent='保存采样记录'
  panel.append(text,button,download);document.body.append(panel)
  function persist(){
    if(record.phase==='interrupted'){scene.configureAcceptance(0);scene.endAcceptance();onLock(false)}
    sessionStorage.setItem(KEY,JSON.stringify(record));render()
  }
  function render(){
    const state=sampler?.get()
    button.disabled=!!state?.active||finishing||record.complete||!!record.blocked
    button.textContent=record.segments.length?'继续未完成采样':'开始两房六段采样（约2分钟）'
    text.textContent=record.complete?'六段已完成，天气已归零。请保存采样记录。':record.blocked||state?.active?`${room==='fairy-study'?'森林':'陶瓷'} · 雨量 ${state?.rain??0}% · ${state?.phase==='warming'?'预热':'记录'} · 已完成 ${record.segments.length}/6。请保持前台、窗口大小和缩放。`:'采样保持白昼、固定总览和静音；每房先记录首次晴天，再测中雨和大雨。失焦或改变尺寸会停下并保留记录。'
    if(record.blocked)text.textContent=record.blocked
    if(record.warning)text.textContent=record.warning
    if(record.phase==='interrupted')text.textContent=`采样已暂停：${record.interruptions.at(-1)?.reason}。完成 ${record.segments.length}/6，保存记录后可在相同条件下继续缺少的段。`
  }
  let sampler=createWeatherSampling({room,record,snapshot:()=>({...scene.getAcceptanceSnapshot(),audio:sound.get()}),configure:value=>scene.configureAcceptance(value),onChange:persist,onRoomComplete:()=>{void finishRoom()}})
  async function finishRoom(){
    const current=++generation;finishing=true;render()
    // 等正常房间帧完成0雨的280ms回收；不另开天气渲染器或人工负载。
    const began=performance.now()
    while(!disposed&&current===generation&&scene.getWeather()?.live.resources&&performance.now()-began<2000)await new Promise(resolve=>setTimeout(resolve,80))
    if(disposed||current!==generation)return
    const actual=scene.getAcceptanceSnapshot()
    if(actual.weather.live.resources){finishing=false;record.blocked='雨停后天气资源未归零，保留数据并返回执行检查';persist();return}
    record.closures.push({room,actual,audio:sound.get(),date:new Date().toISOString()})
    const other=ROOMS.find(id=>!record.segments.some(s=>s.room===id&&s.rain===92))
    if(other){record.phase='transfer';record.nextRoom=other;persist();const url=new URL(urlForRoom(other),location.href);url.searchParams.set('t44-acceptance','1');if(host.packageSha256)url.searchParams.set('t44-package',host.packageSha256);navigate(url.href)}
    else{record.complete=record.segments.length===6;record.phase='complete';finishing=false;scene.endAcceptance();onLock(false);persist()}
  }
  async function start(){
    if(disposed||record.complete||sampler.get().active)return
    if(!canStart()){text.textContent='请先关闭设置、家具、阅读或分享窗口，再开始采样。';return}
    await sound.setEnabled(false);await sound.settleRain()
    if(!isAlive())return
    if(!scene.beginAcceptance(data=>sampler.frame(data))){text.textContent='当前页面尚不可采样';return}
    onLock(true);sampler.start();if(!sampler.get().active&&!finishing){scene.endAcceptance();onLock(false)}render()
  }
  function saveDownload(){downloadRecord(record)}
  const pause=reason=>{if(!disposed&&record.phase!=='transfer'){
    generation++
    if(finishing){record.interruptions.push({room,reason,stage:'雨停回收',date:new Date().toISOString(),lastActual:scene.getAcceptanceSnapshot()});record.phase='interrupted';finishing=false}
    sampler.pause(reason);scene.configureAcceptance(0);scene.endAcceptance();onLock(false);persist()
  }}
  const blur=()=>pause('窗口失焦'),hidden=()=>{if(document.hidden)pause('页面隐藏')},freeze=()=>pause('页面冻结'),error=()=>pause('页面运行错误')
  window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);document.addEventListener('freeze',freeze);window.addEventListener('error',error)
  button.addEventListener('click',()=>{void start()});download.addEventListener('click',saveDownload)
  render()
  // 只有本轮正常跨房导航才自动接力；作者重新点设置入口必须再明确点开始。
  const transfer=new URLSearchParams(location.search).get('t44-entry')!=='1'&&record.phase==='transfer'&&record.nextRoom===room
  if(transfer){record.phase='idle';delete record.nextRoom;persist();void start()}
  return {pause,dispose(){if(disposed)return;generation++;if(record.phase!=='transfer')sampler.dispose();disposed=true;scene.endAcceptance();onLock(false);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);document.removeEventListener('freeze',freeze);window.removeEventListener('error',error);panel.remove()}}
}
