import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {io} from 'socket.io-client';
const base='http://127.0.0.1:3000';
const response=await fetch(`${base}/api/session`);
assert.ok(response.ok);
const cookie=response.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const socket=io(base,{transports:['websocket'],extraHeaders:{Cookie:cookie}});
let latest;
socket.on('snapshot',snapshot=>{latest=snapshot;});
async function until(predicate,timeout=12000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(predicate())return;await sleep(40);}
 throw new Error('Timed out waiting for simulation state.');
}
const moderate=(userId,action,duration,mode='simulation')=>new Promise((resolve,reject)=>socket.timeout(5000).emit('moderate',{userId,action,duration,mode},(error,result)=>error?reject(error):resolve(result)));
try{
 await until(()=>latest);
 socket.emit('reset');await until(()=>latest.messages.length===5&&!latest.running);
 socket.emit('simulate');
 await until(()=>new Set(latest.edges.filter(edge=>edge.score>.6).map(edge=>edge.target)).size>=3);
 assert.ok(latest.messages.some(m=>m.mentions.length>1));
 assert.ok(latest.alerts.length);
 const topWord=latest.toxicWords[0];
 assert.equal(topWord.word,'trash');
 assert.ok(topWord.users.length>=5);
 assert.ok(topWord.users.every(user=>latest.nodes.some(node=>node.id===user.userId)));
 assert.ok(topWord.users.some(user=>user.userId==='sim:echo_01'));
 const supporter=latest.support.users.find(user=>user.userId==='sim:echo_02');
 assert.equal(supporter.simulated,true);
 assert.equal(supporter.activeGiftedSubs,12);
 assert.equal(supporter.reportedTotalGifted,50);
 assert.equal(supporter.currentSubscriber,true);
 const id='sim:echo_01';
 const banned=await moderate(id,'ban');assert.deepEqual(banned,{ok:true,simulated:true});
 await until(()=>latest.nodes.find(n=>n.id===id)?.restriction==='ban');
 assert.ok(latest.edges.every(edge=>edge.source!==id));
 assert.ok(latest.messages.every(m=>m.userId!==id));
 assert.ok(latest.toxicWords.every(word=>word.users.every(user=>user.userId!==id)));
 assert.ok(latest.moderation.find(entry=>entry.userId===id)?.simulated);
 const unbanned=await moderate(id,'unban');assert.ok(unbanned.ok&&unbanned.simulated);
 await until(()=>latest.nodes.find(n=>n.id===id)?.restriction===undefined&&latest.messages.some(m=>m.userId===id));
 assert.ok((await moderate(id,'timeout',1)).ok);
 await until(()=>latest.nodes.find(n=>n.id===id)?.restriction==='timeout');
 await until(()=>latest.nodes.find(n=>n.id===id)?.restriction===undefined,4000);
 assert.equal((await moderate('twitch:someone','ban')).ok,false);
 assert.equal((await moderate('sim:Kai','ban')).ok,false);
 assert.equal((await moderate(id,'timeout',0)).ok,false);
 assert.equal((await moderate(id,'ban',undefined,'live')).ok,false);
 socket.emit('reset');
 await until(()=>latest.messages.length===5&&!latest.running&&latest.moderation.length===0);
 console.log('PASS: multi-target network, structured mentions, toxic-word counts/authors, labelled support figures, simulated ban/unban/timeout expiry, action labels, identity/mode rejection and reset. No Twitch API calls.');
}finally{socket.disconnect();}
