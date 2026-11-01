import type {SupportData,SupportInfo,SupportStatus} from '../shared/types';
interface SubscriptionRow {user_id:string;is_gift:boolean;tier:string;gifter_id?:string}
export class SupportStore {
 private status:SupportStatus={phase:'permission-required',giftTracking:false,message:'Reconnect Twitch to grant subscription-read permission.'};
 private active=new Map<string,Partial<SupportInfo>>();
 private gifts=new Map<string,Partial<SupportInfo>>();
 private seen=new Set<string>();
 private giftTimes=new Map<string,number>();
 clear(){this.status={phase:'permission-required',giftTracking:false,message:'Reconnect Twitch to grant subscription-read permission.'};this.active.clear();this.gifts.clear();this.seen.clear();this.giftTimes.clear();}
 loading(){this.status={...this.status,phase:'loading',message:'Loading active subscriptions…'};}
 unavailable(message:string){this.status={...this.status,phase:'unavailable',message};}
 tracking(enabled:boolean){this.status={...this.status,giftTracking:enabled};}
 replace(rows:SubscriptionRow[],now=Date.now()){
  const active=new Map<string,Partial<SupportInfo>>();
  const seen=new Set<string>();
  for(const row of rows){
   if(!row.user_id||typeof row.is_gift!=='boolean')throw new Error('Invalid subscription data.');
   if(seen.has(row.user_id))continue;seen.add(row.user_id);
   const id=`twitch:${row.user_id}`;
   active.set(id,{...active.get(id),currentSubscriber:true,tier:row.tier,receivedGift:row.is_gift});
   if(row.is_gift&&row.gifter_id){
    const gifter=`twitch:${row.gifter_id}`,info=active.get(gifter)??{};
    active.set(gifter,{...info,activeGiftedSubs:(info.activeGiftedSubs??0)+1});
   }
  }
  this.active=active;this.status={...this.status,phase:'ready',updatedAt:now,message:undefined};
 }
 gift(id:string,event:Record<string,unknown>,timestamp:number){
  if(!id||this.seen.has(id)||event.is_anonymous!==false||typeof event.user_id!=='string'||!event.user_id||!Number.isInteger(event.total)||(event.total as number)<=0)return;
  this.seen.add(id);if(this.seen.size>2000)this.seen.delete(this.seen.values().next().value!);
  const userId=`twitch:${event.user_id}`,old=this.gifts.get(userId)??{};
  const info={...old,giftedThisSession:(old.giftedThisSession??0)+(event.total as number)};
  if(timestamp>=(this.giftTimes.get(userId)??0)){
   const total=event.cumulative_total;
   info.reportedTotalGifted=typeof total==='number'&&Number.isInteger(total)&&total>=0?total:undefined;
   info.totalReportedAt=info.reportedTotalGifted!==undefined?timestamp:undefined;
   this.giftTimes.set(userId,timestamp);
  }
  this.gifts.set(userId,info);
 }
 snapshot(ids:string[]):SupportData {
  return {status:{...this.status},users:[...new Set(ids)].filter(id=>id.startsWith('twitch:')).map(userId=>({
   userId,simulated:false,
   ...(this.status.updatedAt!==undefined?{currentSubscriber:false,activeGiftedSubs:0}:{}),
   ...(this.status.giftTracking?{giftedThisSession:0}:{}),
   ...this.active.get(userId),...this.gifts.get(userId),
  }))};
 }
}
export function simulatedSupport(ids:string[]):SupportData {
 const fixtures:Record<string,Partial<SupportInfo>>={
  'sim:echo_02':{currentSubscriber:true,tier:'2000',receivedGift:false,activeGiftedSubs:12,reportedTotalGifted:50},
  'sim:echo_05':{currentSubscriber:false,activeGiftedSubs:2,reportedTotalGifted:8},
  'sim:ember_03':{currentSubscriber:true,tier:'1000',receivedGift:false,activeGiftedSubs:0,reportedTotalGifted:0},
  'sim:luna':{currentSubscriber:true,tier:'1000',receivedGift:true,activeGiftedSubs:0,reportedTotalGifted:0},
  'sim:cozycat':{currentSubscriber:true,tier:'3000',receivedGift:false,activeGiftedSubs:5,reportedTotalGifted:25},
 };
 return {status:{phase:'ready',giftTracking:true,updatedAt:Date.now(),message:'Simulated support figures for the demo.'},users:ids.filter(id=>id.startsWith('sim:')).map(userId=>({userId,simulated:true,currentSubscriber:false,activeGiftedSubs:0,giftedThisSession:0,...fixtures[userId]}))};
}
