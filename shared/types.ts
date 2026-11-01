export interface ChatEvent {id:string;userId:string;userName:string;text:string;replyToUserId?:string;mentions:string[];ts:number;simulated:boolean;targetNames?:Record<string,string>}
export interface Message extends Omit<ChatEvent,'text'> {text:string;score:number;flagged:boolean}
export interface UserNode {id:string;name:string;count:number;score:number;simulated:boolean;restriction?:"ban"|"timeout";restrictedUntil?:number}
export interface Edge {source:string;target:string;count:number;score:number}
export interface Alert {target:string;senders:number;messages:number;similarity:number;simulated:boolean}
export interface Snapshot {nodes:UserNode[];edges:Edge[];messages:Message[];alerts:Alert[];running:boolean;reveals:number;mode?:"simulation"|"live";twitch?:TwitchStatus;moderation?:ModerationEntry[];toxicWords?:ToxicWordStat[];support?:SupportData;autoBan?:AutoBanState}

export interface TwitchStatus {phase:"disconnected"|"connecting"|"connected"|"reconnecting"|"error";login?:string;userId?:string;error?:string;canModerate?:boolean;canReadSubscriptions?:boolean}

export interface ModerationEntry {userId:string;userName:string;action:ModerationAction;duration?:number;ts:number;simulated?:boolean;automatic?:boolean}
export interface ModerationResult {ok:boolean;error?:string;simulated?:boolean}

export type ModerationAction = "ban"|"unban"|"timeout";

export interface ToxicWordUser {userId:string;userName:string;count:number;messageCount:number;simulated:boolean}
export interface ToxicWordStat {word:string;count:number;messageCount:number;users:ToxicWordUser[]}

export interface SupportInfo {userId:string;simulated:boolean;currentSubscriber?:boolean;tier?:string;receivedGift?:boolean;activeGiftedSubs?:number;giftedThisSession?:number;reportedTotalGifted?:number;totalReportedAt?:number}
export interface SupportStatus {phase:'permission-required'|'loading'|'ready'|'unavailable';giftTracking:boolean;updatedAt?:number;message?:string}
export interface SupportData {status:SupportStatus;users:SupportInfo[]}

export interface AutoBanConfig {enabled:boolean;words:string[];excludeGiftGivers:boolean;excludeSubscribers:boolean}
export interface AutoBanEvent {id:string;userId:string;userName:string;word:string;outcome:'banned'|'excluded'|'held'|'failed';reason:string;ts:number;simulated:boolean}
export interface AutoBanState extends AutoBanConfig {revision:number;pending:number;events:AutoBanEvent[];notice?:string}
