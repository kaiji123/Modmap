import { randomUUID } from 'node:crypto';
import { Engine, targets } from '../shared/engine';
import { SIMULATED_BROADCASTER, validTimeout } from '../shared/moderation';
import type { ChatEvent, ModerationAction, ModerationEntry, Snapshot } from '../shared/types';

/** Local-only moderation state. This class has no Twitch client or network capability. */
export class Simulation extends Engine {
  private names = new Map<string,string>();
  private restrictions = new Map<string,{kind:'ban'|'timeout';until?:number}>();
  private history = new Map<string,ModerationEntry>();

  override ingest(event:ChatEvent) {
    if(!event.simulated || !event.userId.startsWith('sim:')) throw new Error('Only simulated messages may enter the simulator.');
    this.expire(event.ts);
    this.names.set(event.userId,event.userName);
    for(const target of targets(event)) {
      if(!target.startsWith('sim:'))throw new Error('Simulated messages must target simulated users.');
      this.names.set(target,event.targetNames?.[target]??this.names.get(target)??target.slice(4));
    }
    if(this.restrictions.has(event.userId))return false;
    return super.ingest(event);
  }
  private restored(userId:string,now:number) {
    super.ingest({id:`sim:restored:${randomUUID()}`,userId,userName:this.names.get(userId)!,text:'[SIMULATED] Chat access restored.',mentions:[],ts:now,simulated:true});
  }
  private expire(now:number) {
    for(const [id,restriction] of this.restrictions) {
      if(restriction.kind==='timeout' && restriction.until!<=now){this.restrictions.delete(id);this.restored(id,now);}
    }
  }
  moderate(userId:string,action:ModerationAction,duration?:number,now=Date.now(),automatic=false) {
    if(!userId.startsWith('sim:')||!this.names.has(userId))throw new Error('Select a known simulated user.');
    if(userId===SIMULATED_BROADCASTER)throw new Error('The simulated broadcaster is protected.');
    if(action==='timeout'&&!validTimeout(duration))throw new Error('Timeout duration must be 1–1209600 whole seconds.');
    this.expire(now);
    if(action==='unban') {
      if(!this.restrictions.has(userId))throw new Error('This simulated user is not banned or timed out.');
      this.restrictions.delete(userId);this.restored(userId,now);
    }else{
      this.restrictions.set(userId,{kind:action,until:action==='timeout'?now+duration!*1000:undefined});
      this.removeUserMessages(userId);
    }
    this.history.set(userId,{userId,userName:this.names.get(userId)!,action,duration:action==='timeout'?duration:undefined,ts:now,simulated:true,automatic});
  }
  override reset(){super.reset();this.names.clear();this.restrictions.clear();this.history.clear();}
  override snapshot(now=Date.now(),running=false):Snapshot {
    this.expire(now);
    const snapshot=super.snapshot(now,running);
    for(const [id,restriction] of this.restrictions){
      let node=snapshot.nodes.find(n=>n.id===id);
      if(!node){node={id,name:this.names.get(id)!,count:0,score:0,simulated:true};snapshot.nodes.push(node);}
      node.restriction=restriction.kind;node.restrictedUntil=restriction.until;
    }
    snapshot.moderation=[...this.history.values()].sort((a,b)=>b.ts-a.ts);
    return snapshot;
  }
}
