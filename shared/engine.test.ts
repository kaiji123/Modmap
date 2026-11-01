import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine,detect,jaccard,normalize,toxicity,targets} from './engine';
import type {ChatEvent} from './types';
const now=1_000_000;
const event=(i:number,overrides:Partial<ChatEvent>={}):ChatEvent=>({id:`m${i}`,userId:`sim:${i}`,userName:`echo${i}`,text:'you are tr4sh at this game',mentions:['target'],ts:now,simulated:true,...overrides});
test('normalizes disguised insults without flagging substrings',()=>{assert.equal(normalize('tr4\u200bsh'),'trash');assert.equal(toxicity('i d i o t'),.9);assert.equal(toxicity('trashing the cache'),0);});
test('similarity ignores word order and duplicate words',()=>{assert.equal(jaccard('hello hello world','world hello'),1);assert.equal(jaccard('',''),0);});
test('requires distinct senders and similar flagged messages',()=>{const raid=Array.from({length:6},(_,i)=>event(i));assert.equal(detect(raid,now)[0].senders,6);assert.equal(detect(raid.map(e=>({...e,userId:'one'})),now).length,0);assert.equal(detect(raid.map(e=>({...e,text:'nice play'})),now).length,0);assert.equal(detect(raid,now+31_000).length,0);});
test('deduplicates targets and avoids self edges',()=>assert.deepEqual(targets(event(0,{replyToUserId:'target',mentions:['target','sim:0']})),['target']));
test('does not merge simulated and real evidence',()=>{assert.equal(detect(Array.from({length:6},(_,i)=>event(i,{simulated:i<3})),now).length,0);});
test('masks originals, deduplicates ingest, and expires data',()=>{const engine=new Engine();engine.ingest(event(0));engine.ingest(event(0));const snap=engine.snapshot(now);assert.equal(snap.messages.length,1);assert.ok(!JSON.stringify(snap).includes('tr4sh'));assert.equal(engine.reveal('m0'),'you are tr4sh at this game');assert.equal(engine.snapshot(now).reveals,1);assert.equal(engine.snapshot(now+121_000).nodes.length,0);assert.equal(engine.reveal('m0'),undefined);});

test('reports each shared target accurately',()=>{const raid=Array.from({length:6},(_,i)=>event(i,{mentions:['alice','bob']}));assert.deepEqual(detect(raid,now).map(a=>a.target).sort(),['alice','bob']);});
