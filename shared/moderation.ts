import type { UserNode, SupportInfo } from './types';
export const SIMULATED_BROADCASTER='sim:Kai';
export const MAX_TIMEOUT_SECONDS = 1_209_600;
export function validTimeout(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TIMEOUT_SECONDS;
}
export function eligibleUser(node:UserNode,mode:'simulation'|'live',broadcasterId?:string):boolean {
  return mode==='simulation'?node.simulated&&node.id.startsWith('sim:')&&node.id!==SIMULATED_BROADCASTER:!node.simulated&&node.id.startsWith('twitch:')&&node.id!==broadcasterId;
}
export function toxicUsers(nodes: UserNode[], broadcasterId?: string,mode:'simulation'|'live'='live'): UserNode[] {
  return nodes.filter(node => node.score > .6 && eligibleUser(node,mode,broadcasterId));
}


export function hasGiftedSubs(info:SupportInfo|undefined):boolean {
 return Boolean(info&&((info.activeGiftedSubs??0)>0||(info.giftedThisSession??0)>0||(info.reportedTotalGifted??0)>0));
}
export function excludeSupporters(ids:string[],support:SupportInfo[],kind:'gifters'|'subscribers'):string[]{
 const excluded=new Set(support.filter(info=>kind==='gifters'?hasGiftedSubs(info):info.currentSubscriber===true).map(info=>info.userId));
 return ids.filter(id=>!excluded.has(id));
}
