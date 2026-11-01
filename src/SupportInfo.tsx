import type {SupportData,SupportInfo,UserNode} from '../shared/types';
import {hasGiftedSubs} from '../shared/moderation';
export function SupportBadges({info}:{info?:SupportInfo}){
 const tier=info?.tier?`Tier ${({'1000':'1','2000':'2','3000':'3'} as Record<string,string>)[info.tier]??info.tier}`:'Current';
 return <span className="support-badges">
  <span className={info?.currentSubscriber?'support-positive':''}>{info?.currentSubscriber?`${tier} sub${info.receivedGift?' · gift received':''}`:info?.currentSubscriber===false?'No active sub at lookup':'Sub status unknown'}</span>
  <span className={hasGiftedSubs(info)?'support-positive':''}>{info?.reportedTotalGifted!==undefined?`${info.reportedTotalGifted} total gifts reported`:'Total gifts unknown'}</span>
  <span>{info?.activeGiftedSubs!==undefined?`${info.activeGiftedSubs} active gift subs`:'Active gifts unknown'}</span>
  {info?.giftedThisSession!==undefined&&<span>{info.giftedThisSession} gifts observed this session</span>}
 </span>;
}
export function SupportReview({support,users,disabled,simulation,canRefresh,onExclude,onRefresh}:{support?:SupportData;users:UserNode[];disabled:boolean;simulation:boolean;canRefresh:boolean;onExclude:(kind:'gifters'|'subscribers')=>void;onRefresh:()=>void}){
 const selected=new Set(users.map(user=>user.id));
 const info=(support?.users??[]).filter(user=>selected.has(user.userId));
 const gifters=info.filter(hasGiftedSubs).length,subscribers=info.filter(user=>user.currentSubscriber===true).length;
 const status=support?.status;
 return <section className="support-review"><div className="support-heading"><strong>Channel support {simulation&&<span className="tag">SIMULATED</span>}</strong>{!simulation&&<button disabled={disabled||!canRefresh||status?.phase==='loading'} onClick={onRefresh}>{status?.phase==='loading'?'Loading…':'Refresh'}</button>}</div>
  <p>{simulation?'Example gift and subscriber figures for this demo.':status?.message??(status?.updatedAt?`Active subs and gifts at ${new Date(status.updatedAt).toLocaleTimeString('en-GB')}.`:'Support data is not available yet.')}</p>
  {!simulation&&status?.updatedAt&&status.phase!=='ready'&&<p>Last complete lookup: {new Date(status.updatedAt).toLocaleTimeString('en-GB')}.</p>}
  {users.length>0&&<div className="support-exclude"><button disabled={disabled||!gifters} onClick={()=>onExclude('gifters')}>Unselect gift-givers ({gifters})</button><button disabled={disabled||!subscribers} onClick={()=>onExclude('subscribers')}>Unselect current subs ({subscribers})</button></div>}
  <p className="support-footnote">Gift totals appear only when shared on an observed gift event. Active gifts are a lookup count, not lifetime gifts. Unknown support stays selected.</p>
 </section>;
}
