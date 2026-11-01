import type { ModerationResult } from '../shared/types';
export interface BulkResult extends ModerationResult { userId:string; attempted:boolean }
export const MAX_BULK = 50;

/** Serialize the existing checked server action; never retry a moderation mutation. */
export async function runBulk(
  ids: string[],
  send: (id:string)=>Promise<ModerationResult>,
  cancelled: ()=>boolean,
  progress: (result:BulkResult)=>void,
  wait: (ms:number)=>Promise<void> = ms=>new Promise(resolve=>setTimeout(resolve,ms)),
): Promise<void> {
  const unique=[...new Set(ids)];
  if(unique.length>MAX_BULK)throw new Error(`Select at most ${MAX_BULK} users.`);
  let stopped=false;
  for(let i=0;i<unique.length;i++){
    if(i&&!stopped&&!cancelled())await wait(500);
    if(stopped||cancelled()){
      progress({userId:unique[i],ok:false,attempted:false,error:cancelled()?'Cancelled before sending.':'Not attempted after a previous error.'});continue;
    }
    let result:ModerationResult;
    try{result=await send(unique[i]);}catch{result={ok:false,error:'Could not confirm the result. Check Twitch before retrying.'};}
    progress({userId:unique[i],attempted:true,...result});
    if(!result.ok)stopped=true;
  }
}
