import {randomUUID} from 'node:crypto';
import {normalize} from '../shared/engine';
import {hasGiftedSubs,SIMULATED_BROADCASTER} from '../shared/moderation';
import type {AutoBanConfig,AutoBanEvent,AutoBanState,ChatEvent,ModerationResult,SupportData} from '../shared/types';

export function parseAutoBanConfig(input:unknown):AutoBanConfig {
 if(!input||typeof input!=='object')throw new Error('Invalid autoban settings.');
 const value=input as Partial<AutoBanConfig>;
 if(typeof value.enabled!=='boolean'||typeof value.excludeGiftGivers!=='boolean'||typeof value.excludeSubscribers!=='boolean'||!Array.isArray(value.words)||value.words.length>50)throw new Error('Use at most 50 autoban words and valid exclusion settings.');
 const words=[...new Set(value.words.map(word=>{
  if(typeof word!=='string'||word.length>100)throw new Error('Each entry must be one word, at most 32 normalized characters.');
  const term=normalize(word.normalize('NFKC')).trim();
  if(!term||term.length>32||!/^\p{L}[\p{L}\p{N}]*$/u.test(term))throw new Error('Use single words separated by commas or new lines, without punctuation.');
  return term;
 }))];
 if(value.enabled&&!words.length)throw new Error('Add at least one word before enabling autoban.');
 return {enabled:value.enabled,words,excludeGiftGivers:value.excludeGiftGivers,excludeSubscribers:value.excludeSubscribers};
}
export function matchingAutoBanWord(text:string,words:string[]):string|undefined {
 const tokens=new Set(normalize(text.normalize('NFKC')).match(/[\p{L}\p{N}]+/gu)??[]);
 return words.find(word=>tokens.has(word));
}
export function supportExclusion(config:AutoBanConfig,data:SupportData,userId:string,now=Date.now()):{outcome:'excluded'|'held';reason:string}|undefined {
 const info=data.users.find(user=>user.userId===userId);
 if(config.excludeGiftGivers&&hasGiftedSubs(info))return {outcome:'excluded',reason:'Known subscription gift-giver.'};
 if(config.excludeSubscribers&&info?.currentSubscriber===true)return {outcome:'excluded',reason:'Current subscriber at the last lookup.'};
 if(!config.excludeGiftGivers&&!config.excludeSubscribers)return;
 if(data.status.phase!=='ready'||data.status.updatedAt===undefined||now-data.status.updatedAt>30_000||!info||
   (config.excludeSubscribers&&info.currentSubscriber===undefined)||(config.excludeGiftGivers&&info.activeGiftedSubs===undefined)){
  return {outcome:'held',reason:'Support data unknown or stale. Refresh support data; no autoban sent.'};
 }
}
interface Dependencies {
 mode:'simulation'|'live';
 broadcaster:()=>string|undefined;
 allowed:()=>boolean;
 support:(userId:string)=>Promise<SupportData>;
 ban:(event:ChatEvent,word:string)=>Promise<ModerationResult>;
 changed:()=>void;
 wait?:(ms:number)=>Promise<void>;
}
export class AutoBan {
 private config:AutoBanConfig={enabled:false,words:[],excludeGiftGivers:false,excludeSubscribers:false};
 private revision=0;
 private enabledAt=0;
 private notice?:string;
 private events:AutoBanEvent[]=[];
 private queue:{event:ChatEvent;word:string;revision:number}[]=[];
 private pending=new Set<string>();
 private seen=new Set<string>();
 private banned=new Map<string,number>();
 private processing=false;
 constructor(private dependencies:Dependencies){}
 snapshot():AutoBanState{return {...this.config,words:[...this.config.words],revision:this.revision,pending:this.pending.size,events:[...this.events],notice:this.notice};}
 configure(input:unknown,now=Date.now()){
  const config=parseAutoBanConfig(input);
  if(config.enabled&&!this.dependencies.allowed())throw new Error('Connect Twitch with moderation permission before enabling live autoban.');
  this.revision++;this.config=config;this.enabledAt=now;this.notice=undefined;
  this.dropQueue();this.dependencies.changed();
 }
 pause(reason:string){this.revision++;this.config={...this.config,enabled:false};this.notice=reason;this.dropQueue();this.dependencies.changed();}
 reset(){this.pause('Autoban disabled by reset.');this.events=[];this.banned.clear();this.seen.clear();}
 unban(userId:string){this.banned.delete(userId);}
 private dropQueue(){for(const job of this.queue)this.pending.delete(job.event.userId);this.queue=[];}
 observe(event:ChatEvent){
  if(!this.config.enabled||event.ts<Math.max(this.enabledAt,Date.now()-120_000)||event.simulated!==(this.dependencies.mode==='simulation')||this.seen.has(event.id))return;
  const prefix=this.dependencies.mode==='simulation'?'sim:':'twitch:';
  if(!event.userId.startsWith(prefix)||event.userId===(this.dependencies.mode==='simulation'?SIMULATED_BROADCASTER:this.dependencies.broadcaster()))return;
  this.seen.add(event.id);if(this.seen.size>5000)this.seen.delete(this.seen.values().next().value!);
  const word=matchingAutoBanWord(event.text,this.config.words);
  if(!word||this.pending.has(event.userId)||(this.banned.has(event.userId)&&event.ts<=this.banned.get(event.userId)!))return;
  if(this.queue.length>=100){this.pause('Autoban paused: queue is full. Review chat before enabling again.');return;}
  this.queue.push({event,word,revision:this.revision});this.pending.add(event.userId);this.dependencies.changed();void this.drain();
 }
 private record(event:ChatEvent,word:string,outcome:AutoBanEvent['outcome'],reason:string){
  this.events.unshift({id:randomUUID(),userId:event.userId,userName:event.userName,word,outcome,reason,ts:Date.now(),simulated:event.simulated});
  this.events=this.events.slice(0,50);this.dependencies.changed();
 }
 private async drain(){
  if(this.processing)return;this.processing=true;
  try{
   while(this.queue.length){
    const job=this.queue.shift()!,{event,word,revision}=job;
    try{
     if(!this.config.enabled||revision!==this.revision)continue;
     if(!this.dependencies.allowed()){this.pause('Autoban paused: moderation permission is unavailable.');continue;}
     if(this.config.excludeGiftGivers||this.config.excludeSubscribers){
      let data:SupportData;
      try{data=await this.dependencies.support(event.userId);}catch{this.record(event,word,'held','Support lookup failed; no autoban sent.');continue;}
      if(!this.config.enabled||revision!==this.revision)continue;
      const decision=supportExclusion(this.config,data,event.userId);
      if(decision){this.record(event,word,decision.outcome,decision.reason);continue;}
     }
     if(!this.config.enabled||revision!==this.revision)continue;
     const result=await this.dependencies.ban(event,word);
     if(result.ok){this.banned.set(event.userId,Date.now());this.record(event,word,'banned',event.simulated?'Simulated autoban — no Twitch request.':'Autoban confirmed by Twitch.');}
     else{this.record(event,word,'failed',result.error??'Action could not be confirmed.');if(revision===this.revision)this.pause('Autoban stopped after an error. Check results before enabling again.');}
    }catch{this.record(event,word,'failed','Action could not be confirmed. Check the result before retrying.');if(revision===this.revision)this.pause('Autoban stopped after an unexpected error.');}
    finally{this.pending.delete(event.userId);this.dependencies.changed();}
    if(this.queue.length&&this.config.enabled)await (this.dependencies.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(500);
   }
  }finally{this.processing=false;this.dependencies.changed();}
 }
}
