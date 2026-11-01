import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutoBan,parseAutoBanConfig,matchingAutoBanWord,supportExclusion} from './autoban';
import {simulatedSupport} from './support';
import type {AutoBanConfig,ChatEvent,SupportData} from '../shared/types';
const configuration=(overrides:Partial<AutoBanConfig>={}):AutoBanConfig=>({enabled:true,words:['trash'],excludeGiftGivers:false,excludeSubscribers:false,...overrides});
const event=(id:string,userId='sim:echo_01',text='you are tr4sh'):ChatEvent=>({id,userId,userName:userId.slice(4),text,mentions:[],ts:Date.now(),simulated:true});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function idle(rule:AutoBan){for(let i=0;i<30;i++){if(!rule.snapshot().pending)return;await settle();}throw new Error('Autoban did not settle');}
function fixture(){
 const calls:string[]=[],waits:number[]=[];
 const rule=new AutoBan({mode:'simulation',broadcaster:()=>undefined,allowed:()=>true,support:async id=>simulatedSupport([id]),ban:async e=>{calls.push(e.userId);return {ok:true,simulated:true};},changed:()=>{},wait:async ms=>{waits.push(ms);}});
 return {rule,calls,waits};
}
test('autoban settings validate and normalize words without accepting patterns',()=>{
 assert.deepEqual(parseAutoBanConfig(configuration({words:['TR4SH','trash','garbage']})).words,['trash','garbage']);
 assert.throws(()=>parseAutoBanConfig(configuration({words:[]})),/at least one/);
 assert.throws(()=>parseAutoBanConfig(configuration({words:['.*']})),/single words/);
 assert.throws(()=>parseAutoBanConfig(configuration({words:['two words']})),/single words/);
 assert.throws(()=>parseAutoBanConfig({...configuration(),excludeGiftGivers:'yes'}),/valid exclusion/);
 assert.equal(matchingAutoBanWord('TR4SH!',['trash']),'trash');
 assert.equal(matchingAutoBanWord('trashcan',['trash']),undefined);
 assert.equal(matchingAutoBanWord('i d i o t',['idiot']),'idiot');
});
test('autoban is off by default, forward-only, and isolates source identities',async()=>{
 const {rule,calls}=fixture();rule.observe(event('off'));assert.equal(calls.length,0);
 rule.configure(configuration());
 rule.observe({...event('old'),ts:Date.now()-1000});
 rule.observe(event('broadcaster','sim:Kai'));
 rule.observe({...event('real','twitch:viewer'),simulated:false});
 await idle(rule);assert.equal(calls.length,0);
 const hit=event('hit');rule.observe(hit);rule.observe(hit);
 await idle(rule);assert.deepEqual(calls,['sim:echo_01']);
 assert.equal(rule.snapshot().events[0].outcome,'banned');assert.equal(rule.snapshot().events[0].simulated,true);
});
test('known gift-givers and current subscribers are separately or jointly excluded',async()=>{
 for(const policy of [{excludeGiftGivers:true},{excludeSubscribers:true},{excludeGiftGivers:true,excludeSubscribers:true}]){
  const {rule,calls}=fixture();rule.configure(configuration(policy));
  for(const id of ['sim:echo_02','sim:echo_05','sim:ember_03','sim:echo_01'])rule.observe(event(id,id));
  await idle(rule);
  assert.ok(!calls.includes('sim:echo_02'));
  assert.equal(calls.includes('sim:echo_05'),!policy.excludeGiftGivers);
  assert.equal(calls.includes('sim:ember_03'),!policy.excludeSubscribers);
  assert.ok(calls.includes('sim:echo_01'));
  assert.ok(rule.snapshot().events.some(record=>record.outcome==='excluded'));
 }
});
test('missing or stale support lookup holds bans instead of assuming no support',()=>{
 const config=configuration({excludeGiftGivers:true,excludeSubscribers:true});
 const unknown:SupportData={status:{phase:'unavailable',giftTracking:false},users:[{userId:'twitch:viewer',simulated:false}]};
 assert.equal(supportExclusion(config,unknown,'twitch:viewer')?.outcome,'held');
 const stale:SupportData={status:{phase:'ready',giftTracking:false,updatedAt:Date.now()-31_000},users:[{userId:'twitch:viewer',simulated:false,currentSubscriber:false,activeGiftedSubs:0}]};
 assert.equal(supportExclusion(config,stale,'twitch:viewer')?.outcome,'held');
 assert.equal(supportExclusion(configuration(),unknown,'twitch:viewer'),undefined);
});
test('disabling while support is loading cancels queued bans',async()=>{
 let resolve!:(data:SupportData)=>void,calls=0;
 const rule=new AutoBan({mode:'simulation',broadcaster:()=>undefined,allowed:()=>true,support:()=>new Promise(done=>{resolve=done;}),ban:async()=>{calls++;return {ok:true};},changed:()=>{},wait:async()=>{}});
 rule.configure(configuration({excludeGiftGivers:true}));rule.observe(event('first'));rule.observe(event('second','sim:echo_03'));
 rule.pause('Disabled by moderator.');resolve(simulatedSupport(['sim:echo_01']));await idle(rule);
 assert.equal(calls,0);assert.equal(rule.snapshot().enabled,false);
});
test('failed actions stop the rule and pending requests are not retried',async()=>{
 const calls:string[]=[];
 const rule=new AutoBan({mode:'simulation',broadcaster:()=>undefined,allowed:()=>true,support:async id=>simulatedSupport([id]),ban:async e=>{calls.push(e.userId);return {ok:false,error:'rate limit'};},changed:()=>{},wait:async()=>{}});
 rule.configure(configuration());rule.observe(event('one'));rule.observe(event('two','sim:echo_03'));await idle(rule);
 assert.deepEqual(calls,['sim:echo_01']);assert.equal(rule.snapshot().enabled,false);assert.equal(rule.snapshot().events[0].outcome,'failed');
});
test('queue paces bans and a manually unbanned user can trigger again',async()=>{
 const {rule,calls,waits}=fixture();rule.configure(configuration());
 rule.observe(event('one'));rule.observe(event('two','sim:echo_03'));await idle(rule);
 assert.deepEqual(waits,[500]);assert.equal(calls.length,2);
 rule.unban('sim:echo_01');rule.observe(event('three'));await idle(rule);assert.equal(calls.length,3);
});
test('live rules cannot be enabled without moderation permission',()=>{
 const rule=new AutoBan({mode:'live',broadcaster:()=> 'twitch:owner',allowed:()=>false,support:async()=>({status:{phase:'unavailable',giftTracking:false},users:[]}),ban:async()=>({ok:true}),changed:()=>{}});
 assert.throws(()=>rule.configure(configuration()),/moderation permission/);
 assert.equal(rule.snapshot().enabled,false);
});
