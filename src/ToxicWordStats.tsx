import {useState} from 'react';
import type {ToxicWordStat} from '../shared/types';

interface Props {
 stats:ToxicWordStat[];
 selectedWord?:string;
 disabled:boolean;
 onSelect:(stat:ToxicWordStat)=>void;
 onInspect:(userId:string)=>void;
}
const mask=(word:string)=>word.length>2?word[0]+'•'.repeat(word.length-2)+word[word.length-1]:'••';
export function ToxicWordStats({stats,selectedWord,disabled,onSelect,onInspect}:Props){
 const [showWords,setShowWords]=useState(false);
 return <section className="word-stats" aria-label="Toxic word statistics"><div className="word-stats-heading"><div><h2>Toxic word trends</h2><p>Past 2 minutes · Normalized word-list matches · Select a word’s users for review</p></div><button aria-pressed={showWords} onClick={()=>setShowWords(value=>!value)}>{showWords?'Mask words':'Show words'}</button></div>
  {stats.length?<div className="word-table"><div className="word-table-head"><span>Matched word</span><span>Usage</span><span>Used by</span><span>Select users</span></div>{stats.map((stat,index)=><div key={stat.word} className={`word-row${selectedWord===stat.word?' selected-word':''}`}>
   <button className="word-term" disabled={disabled} aria-pressed={selectedWord===stat.word} onClick={()=>onSelect(stat)}><span className="word-rank">{index+1}</span><strong>{showWords?stat.word:mask(stat.word)}</strong>{index===0&&<span className="word-top">MOST USED</span>}</button>
   <div className="word-usage"><strong>{stat.count} {stat.count===1?'use':'uses'}</strong><small>{stat.messageCount} {stat.messageCount===1?'message':'messages'}</small><div className="word-bar"><span style={{width:`${stat.count/stats[0].count*100}%`}}/></div></div>
   <div className="word-authors">{stat.users.map(user=><button key={user.userId} disabled={disabled} onClick={()=>onInspect(user.userId)}> @{user.userName} <span>×{user.count}</span></button>)}</div>
   <button className="word-select" disabled={disabled} aria-pressed={selectedWord===stat.word} onClick={()=>onSelect(stat)}>Select {stat.users.length} {stat.users.length===1?'user':'users'} ↗</button>
  </div>)}</div>:<div className="word-empty">No word-list matches in this window. Start the simulation or wait for live chat.</div>}
  {stats.length>0&&<p className="word-footnote">Disguised spellings count together. Original messages stay masked. Selection captures the listed users when clicked; moderation requires a separate action.</p>}
 </section>;
}
