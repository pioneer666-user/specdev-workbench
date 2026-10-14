// 自由布置可达性：一张Y=0平地、直角完整盒、保守方形人物；无见证仅表示暂未确认。
import { buildRoomWalkData } from './navigation.js';
import { createNavigator } from '../building-walk.js';
import { ValidationLimit } from './validation-budget.js';

/** 连续方盒扫掠。轴向段等于真实扫掠；斜段的联合盒更保守，绝不只检查端点。 */
export function roomSegmentClear(template,colliders,a,b,budget) {
  budget?.check();
  const {radius:r,eyeClearance:h}=template.walkProfile,room=template.interiorBounds;
  const x0=Math.min(a.x,b.x)-r,x1=Math.max(a.x,b.x)+r,z0=Math.min(a.z,b.z)-r,z1=Math.max(a.z,b.z)+r;
  if(![a.x,a.z,b.x,b.z,r,h].every(Number.isFinite)||room.minY!==0||room.maxY<h||x0<room.minX||x1>room.maxX||z0<room.minZ||z1>room.maxZ) return false;
  for(const c of colliders) {
    budget?.check();
    // 不沿用原导航脚底9cm的豁免，低矮实体也保留完整碰撞。
    if(c.y1>0&&c.y0<h&&Math.min(x1,c.x1)>Math.max(x0,c.x0)&&Math.min(z1,c.z1)>Math.max(z0,c.z0)) return false;
  }
  return true;
}

export function confirmRoomReachability(template,assembly,budget) {
  budget.stage('graph');
  const data=buildRoomWalkData(template,assembly),nav=createNavigator(data.model,data.presentation),colliders=data.presentation.colliders;
  const goals=assembly.instances.filter(i=>i.approach).map(i=>({instanceId:i.instanceId,...i.approach})),start=assembly.spawn;
  const {radius:r,eyeClearance:h}=template.walkProfile,room=template.interiorBounds,guard=0.00002;
  const clear=(a,b)=>roomSegmentClear(template,colliders,a,b,budget);
  const failure=reason=>({status:'unconfirmed',reason,routes:[]});
  if(!clear(start,start)||!nav.canStand({...start,y:0})) return failure('spawn-blocked');
  for(const g of goals) if(!clear(g,g)||!nav.canStand({...g,y:0})) return failure('stand-blocked');
  const axis=(key,lo,hi)=>{
    const values=[lo+r,hi-r,start[key],...goals.map(g=>g[key])];
    for(const c of colliders) { budget.check(); if(c.y1>0&&c.y0<h)values.push(c[key+'0']-r-guard,c[key+'1']+r+guard); }
    return [...new Set(values.filter(v=>v>=lo+r&&v<=hi-r))].sort((a,b)=>a-b);
  };
  const xs=axis('x',room.minX,room.maxX),zs=axis('z',room.minZ,room.maxZ),size=xs.length*zs.length;
  budget.bound(size,'graphNodes');
  const xIds=new Map(xs.map((v,i)=>[v,i])),zIds=new Map(zs.map((v,i)=>[v,i]));
  const id=p=>zIds.get(p.z)*xs.length+xIds.get(p.x),point=n=>({x:xs[n%xs.length],z:zs[Math.floor(n/xs.length)]});
  const root=id(start),targets=new Set(goals.map(id)),parents=new Int32Array(size).fill(-2),queue=[root];parents[root]=-1;
  let edges=0,visited=0;
  budget.stage('search');
  for(let cursor=0;cursor<queue.length;cursor++) {
    budget.check();const current=queue[cursor];visited++;targets.delete(current);if(!targets.size)break;
    const ix=current%xs.length,iz=Math.floor(current/xs.length);
    for(const[nx,nz]of [[ix-1,iz],[ix+1,iz],[ix,iz-1],[ix,iz+1]]) {
      if(nx<0||nx>=xs.length||nz<0||nz>=zs.length)continue;
      budget.bound(++edges,'graphEdges');const next=nz*xs.length+nx;
      if(parents[next]!==-2||!clear(point(current),point(next)))continue;
      parents[next]=current;queue.push(next);
    }
  }
  if(targets.size)return {...failure('finite-graph-disconnected'),graphNodes:size,visited};
  budget.stage('reconstruct');
  const routes=[];let pathPoints=0,replaySteps=0;
  for(const g of goals) {
    const path=[];
    for(let n=id(g);n!==-1;n=parents[n]) {
      budget.check();budget.bound(++pathPoints,'pathPoints');
      if(n<0||path.length>=size)throw new ValidationLimit('parent-chain-invalid','reconstruct');
      path.push(point(n));
    }
    path.reverse();const compact=[];
    for(const p of path) {
      budget.check();
      if(compact.length>=2) {const a=compact.at(-2),b=compact.at(-1);if((a.x===b.x&&b.x===p.x)||(a.z===b.z&&b.z===p.z))compact.pop();}
      compact.push(p);
    }
    routes.push({instanceId:g.instanceId,points:compact});
  }
  budget.stage('replay');
  for(const route of routes) {
    let position={...start,y:0};
    for(const p of route.points.slice(1)) {
      if(!clear(position,p))return failure('witness-recheck-failed');
      const from={...position},dx=p.x-from.x,dz=p.z-from.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/0.06));
      budget.bound(replaySteps+steps,'replaySteps');replaySteps+=steps;
      // 外层按同样<=6cm切分，让原版move内部不能占用无界时间；每步复核完整方盒，避免薄障碍穿越。
      for(let i=1;i<=steps;i++) {
        budget.check(colliders.length+1);
        const next={x:from.x+dx*i/steps,z:from.z+dz*i/steps};
        position=nav.move(position,next.x-position.x,next.z-position.z);
        if(Math.hypot(position.x-next.x,position.z-next.z)>1e-7||position.y!==0||!nav.canStand(position))return failure('navigator-recheck-failed');
      }
    }
  }
  budget.check();
  return {status:'confirmed',reason:'continuous-witness',routes,graphNodes:size,visited,edges,pathPoints,replaySteps};
}
