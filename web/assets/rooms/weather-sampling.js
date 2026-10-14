// 显式验收使用的有限单房三段协议。每段5秒预热+15秒；配置变化即停，完成段不重采。
export const SAMPLING_LIMITS=Object.freeze({warmup:5000,record:15000,frames:4096,segments:6})
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
export function createWeatherSampling({room,record,snapshot,configure,onChange=()=>{},onRoomComplete=()=>{}}) {
  let active=false,phase='idle',rain=null,started=null,previous=null,frames=[],startActual=null,expectedCamera=null,expectedConfiguration=null
  record.cameras??={};record.configurations??={}
  const plans=[0,55,92],key=value=>`${room}:${value}`
  function save() { record.phase=phase;record.currentRoom=room;record.currentRain=rain;onChange(record) }
  function pause(reason) {
    if(!active)return
    active=false;phase='interrupted'
    record.interruptions.push({room,rain,reason,date:new Date().toISOString(),frames,startActual,lastActual:snapshot()})
    frames=[];save()
  }
  function next() {
    const value=plans.find(v=>!record.segments.some(s=>s.key===key(v)))
    if(value===undefined){active=false;phase='room-complete';configure(0);save();onRoomComplete();return}
    rain=value;frames=[];started=previous=null;phase='warming'
    if(!configure(value)){pause('页面当前不可采样');return}
    startActual=snapshot();expectedCamera=startActual.camera
    expectedConfiguration=startActual.configuration??null
    if(expectedCamera.mode!=='overview'){pause('采样必须使用固定总览观察位');return}
    if(record.cameras[room]&&!same(record.cameras[room],expectedCamera)){pause('相机与已完成段不同，请恢复原固定总览');return}
    if(Object.hasOwn(record.configurations,room)&&!same(record.configurations[room],expectedConfiguration)){pause('房间配置与已完成段不同，请恢复原门/家具显示/选择/图标设置');return}
    record.cameras[room]??=expectedCamera;record.configurations[room]??=expectedConfiguration
    if(value===0&&(startActual.weather.created!==0||startActual.weather.live.resources!==0)){pause('晴天基线必须从未启用天气');return}
    save()
  }
  function start() {
    if(active)return false
    const current=snapshot()
    if(!record.viewport)record.viewport=current.viewport
    if(!same(record.viewport,current.viewport)){record.warning='视口与原记录不同；保留原记录，请恢复原尺寸/缩放后继续';save();return false}
    delete record.warning
    if(!Object.hasOwn(record,'quality'))record.quality=current.quality??null
    if(!same(record.quality,current.quality??null)){record.warning='渲染画质/设备条件与原记录不同，保留数据，请恢复原条件';save();return false}
    active=true;next();return active
  }
  function frame(data) {
    if(!active)return
    const actual=snapshot()
    if(!actual||!same(actual.viewport,record.viewport)||!same(actual.quality??null,record.quality)||!same(actual.camera,expectedCamera)||!same(actual.configuration??null,expectedConfiguration)||actual.brightness.value!==100||actual.brightness.period!=='day'||actual.weather.value!==rain||actual.audio?.enabled===true||actual.audio?.rain.sources>0){pause('视口、相机或实验配置变化');return}
    const now=data.now
    if(!Number.isFinite(now)){pause('帧时钟无效');return}
    if(started===null){started=now;return}
    if(phase==='warming') {
      if(now-started<SAMPLING_LIMITS.warmup)return
      phase='recording';started=now;previous=now;save();return
    }
    const interval=now-previous;previous=now
    if(interval<0){pause('帧时钟倒退');return}
    if(frames.length>=SAMPLING_LIMITS.frames){pause('帧记录达到有限上限');return}
    frames.push([Number(interval.toFixed(3)),data.calls,data.triangles,data.lines,data.points,actual.weather.live.rain,actual.weather.live.splashes])
    if(now-started>=SAMPLING_LIMITS.record){
      const sorted=frames.map(f=>f[0]).sort((a,b)=>a-b),percent=p=>sorted[Math.floor((sorted.length-1)*p)]
      record.segments.push({key:key(rain),room,rain,warmupMs:SAMPLING_LIMITS.warmup,recordMs:now-started,frames,medianMs:percent(.5),p95Ms:percent(.95),over33:sorted.filter(v=>v>33.34).length,over50:sorted.filter(v=>v>50).length,startActual,endActual:actual})
      frames=[];next()
    }
  }
  return{start,frame,pause,get:()=>({active,phase,rain}),dispose(){pause('离开采样页')}}
}
