import {test} from 'node:test';
import assert from 'node:assert/strict';
import {insideLasso,lassoIds} from './selection';
import {runBulk,MAX_BULK} from './bulk';
const square=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
test('lasso includes interior and boundary but excludes exterior',()=>{
 assert.equal(insideLasso({x:5,y:5},square),true);
 assert.equal(insideLasso({x:0,y:5},square),true);
 assert.equal(insideLasso({x:11,y:5},square),false);
 assert.deepEqual(lassoIds(new Map([['a',{x:5,y:5}],['b',{x:11,y:5}]]),square),['a']);
});
test('lasso supports concave loops and either drawing direction',()=>{
 const polygon=[{x:0,y:0},{x:10,y:0},{x:10,y:4},{x:4,y:4},{x:4,y:10},{x:0,y:10}];
 for(const points of [polygon,[...polygon].reverse()]){
  assert.equal(insideLasso({x:2,y:8},points),true);
  assert.equal(insideLasso({x:8,y:8},points),false);
 }
 assert.deepEqual(lassoIds(new Map([['a',{x:1,y:1}]]),[{x:0,y:0},{x:1,y:1}]),[]);
});
test('bulk moderation serializes, deduplicates and spaces requests',async()=>{
 const sent:string[]=[],waits:number[]=[],results:string[]=[];
 await runBulk(['a','a','b'],async id=>{sent.push(id);return {ok:true};},()=>false,r=>results.push(r.userId),async ms=>{waits.push(ms);});
 assert.deepEqual(sent,['a','b']);assert.deepEqual(results,['a','b']);assert.deepEqual(waits,[500]);
});
test('bulk failures stop remaining mutations and retain per-user results',async()=>{
 const sent:string[]=[],results:{userId:string;attempted:boolean}[]=[];
 await runBulk(['a','b','c'],async id=>{sent.push(id);return {ok:id!=='b',error:'rate limit'};},()=>false,r=>results.push(r),async()=>{});
 assert.deepEqual(sent,['a','b']);assert.equal(results[2].attempted,false);
});
test('bulk cancellation and maximum size prevent unrequested work',async()=>{
 let calls=0,cancelled=false;
 await runBulk(['a','b'],async()=>{calls++;cancelled=true;return {ok:true};},()=>cancelled,()=>{},async()=>{});
 assert.equal(calls,1);
 await assert.rejects(runBulk(Array.from({length:MAX_BULK+1},(_,i)=>String(i)),async()=>{calls++;return {ok:true};},()=>false,()=>{}),/at most/);
 assert.equal(calls,1);
});

test('toxic-user shortcut excludes broadcaster, simulated users and threshold boundary',async()=>{
 const {toxicUsers,validTimeout}=await import('../shared/moderation');
 const nodes=[
  {id:'twitch:owner',score:.9,simulated:false},
  {id:'sim:fake',score:.9,simulated:true},
  {id:'twitch:boundary',score:.6,simulated:false},
  {id:'twitch:toxic',score:.61,simulated:false},
 ].map(n=>({...n,name:n.id,count:1}));
 assert.deepEqual(toxicUsers(nodes,'twitch:owner').map(n=>n.id),['twitch:toxic']);
 for(const seconds of [1,60,600,1209600])assert.equal(validTimeout(seconds),true);
 for(const seconds of [0,-1,1.5,1209601,NaN,'600',undefined])assert.equal(validTimeout(seconds),false);
});

test('zoom stays anchored to the cursor after panning and clamps at supported limits',async()=>{
 const {zoomAt}=await import('./viewport');
 const view={x:100,y:50,zoom:1};
 const zoomed=zoomAt(view,2,{x:300,y:200});
 assert.deepEqual(zoomed,{x:200,y:125,zoom:2});
 // The anchor remains 200px from the left and 150px from the top of the viewport.
 assert.equal((300-zoomed.x)*zoomed.zoom,200);
 assert.equal((200-zoomed.y)*zoomed.zoom,150);
 const restored=zoomAt(zoomed,.5,{x:300,y:200});
 assert.deepEqual(restored,view);
 assert.equal(zoomAt(view,100,{x:300,y:200}).zoom,4);
 assert.equal(zoomAt(view,.01,{x:300,y:200}).zoom,.4);
});
test('lasso remains in graph coordinates after zoom and pan',async()=>{
 const {zoomAt}=await import('./viewport');
 const view=zoomAt({x:100,y:50,zoom:1},2,{x:300,y:200});
 // SVG screen-to-local conversion maps this screen loop back into graph space.
 const screenLoop=[{x:100,y:100},{x:300,y:100},{x:300,y:300},{x:100,y:300}];
 const graphLoop=screenLoop.map(p=>({x:view.x+p.x/view.zoom,y:view.y+p.y/view.zoom}));
 assert.deepEqual(lassoIds(new Map([['inside',{x:300,y:200}],['outside',{x:500,y:400}]]),graphLoop),['inside']);
});
