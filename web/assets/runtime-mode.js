// 独立导出入口才安装此运行模式；在线页默认保持真实fetch与同源关闭协议。
export const offlineRuntime = () => window.SpecDevOffline?.format === 'specdev-room-export/1' ? window.SpecDevOffline : null
export const materialFetch = url => offlineRuntime() ? offlineRuntime().fetch(url) : fetch(url)
export function listenOfflineClose(win, frame, onClose) {
  const identifier=win.crypto.randomUUID();let bound=null
  const bind=()=>{try{bound=frame.contentDocument;if(bound)bound.documentElement.dataset.offlineHost=identifier}catch{bound=null}}
  const message=event=>{if(!bound||!frame.isConnected||frame.contentDocument!==bound||event.source!==frame.contentWindow||event.data?.type!=='archify-material-close'||event.data.documentId!==identifier)return;onClose()}
  frame.addEventListener('load',bind);win.addEventListener('message',message)
  return()=>{bound=null;frame.removeEventListener('load',bind);win.removeEventListener('message',message)}
}
