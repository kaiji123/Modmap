import {useEffect,useState} from 'react';
import type {AutoBanConfig,AutoBanState,ModerationResult} from '../shared/types';
interface Props {state?:AutoBanState;simulation:boolean;connected:boolean;canEnable:boolean;onSave:(config:AutoBanConfig)=>Promise<ModerationResult>;onInspect:(id:string)=>void}
const mask=(word:string)=>word.length>2?word[0]+'•'.repeat(word.length-2)+word.at(-1):'••';
export function AutoBanPanel({state,simulation,connected,canEnable,onSave,onInspect}:Props){
 const [words,setWords]=useState(''),[excludeGiftGivers,setExcludeGiftGivers]=useState(false),[excludeSubscribers,setExcludeSubscribers]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{setWords(state?.words.join(', ')??'');setExcludeGiftGivers(state?.excludeGiftGivers??false);setExcludeSubscribers(state?.excludeSubscribers??false);},[state?.revision]);
 async function save(enabled:boolean){
  setSaving(true);setMessage('');
  const config:AutoBanConfig=enabled?{enabled:true,words:words.split(/[,\n]/).map(word=>word.trim()).filter(Boolean),excludeGiftGivers,excludeSubscribers}:{enabled:false,words:state?.words??[],excludeGiftGivers:state?.excludeGiftGivers??false,excludeSubscribers:state?.excludeSubscribers??false};
  try{const result=await onSave(config);setMessage(result.ok?(enabled?'Autoban enabled for new matching messages.':'Autoban disabled.'):result.error??'Could not update autoban.');}
  catch{setMessage('Could not reach the server. Check rule status before trying again.');}
  finally{setSaving(false);}
 }
 return <section className="autoban-panel" aria-label="Autoban word rules"><div className="autoban-heading"><div><h2>Autoban words <span className="tag">{simulation?'SIMULATED':'LIVE TWITCH'}</span></h2><p>{simulation?'Automatic local bans for the demo. No Twitch requests.':'When enabled, matching users receive permanent bans in your Twitch channel.'}</p></div><span className={`autoban-status${state?.enabled?' enabled':''}`}>{state?.enabled?'Enabled':'Disabled'}{state?.pending?` · ${state.pending} pending`:''}</span></div>
  <form onSubmit={event=>{event.preventDefault();void save(true);}}><div className="autoban-settings"><label className="autoban-words">Words to match<textarea value={words} onChange={event=>setWords(event.target.value)} maxLength={2000} rows={3} placeholder="trash, garbage" disabled={saving}/><small>Up to 50 whole words, separated by commas or new lines. Disguised spellings are normalized.</small></label><fieldset><legend>Who should be excluded?</legend><label><input type="checkbox" checked={excludeGiftGivers} onChange={event=>setExcludeGiftGivers(event.target.checked)} disabled={saving}/>Exclude known gift-givers</label><label><input type="checkbox" checked={excludeSubscribers} onChange={event=>setExcludeSubscribers(event.target.checked)} disabled={saving}/>Exclude current subscribers</label><p>Leave both unchecked to ban all matching users. Exclusions use known active, observed or shared support. Missing/stale active-support lookups hold the ban; hidden lifetime gifts cannot be checked.</p></fieldset></div>
   <div className="autoban-actions"><button className="autoban-enable" type="submit" disabled={!connected||!canEnable||saving||!words.trim()}>{saving?'Saving…':state?.enabled?'Save active rule':'Enable autoban'}</button>{state?.enabled&&<button type="button" disabled={!connected||saving} onClick={()=>void save(false)}>Disable autoban</button>}<span>New messages only · Switching views disables the rule</span></div>
  </form>
  {!canEnable&&!simulation&&<p className="autoban-message">Reconnect Twitch with moderation permission to enable live autoban.</p>}
  {(message||state?.notice)&&<p role="status" className="autoban-message">{message||state?.notice}</p>}
  {Boolean(state?.events.length)&&<div className="autoban-events"><h3>Recent rule activity</h3>{state?.events.map(event=><div key={event.id} className="autoban-event"><time>{new Date(event.ts).toLocaleTimeString('en-GB')}</time><button onClick={()=>onInspect(event.userId)}>@{event.userName}</button><span className={`autoban-outcome ${event.outcome}`}>{event.outcome}</span><span>Word: {mask(event.word)}</span><p>{event.reason}</p></div>)}</div>}
 </section>;
}
