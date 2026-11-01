export interface ChatEvent {id:string;userId:string;userName:string;text:string;replyToUserId?:string;mentions:string[];ts:number;simulated:boolean}
export interface Message extends Omit<ChatEvent,'text'> {text:string;score:number;flagged:boolean}
export interface UserNode {id:string;name:string;count:number;score:number;simulated:boolean}
export interface Edge {source:string;target:string;count:number;score:number}
export interface Alert {target:string;senders:number;messages:number;similarity:number;simulated:boolean}
export interface Snapshot {nodes:UserNode[];edges:Edge[];messages:Message[];alerts:Alert[];running:boolean;reveals:number}
