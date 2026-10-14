// 使用现有设置窗口/焦点闸门；天气和音频偏好只在本页，无持久化写入。
export function createWeatherSettings({ root, scene, sound, canInteract, acceptanceUrl=null }) {
  const doc=root.ownerDocument, get=id=>doc.getElementById(id), listeners=[]
  let disposed=false, message='晴天 · 雨停后恢复原房间外观'
  const usable=()=>!disposed&&!get('settingsWeatherPanel').hidden&&canInteract()
  function sync() {
    if(disposed)return
    const value=scene.getWeather?.()?.value??0
    get('rainAmount').value=String(value);get('rainAmountValue').textContent=`${Math.round(value)}%`
    get('weatherStatus').textContent=message
    for(const node of [get('rainAmount'),...root.querySelectorAll('[data-rain]')])node.disabled=!usable()
    get('weatherAcceptanceLink').toggleAttribute('inert',!usable())
  }
  function set(value) {
    if(!usable())return
    try {
      if(!scene.setSettingsRain(value))return
      void sound.setRain(value)
      message=value===0?'晴天 · 雨已停，地面正在恢复干燥':`雨量 ${Math.round(value)}% · 室内保持干燥`
    } catch(error) { message=`雨景未能开启：${error.message}` }
    sync()
  }
  const listen=(node,type,fn)=>{node.addEventListener(type,fn);listeners.push([node,type,fn])}
  listen(get('rainAmount'),'input',()=>set(Number(get('rainAmount').value)))
  for(const node of root.querySelectorAll('[data-rain]'))listen(node,'click',()=>set(Number(node.dataset.rain)))
  get('weatherAcceptanceEntry').hidden=!acceptanceUrl
  if(acceptanceUrl)get('weatherAcceptanceLink').href=acceptanceUrl
  listen(get('weatherAcceptanceLink'),'click',event=>{if(!acceptanceUrl||!usable())event.preventDefault()})
  sync()
  return {sync,dispose(){if(disposed)return;disposed=true;for(const[node,type,fn]of listeners)node.removeEventListener(type,fn)}}
}
