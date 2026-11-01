import { useEffect, useState, useRef } from 'react';
import {socket,loadSession} from './socket';
import type { Snapshot, ModerationResult, UserNode, ModerationAction, ToxicWordStat, AutoBanConfig } from '../shared/types';
import { ConversationGraph } from './ConversationGraph';
import { UserConnections } from './UserConnections';
import { ToxicWordStats } from './ToxicWordStats';
import {AutoBanPanel} from './AutoBanPanel';
import { SupportBadges, SupportReview } from './SupportInfo';
import { runBulk, MAX_BULK, type BulkResult } from './bulk';
import { toxicUsers, eligibleUser, SIMULATED_BROADCASTER, excludeSupporters, hasGiftedSubs } from '../shared/moderation';
import { TimeoutDuration, durationLabel } from './TimeoutDuration';
const empty:Snapshot={nodes:[],edges:[],messages:[],alerts:[],running:false,reveals:0};
const color=(score:number)=>score>.6?'#ff667f':score>=.3?'#ffc66d':'#61d9b0';
export default function App(){
 const [selectedUsers,setSelectedUsers]=useState<UserNode[]>([]),[batchResults,setBatchResults]=useState<BulkResult[]>([]);
 const cancelBatch=useRef(false);
 const [selectedWord,setSelectedWord]=useState<string>();
 const [timeoutSeconds,setTimeoutSeconds]=useState(600);
 const outcome=(action:ModerationAction,seconds=timeoutSeconds)=>action==='ban'?'banned':action==='unban'?'unbanned':`timed out for ${durationLabel(seconds)}`;

 const [actionNotice,setActionNotice]=useState(''),[pendingAction,setPendingAction]=useState(false);
 const [setup,setSetup]=useState<{configured:boolean;loginUrl:string}>(),[connectionError,setConnectionError]=useState('');
 const isLive = (data:Snapshot)=>data.mode==='live';
 const [data,setData]=useState(empty),[connected,setConnected]=useState(false),[selected,setSelected]=useState<string>(),[revealed,setRevealed]=useState<Record<string,string>>({}),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  let alive=true;
  const update=(s:Snapshot)=>setData(s), on=()=>{setConnected(true);setConnectionError('');}, off=()=>{setConnected(false);cancelBatch.current=true;};
  const error=(e:Error)=>setConnectionError(e.message);
  socket.on('snapshot',update);socket.on('connect',on);socket.on('disconnect',off);socket.on('connect_error',error);
  void loadSession().then(session=>{if(alive){setSetup(session);socket.connect();}}).catch(()=>{if(alive)setConnectionError('Could not reach ModMap. Check the server and reload.');});
  return()=>{alive=false;socket.off('snapshot',update);socket.off('connect',on);socket.off('disconnect',off);socket.off('connect_error',error);socket.disconnect();};
 },[]);
 useEffect(()=>{cancelBatch.current=true;setSelected(undefined);setSelectedUsers([]);setSelectedWord(undefined);setBatchResults([]);setRevealed({});setDismissed(false);setActionNotice('');},[data.mode]);
 const live=isLive(data),twitch=data.twitch;
 const authError=new URLSearchParams(window.location.search).get('twitch');
 function switchView(mode:'simulation'|'live'){socket.emit('view',mode);}

 const target=data.nodes.find(n=>n.id===(data.alerts[0]?.target??(live?twitch?.userId:SIMULATED_BROADCASTER)));
 const lastAction=data.moderation?.find(entry=>entry.userId===selected);
 const active:UserNode|undefined=data.nodes.find(n=>n.id===selected)??(lastAction?{id:lastAction.userId,name:lastAction.userName,count:0,score:0,simulated:Boolean(lastAction.simulated)}:undefined);
 const messages=data.messages.filter(m=>!selected||m.userId===selected);
 const mode=live?'live':'simulation';
 const authorized=!live||Boolean(twitch?.canModerate);
 const actionPlace=live?'on Twitch':'in simulation (no Twitch request)';
 const supportById=new Map((data.support?.users??[]).map(info=>[info.userId,info]));
 function unselectSupporters(kind:'gifters'|'subscribers'){
  if(pendingAction)return;
  const keep=new Set(excludeSupporters(selectedUsers.map(user=>user.id),data.support?.users??[],kind));
  const removed=selectedUsers.length-keep.size;
  setSelectedUsers(users=>users.filter(user=>keep.has(user.id)));setSelectedWord(undefined);setBatchResults([]);
  setActionNotice(`${removed} ${kind==='gifters'?'gift-givers':'current subscribers'} removed from the selection. Use Ban selected or Timeout selected for the remaining users.`);
 }
 const canAct=Boolean(active&&eligibleUser(active,mode,twitch?.userId)&&authorized&&connected&&!pendingAction);
 function moderate(action:ModerationAction){
  if(!active||!canAct)return;
  setPendingAction(true);setActionNotice('');
  const name=active.name;
  socket.timeout(20000).emit('moderate',{userId:active.id,action,mode,...(action==='timeout'?{duration:timeoutSeconds}:{})},(error:Error|null,result?:ModerationResult)=>{
   setPendingAction(false);
   setActionNotice(error?`No response from the server. Check ${live?'Twitch':'the demo state'} before trying again.`:result?.ok?`@${name} ${outcome(action)} ${actionPlace}.`:result?.error??'Action could not be confirmed.');
  });
 }
 const alert=!dismissed?data.alerts[0]:undefined;
 function reset(){socket.emit('reset');setSelected(undefined);setSelectedUsers([]);setSelectedWord(undefined);setBatchResults([]);setRevealed({});setDismissed(false);}
 function inspect(id:string){if(pendingAction)return;setSelectedWord(undefined);setSelected(id);setSelectedUsers([]);setBatchResults([]);setActionNotice('');}
 function selectMany(users:UserNode[]){if(pendingAction)return;setSelectedWord(undefined);setSelected(undefined);setSelectedUsers(users);setBatchResults([]);setActionNotice(users.length?'':'No users inside that loop.');}
 function toggleUser(user:UserNode){
  if(pendingAction)return;
  setSelected(undefined);setSelectedWord(undefined);setBatchResults([]);setActionNotice('');
  setSelectedUsers(old=>{const current=old.length?old:data.nodes.filter(n=>n.id===selected);return current.some(n=>n.id===user.id)?current.filter(n=>n.id!==user.id):[...current,user];});
 }
 function selectWordUsers(stat:ToxicWordStat){
  const ids=new Set(stat.users.map(user=>user.userId));
  selectMany(data.nodes.filter(node=>ids.has(node.id)));
  setSelectedWord(stat.word);
 }
 const eligible=selectedUsers.filter(user=>eligibleUser(user,mode,twitch?.userId));
 const highScoreUsers=toxicUsers(data.nodes,twitch?.userId,mode);
 const canBanToxic=Boolean(authorized&&connected&&!pendingAction&&highScoreUsers.length&&highScoreUsers.length<=MAX_BULK);
 const canBulk=Boolean(authorized&&connected&&!pendingAction&&eligible.length&&eligible.length<=MAX_BULK);
 function saveAutoBan(config:AutoBanConfig):Promise<ModerationResult>{
  return new Promise(resolve=>socket.timeout(10000).emit('configureAutoBan',{mode,config},(error:Error|null,result?:ModerationResult)=>resolve(error?{ok:false,error:'No server response. Refresh to check the active rule.'}:result??{ok:false,error:'No result returned.'})));
 }
 function sendAction(userId:string,action:ModerationAction):Promise<ModerationResult>{
  return new Promise(resolve=>socket.timeout(20000).emit('moderate',{userId,action,mode,...(action==='timeout'?{duration:timeoutSeconds}:{})},(error:Error|null,result?:ModerationResult)=>resolve(error?{ok:false,error:`No response. Check ${live?'Twitch':'the demo state'} before retrying.`}:result??{ok:false,error:'No result from server.'})));
 }
 async function moderateMany(action:ModerationAction,override?:UserNode[]){
  const users=[...(override??eligible)];
  if(!authorized||!connected||pendingAction||!users.length||users.length>MAX_BULK)return;
  if(override){setSelected(undefined);setSelectedWord(undefined);setSelectedUsers(users);setBatchResults([]);}
  setPendingAction(true);setBatchResults([]);setActionNotice('');cancelBatch.current=false;
  const results:BulkResult[]=[];
  try{
   await runBulk(users.map(u=>u.id),id=>sendAction(id,action),()=>cancelBatch.current,result=>{results.push(result);setBatchResults([...results]);});
   const succeeded=results.filter(r=>r.ok).length;
   setActionNotice(`${succeeded} of ${users.length} users ${outcome(action)} ${actionPlace}. Review individual results below.`);
  }catch{setActionNotice(`Batch stopped. Check the results and ${live?'Twitch':'the demo state'} before retrying.`);}
  finally{setPendingAction(false);}
 }

 return <div className="app"><header><a className="brand" href="/"> <span className="logo">M<span>↗</span></span> ModMap <span className="beta">LAB</span></a><nav>Community intelligence <span className="divider">/</span> <strong>Overview</strong></nav><div className="connection"><i className={connected?'online':''}/>{connected?'Server connected':'Connecting…'}</div></header>
 <main><section className="heading"><div><div className="eyebrow">YOUR COMMUNITY, IN CONTEXT</div><h1>See the mob.<br className="mobile"/> Protect the person.</h1><p>A live view of who is talking to whom — and when conversation becomes targeting.</p></div><button className="primary" disabled={!connected||data.running||pendingAction} onClick={()=>{setDismissed(false);socket.emit('simulate');}}>{data.running?'◌ Simulation running…':'▷ Run raid simulation'}</button></section>
 <section className="twitch-connect"><div><strong>{twitch?.login?`Twitch · @${twitch.login}`:'Connect your Twitch channel'}</strong><p>{twitch?.phase==='connected'?(twitch.canModerate?(twitch.canReadSubscriptions?'Live chat, moderation and support permissions connected.':'Moderation connected. Enable support info to read subscriptions.'):'Chat connected. Reauthorize to enable Ban, Timeout and Unban.'):twitch?.phase==='connecting'?'Connecting to Twitch chat…':twitch?.phase==='reconnecting'?'Reconnecting to Twitch chat…':setup?.configured?'App credentials loaded. Authorize Twitch to read and moderate chat in your own channel.':'Add your Twitch credentials to .env and restart the server.'}</p></div><div className="twitch-actions">{twitch?.login&&<><button disabled={!connected||pendingAction} onClick={()=>switchView(live?'simulation':'live')}>{live?'View simulation':'View live chat'}</button><button disabled={!connected||pendingAction} onClick={()=>{setRevealed({});socket.emit('disconnectTwitch');}}>Disconnect</button></>}{setup?.configured&&(twitch?.phase!=='connected'||!twitch?.canModerate||!twitch?.canReadSubscriptions)&&twitch?.phase!=='connecting'&&<a className="twitch-login" href={setup.loginUrl}>{twitch?.login?(twitch.canModerate?'Enable support info ↗':'Enable moderation ↗'):'Connect Twitch ↗'}</a>}</div></section>
 {(connectionError||twitch?.error||authError)&&<p className="connection-error" role="alert">{connectionError||twitch?.error||(authError==='denied'?'Twitch authorization was cancelled. Connect again when ready.':'Twitch sign-in failed. Check your registered redirect URL and app credentials.')}</p>}
 <div className="mode"><span className="tag">{live?'LIVE TWITCH':'SIMULATION'}</span><span>{live?'Real chat from your channel. Select chatters to ban, temporarily time out, or unban them.':'Interactive demo: bans and timeouts affect simulated users only. No Twitch requests.'}</span><button onClick={reset} disabled={!connected||pendingAction}>↻ {live?'Clear live view':'Reset demo'}</button></div>
 <section className="stats">{[[data.nodes.length,'Chatters in view','Past 2 minutes'],[data.messages.length,'Messages observed','Rolling window'],[data.nodes.filter(n=>n.score>.6).length,'High-score chatters','Word-filter signal'],[data.alerts.length,'Targeting alerts','5+ distinct senders']].map(([value,label,note])=><div className="stat" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</section>
 {alert&&<section className="alert" role="alert"><div className="alert-icon">!</div><div><strong>Possible coordinated targeting of @{data.nodes.find(n=>n.id===alert.target)?.name??alert.target}</strong><p>{alert.senders} distinct senders · {alert.messages} flagged messages in 30s · {Math.round(alert.similarity*100)} similar message pairs <span className="tag">{alert.simulated?'SIMULATED':'LIVE'}</span></p></div><button onClick={()=>inspect(alert.target)}>Inspect target ↗</button><button aria-label="Dismiss alert" onClick={()=>setDismissed(true)}>×</button></section>}
 <section className="workspace"><div className="graph-panel"><div className="panel-heading"><div><h2>Conversation map <span className="tag">{live?'LIVE TWITCH':'SIMULATED'}</span></h2><p>Replies and mentions reveal the shape of chat.</p></div><span className="window">◷ Last 2 minutes</span></div><div className="toxic-actions"><div><strong>High-score accounts</strong><span>Rolling score &gt; 0.6 · Review before acting</span></div><button disabled={pendingAction||!data.nodes.some(n=>n.score>.6)} onClick={()=>selectMany(data.nodes.filter(n=>n.score>.6))}>Select toxic users</button><button className="danger" disabled={!canBanToxic} onClick={()=>void moderateMany('ban',highScoreUsers)}>Ban all toxic users ({highScoreUsers.length})</button></div><ConversationGraph key={data.mode??'simulation'} nodes={data.nodes} edges={data.edges} giftGiverIds={(data.support?.users??[]).filter(hasGiftedSubs).map(info=>info.userId)} centerId={target?.id} disabled={pendingAction} selectedIds={selectedUsers.length?selectedUsers.map(n=>n.id):selected?[selected]:[]} onInspect={inspect} onSelect={selectMany} onToggle={toggleUser} note={data.nodes.length===0?(live?'Waiting for Twitch messages…':'No messages in this window. Reset or run a simulation.'):(data.running&&!live?'Watching a simulated pile-on form…':'Select a node, or draw around several users')}/><footer className="legend"><span><i style={{background:color(0)}}/>Low signal</span><span><i style={{background:color(.4)}}/>Elevated</span><span><i style={{background:color(.9)}}/>High signal</span><span><i className="gift-giver-key"/>Gift-giver</span><span className="edge-note">↗ Reply or mention · Size = message count</span></footer></div>
 <aside className={selectedUsers.length||active?'selection-panel':undefined}><div className="panel-heading"><div><h2>{selectedUsers.length?`${selectedUsers.length} users selected`:active?`@${active.name}`:'Chat activity'}</h2><p>{active?(active.simulated?'Selected chatter · simulated identity':'Selected chatter · Twitch account'):'Latest messages from the shared ingest pipeline'}</p></div>{(selected||selectedUsers.length>0)&&<button disabled={pendingAction} aria-label="Clear selection" onClick={()=>{setSelected(undefined);setSelectedUsers([]);setSelectedWord(undefined);setBatchResults([]);setActionNotice('');}}>×</button>}</div>{selectedUsers.length>0&&<section className="bulk-panel"><div className="bulk-summary"><strong>{selectedUsers.length} selected</strong><span>{eligible.length} eligible {live?'for Twitch actions':'for simulated actions'}</span></div><p>{selectedWord?'Selected because they used this word in the current window. Review context before applying an action.':'Review the list before applying an action.'}</p><SupportReview support={data.support} users={selectedUsers} disabled={pendingAction} simulation={!live} canRefresh={Boolean(twitch?.canReadSubscriptions)} onExclude={unselectSupporters} onRefresh={()=>socket.emit('refreshSupport')}/><div className="bulk-users">{selectedUsers.map(user=>{const latest=data.nodes.find(n=>n.id===user.id)??user;return <label key={user.id}><input type="checkbox" checked disabled={pendingAction} onChange={()=>toggleUser(user)}/><span className="selected-user-details"><span>@{user.name}</span><SupportBadges info={supportById.get(user.id)}/></span><small style={{color:color(latest.score)}}>{user.simulated?'SIMULATED':user.id===twitch?.userId?'BROADCASTER':latest.score.toFixed(2)}</small></label>;})}</div><TimeoutDuration value={timeoutSeconds} disabled={pendingAction} onChange={setTimeoutSeconds}/><div className="moderation-buttons"><button className="danger" disabled={!canBulk} onClick={()=>void moderateMany('ban')}>Ban selected ({eligible.length})</button><button disabled={!canBulk} onClick={()=>void moderateMany('unban')}>Unban selected</button><button disabled={!canBulk} onClick={()=>void moderateMany('timeout')}>Timeout selected</button></div><p className="moderation-note">{!live?'SIMULATED ACTIONS — no Twitch request. The demo broadcaster is protected.':!twitch?.canModerate?'Enable moderation above to grant Twitch permission.':eligible.length>MAX_BULK?`Select at most ${MAX_BULK} eligible users.`:'Broadcaster and simulated users are excluded. Requests run one at a time.'}</p>{pendingAction&&<button className="stop-batch" onClick={()=>{cancelBatch.current=true;setActionNotice('Stopping after the current request…');}}>Stop remaining actions</button>}{batchResults.length>0&&<div className="bulk-results" aria-live="polite"><strong>Results · {batchResults.length}/{eligible.length}</strong>{batchResults.map(result=><p key={result.userId}><span>{result.ok?'✓':result.attempted?'!':'−'} @{selectedUsers.find(n=>n.id===result.userId)?.name??result.userId}</span><small>{result.ok?(result.simulated?'SIMULATED — no Twitch request':'Confirmed by Twitch'):result.error}</small></p>)}</div>}</section>}{active&&<div className="profile"><span>Rolling word-filter score</span><strong style={{color:color(active.score)}}>{data.nodes.some(n=>n.id===active.id)?active.score.toFixed(2):'—'}</strong><p>Heuristic signal, not a verdict. Review the context before acting.</p>{active.restriction&&<p className="restriction-badge">SIMULATED · {active.restriction==='ban'?'BANNED':`TIMED OUT until ${new Date(active.restrictedUntil!).toLocaleTimeString('en-GB')}`}</p>}<SupportReview support={data.support} users={[]} disabled={pendingAction} simulation={!live} canRefresh={Boolean(twitch?.canReadSubscriptions)} onExclude={unselectSupporters} onRefresh={()=>socket.emit('refreshSupport')}/><SupportBadges info={supportById.get(active.id)}/><UserConnections userId={active.id} nodes={data.nodes} edges={data.edges} disabled={pendingAction} onInspect={inspect}/><TimeoutDuration value={timeoutSeconds} disabled={pendingAction} onChange={setTimeoutSeconds}/><div className="moderation-buttons"><button className="danger" disabled={!canAct} onClick={()=>moderate('ban')}>{pendingAction?'Working…':'Ban user'}</button><button disabled={!canAct} onClick={()=>moderate('unban')}>Unban user</button><button disabled={!canAct} onClick={()=>moderate('timeout')}>Timeout user</button></div><p className="moderation-note">{!live?(active.id===SIMULATED_BROADCASTER?'The simulated broadcaster is protected.':'SIMULATED ACTION — no Twitch request.'):active.id===twitch?.userId?'The broadcaster cannot ban their own account.':!twitch?.canModerate?'Enable moderation above to grant Twitch permission.':'Actions apply to this channel on Twitch.'}</p>{lastAction&&<p>Last ModMap action: {outcome(lastAction.action,lastAction.duration)} at {new Date(lastAction.ts).toLocaleTimeString('en-GB')}.</p>}</div>}<div className="messages" aria-live="polite">{actionNotice&&<p className="action-notice" role="status">{actionNotice}</p>}{messages.length===0?<div className="empty">No messages from this chatter in the current window.</div>:messages.map(m=><article key={m.id} className={m.flagged?'flagged':''}><div className="message-head"><strong onClick={()=>inspect(m.userId)}>{m.userName}</strong><time>{new Date(m.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></div><p>{revealed[m.id]??m.text}</p>{(m.replyToUserId||m.mentions.length>0)&&<div className="message-targets">{m.replyToUserId&&<span>Reply → <button disabled={pendingAction} onClick={()=>inspect(m.replyToUserId!)}> @{m.targetNames?.[m.replyToUserId]??data.nodes.find(n=>n.id===m.replyToUserId)?.name??m.replyToUserId.replace(/^(sim|twitch):/,'')}</button></span>}{m.mentions.length>0&&<span>Mentions → {m.mentions.map(id=><button key={id} disabled={pendingAction} onClick={()=>inspect(id)}> @{m.targetNames?.[id]??data.nodes.find(n=>n.id===id)?.name??id.replace(/^(sim|twitch):/,'')}</button>)}</span>}</div>}<div className="message-foot"><span>{m.simulated?'SIMULATED':'LIVE TWITCH'}</span>{m.flagged&&!revealed[m.id]&&<button onClick={()=>socket.emit('reveal',m.id,(res:{text?:string})=>{if(res.text)setRevealed(old=>({...old,[m.id]:res.text!}));})}>Reveal message</button>}{m.flagged&&revealed[m.id]&&<button onClick={()=>setRevealed(old=>{const next={...old};delete next[m.id];return next;})}>Hide message</button>}</div></article>)}</div>{Boolean(data.moderation?.length)&&<div className="recent-actions"><strong>{live?'Recent Twitch actions':'Recent simulated actions'}</strong>{data.moderation?.slice(0,8).map(entry=><button key={entry.userId} disabled={pendingAction} onClick={()=>inspect(entry.userId)}>@{entry.userName} · {entry.automatic?'Auto · ':''}{outcome(entry.action,entry.duration)} ↗</button>)}</div>}<div className="audit">◈ {data.reveals} messages revealed · Logged for this session</div></aside></section>
 <AutoBanPanel key={`autoban-${mode}`} state={data.autoBan} simulation={!live} connected={connected} canEnable={!live||Boolean(twitch?.canModerate)} onSave={saveAutoBan} onInspect={inspect}/>
 <ToxicWordStats key={`word-trends-${mode}`} stats={data.toxicWords??[]} selectedWord={selectedWord} disabled={pendingAction} onSelect={selectWordUsers} onInspect={inspect}/>
<div className="bottom"><span>Word filters see messages. ModMap sees the mob.</span><span>{live?'Live Twitch chat · Word-list scoring · No AI scoring yet':'Local simulation · Word-list scoring · No AI scoring yet'}</span></div></main></div>;
}

