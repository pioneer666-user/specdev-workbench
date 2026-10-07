// 续行默认：产品图阅读结构、完整说明与固定远端链接；不导入旧片段/双栏阅读实现。
import {buildDetails,findSection} from '../details.js';
import {detailEntities,sourceSelection,sourceEntities} from '../chart-entities.js';
import {renderMarkdown} from '../markdown.js';
import {officialHtml} from '../official-reader.js';
import {connectChartLayout} from '../chart-layout.js';
const $=id=>document.getElementById(id),data=JSON.parse($('room-export-chart-data').textContent),frame=$('graph'),entities=detailEntities(data.version),details=buildDetails(data.version.files.details,entities);
let selection=null,opened=null,returnFocus=null,alive=true,bound=null,token='',stopLayout=()=>{},theme='light';
const closeHost=()=>{if(window.parent!==window)parent.postMessage({type:'archify-material-close',documentId:document.documentElement.dataset.offlineHost},'*');};
const valid=()=>alive&&frame.isConnected&&frame.contentDocument===bound&&frame.src==='about:srcdoc'&&frame.srcdoc===html;
function renderSources(host,entity){
  const refs=data.references.filter(ref=>ref.entityId===(entity.sourceEntityId??entity.id));
  if(refs.length){const section=document.createElement('section');section.className='detail-block';const heading=document.createElement('h3');heading.textContent='源码依据';section.append(heading);for(const ref of refs){const line=document.createElement('p'),a=document.createElement('a');a.href=ref.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`在代码仓库查看 · ${ref.label}`;a.dataset.source=ref.id;a.title=`${ref.path} · ${ref.fromLine}–${ref.toLine}行 · ${ref.commit}`;line.append(a);section.append(line);}const permissions=document.createElement('p');permissions.className='muted';permissions.textContent='代码仓库可能需要登录与访问权限';section.append(permissions);host.append(section);}
  else if(data.missingRemoteEntities.includes(entity.sourceEntityId??entity.id)){const note=document.createElement('p');note.className='muted';note.textContent='未提供远端源码';host.append(note);}
}
function show(entity,trigger){
  if(!alive||!entity)return;opened=entity;returnFocus=trigger??$('detailOpen');$('detailTitle').textContent=entity.label||entity.id;$('detailContent').replaceChildren();
  const found=findSection(details,entity.id);if(found.kind==='section')renderMarkdown($('detailContent'),found.block.body);else{$('detailContent').textContent='此项尚未提供说明。';}
  renderSources($('detailContent'),entity);$('detailSource').textContent='';if(!$('detailDialog').open)$('detailDialog').showModal();$('detailContent').scrollTop=0;
}
const groups=data.version.diagramType==='lifecycle'?[['state','状态说明'],['transition','转移说明']]:[['node','步骤说明']];
for(const[kind,title]of groups){const group=document.createElement('section');group.className='detail-block';const heading=document.createElement('h3');heading.textContent=title;group.append(heading);for(const entity of entities.filter(x=>data.version.diagramType==='workflow'||x.kind===kind)){const row=document.createElement('p'),button=document.createElement('button');button.type='button';button.className='detail-open';button.dataset.entity=entity.id;button.textContent=entity.label||entity.id;button.addEventListener('click',()=>{$('materialsDialog').close();show(entity,$('materialsOpen'));});row.append(button);group.append(row);}$('detailsPanel').append(group);}
$('materialsOpen').addEventListener('click',()=>$('materialsDialog').showModal());$('materialsClose').addEventListener('click',()=>$('materialsDialog').close());$('detailClose').addEventListener('click',()=>$('detailDialog').close());$('detailOpen').addEventListener('click',()=>show(selection));
$('detailDialog').addEventListener('close',()=>{opened=null;returnFocus?.focus({preventScroll:true});});$('materialsDialog').addEventListener('close',()=>$('materialsOpen').focus({preventScroll:true}));
for(const id of ['detailDialog','materialsDialog'])$(id).addEventListener('click',event=>{const dialog=event.currentTarget,rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();});
function applyTheme(){try{theme=parent.document.documentElement.dataset.theme==='dark'?'dark':'light';}catch{theme='light';}document.documentElement.dataset.theme=theme;if(valid())bound.dispatchEvent(new bound.defaultView.CustomEvent('specdev-chart-theme',{detail:{mode:theme}}));}
applyTheme();const html=officialHtml(data.html,theme).replace('</head>','<style id="share-single-title">html[data-specdev-natural-height="true"]:not([data-present="true"]) .header-row{display:none}</style></head>');
function message(event){const value=event.data;if(!valid()||event.source!==frame.contentWindow||!value||value.type!=='specdev-official'||value.token!==token||value.contextId!==data.contextId)return;
  if(value.action==='selection'){const raw=sourceEntities(data.version).find(x=>x.id===value.entityId);selection=raw?sourceSelection(data.version,raw.id):null;$('selectionBar').hidden=!selection;$('selectionText').textContent=selection?`已选：${selection.label}`:'';$('detailOpen').hidden=!selection;}
  else if(value.action==='escape'){if($('detailDialog').open)$('detailDialog').close();else if($('materialsDialog').open)$('materialsDialog').close();else closeHost();}
}
window.addEventListener('message',message);
frame.addEventListener('load',()=>{if(!alive||frame.srcdoc!==html)return;try{bound=frame.contentDocument;token=crypto.randomUUID();const config=bound.createElement('script');config.type='application/json';config.id='specdev-official-config';config.textContent=JSON.stringify({contextId:data.contextId,token,refs:data.references,entities:sourceEntities(data.version).map(x=>x.id)});const script=bound.createElement('script');script.textContent=data.bridge;bound.head.append(config,script);stopLayout=connectChartLayout(frame,'about:srcdoc',{official:true,onFailure:text=>{$('layoutWarning').hidden=false;$('layoutWarning').textContent=text;}});applyTheme();}catch(error){$('layoutWarning').hidden=false;$('layoutWarning').textContent='图连接失败：'+error.message;}});
frame.src='about:srcdoc';frame.srcdoc=html;
const observer=new MutationObserver(applyTheme);try{observer.observe(parent.document.documentElement,{attributes:true,attributeFilter:['data-theme']});}catch{/* 不读取其他来源。 */}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))closeHost();});
window.addEventListener('pagehide',()=>{alive=false;bound=null;stopLayout();observer.disconnect();window.removeEventListener('message',message);frame.removeAttribute('srcdoc');},{once:true});
