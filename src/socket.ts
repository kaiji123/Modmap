import {io} from 'socket.io-client';
export const socket=io({autoConnect:false});
interface Session {configured:boolean;loginUrl:string}
let sessionRequest:Promise<Session>|undefined;
export function loadSession():Promise<Session>{
 return sessionRequest??=fetch('/api/session').then(async response=>{
  if(!response.ok)throw new Error('Could not start local session.');
  return response.json();
 });
}
// Release an outdated client if this module is replaced during development.
if(import.meta.hot)import.meta.hot.dispose(()=>socket.disconnect());
