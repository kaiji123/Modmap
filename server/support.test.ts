import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SupportStore,simulatedSupport} from './support';
import {excludeSupporters,hasGiftedSubs} from '../shared/moderation';

test('active gift counts are distinct from current subscriptions and lifetime totals',()=>{
 const store=new SupportStore();
 assert.equal(store.snapshot(['twitch:gifter']).users[0].activeGiftedSubs,undefined);
 store.replace([
  {user_id:'recipient1',is_gift:true,tier:'1000',gifter_id:'gifter'},
  {user_id:'recipient2',is_gift:true,tier:'1000',gifter_id:'gifter'},
  {user_id:'recipient2',is_gift:true,tier:'1000',gifter_id:'gifter'},
  {user_id:'gifter',is_gift:false,tier:'2000'},
 ],1000);
 const [gifter,recipient,other]=store.snapshot(['twitch:gifter','twitch:recipient1','twitch:unknown']).users;
 assert.equal(gifter.activeGiftedSubs,2);assert.equal(gifter.currentSubscriber,true);
 assert.equal(gifter.reportedTotalGifted,undefined);
 assert.equal(recipient.receivedGift,true);assert.equal(hasGiftedSubs(recipient),false);
 assert.equal(other.currentSubscriber,false);assert.equal(other.activeGiftedSubs,0);
 assert.equal(store.snapshot(['sim:fake']).users.length,0);
});
test('gift events deduplicate, do not attribute anonymous gifts, and honour hidden totals',()=>{
 const store=new SupportStore(),gift={user_id:'gifter',total:5,cumulative_total:25,is_anonymous:false};
 store.tracking(true);store.gift('one',gift,1000);store.gift('one',gift,1000);
 store.gift('anonymous',{...gift,is_anonymous:true},1001);
 let info=store.snapshot(['twitch:gifter']).users[0];
 assert.equal(info.giftedThisSession,5);assert.equal(info.reportedTotalGifted,25);
 store.gift('two',{...gift,total:2,cumulative_total:null},2000);
 store.gift('old',{...gift,total:1,cumulative_total:26},1500);
 info=store.snapshot(['twitch:gifter']).users[0];
 assert.equal(info.giftedThisSession,8);assert.equal(info.reportedTotalGifted,undefined);
 assert.equal(hasGiftedSubs(info),true);
});
test('support exclusions remove only the requested known group and retain unknowns',()=>{
 const data=simulatedSupport(['sim:echo_02','sim:echo_05','sim:ember_03','sim:luna']);
 const ids=[...data.users.map(user=>user.userId),'sim:unknown'];
 assert.deepEqual(excludeSupporters(ids,data.users,'gifters'),['sim:ember_03','sim:luna','sim:unknown']);
 assert.deepEqual(excludeSupporters(ids,data.users,'subscribers'),['sim:echo_05','sim:unknown']);
 assert.ok(data.users.every(user=>user.simulated));
 assert.equal(simulatedSupport(['twitch:viewer']).users.length,0);
});
test('failed lookups stay unknown and cannot silently turn into zero support',()=>{
 const store=new SupportStore();store.loading();store.unavailable('Lookup failed');
 const info=store.snapshot(['twitch:unknown']).users[0];
 assert.equal(info.currentSubscriber,undefined);assert.equal(info.activeGiftedSubs,undefined);
 assert.deepEqual(excludeSupporters(['twitch:unknown'],[info],'gifters'),['twitch:unknown']);
 assert.throws(()=>store.replace([{user_id:'bad',is_gift:undefined as unknown as boolean,tier:'1000'}]),/Invalid/);
 assert.equal(store.snapshot(['twitch:unknown']).users[0].activeGiftedSubs,undefined);
 store.clear();assert.equal(store.snapshot([]).status.phase,'permission-required');
});
