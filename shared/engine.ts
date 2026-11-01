import type { Alert, ChatEvent, Edge, Snapshot, UserNode } from './types';
export const WINDOW = 120_000;
export function normalize(text:string):string {
 return text.toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,'').replace(/[014@$]/g,c=>({'0':'o','1':'i','4':'a','@':'a','$':'s'}[c]!)).replace(/(.)\1{2,}/g,'$1').replace(/\b(?:[a-z] ){2,}[a-z]\b/g,s=>s.replace(/ /g,''));
}
export function toxicity(text:string):number { return /\b(trash|idiot|stupid|loser|garbage)\b/.test(normalize(text)) ? .9 : 0; }
export function jaccard(a:string,b:string):number {
 const tokens=(s:string)=>new Set(normalize(s).replace(/@\w+/g,'').match(/[a-z]+/g)??[]);
 const x=tokens(a),y=tokens(b),union=new Set([...x,...y]);
 return union.size ? [...x].filter(t=>y.has(t)).length/union.size : 0;
}
export function targets(event:ChatEvent):string[] {return [...new Set([event.replyToUserId,...event.mentions].filter((v):v is string=>Boolean(v)&&v!==event.userId))];}
export function detect(events:ChatEvent[],now:number):Alert[] {
 const groups=new Map<string,ChatEvent[]>();
 for(const e of events) if(now-e.ts<=30_000 && toxicity(e.text)>=.6) for(const target of targets(e)) {
 const key=`${e.simulated}:${target}`; groups.set(key,[...(groups.get(key)??[]),e]);
 }
 return [...groups.entries()].flatMap(([key,messages])=>{
 const senders=new Set(messages.map(e=>e.userId)).size;
 let similar=0,pairs=0;
 for(let i=0;i<messages.length;i++)for(let j=i+1;j<messages.length;j++)if(messages[i].userId!==messages[j].userId){pairs++;if(jaccard(messages[i].text,messages[j].text)>.7)similar++;}
 const similarity=pairs?similar/pairs:0;
 return senders>=5 && similarity>=.5 ? [{target:key.slice(key.indexOf(':')+1),senders,messages:messages.length,similarity,simulated:messages[0].simulated}] : [];
 }).filter(a=>a.target);
}
export class Engine {
 private events:ChatEvent[]=[];
 private ids=new Set<string>();
 private revealed=new Set<string>();
 ingest(event:ChatEvent){if(this.ids.has(event.id))return;this.ids.add(event.id);this.events.push(event);this.prune(event.ts);}
 private prune(now:number){this.events=this.events.filter(e=>now-e.ts<=WINDOW);this.ids=new Set(this.events.map(e=>e.id));this.revealed=new Set([...this.revealed].filter(id=>this.ids.has(id)));}
 reveal(id:string){const e=this.events.find(e=>e.id===id);if(!e)return undefined;this.revealed.add(id);return e.text;}
 reset(){this.events=[];this.ids.clear();this.revealed.clear();}
 snapshot(now=Date.now(),running=false):Snapshot {
 this.prune(now);const nodes=new Map<string,UserNode>(),edges=new Map<string,Edge>();
 for(const e of this.events){const score=toxicity(e.text);const node=nodes.get(e.userId)??{id:e.userId,name:e.userName,count:0,score:0,simulated:e.simulated};node.count++;node.score=node.count===1?score:.6*score+.4*node.score;nodes.set(e.userId,node);
 for(const target of targets(e)){if(!nodes.has(target))nodes.set(target,{id:target,name:target.replace(/^sim:/,''),count:0,score:0,simulated:e.simulated});const key=`${e.userId}>${target}`;const edge=edges.get(key)??{source:e.userId,target,count:0,score:0};edge.count++;edge.score=Math.max(edge.score,score);edges.set(key,edge);}}
 return {nodes:[...nodes.values()],edges:[...edges.values()],messages:this.events.slice(-100).map(e=>({...e,text:toxicity(e.text)>=.6?'Message hidden · flagged by word filter':e.text,score:toxicity(e.text),flagged:toxicity(e.text)>=.6})).reverse(),alerts:detect(this.events,now),running,reveals:this.revealed.size};
 }
}
