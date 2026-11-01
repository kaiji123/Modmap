import type {Edge,UserNode} from '../shared/types';
export function UserConnections({userId,nodes,edges,disabled,onInspect}:{userId:string;nodes:UserNode[];edges:Edge[];disabled:boolean;onInspect:(id:string)=>void}){
 const sections=[
  {title:'Mentions / replies to',edges:edges.filter(edge=>edge.source===userId),other:(edge:Edge)=>edge.target},
  {title:'Mentions / replies from',edges:edges.filter(edge=>edge.target===userId),other:(edge:Edge)=>edge.source},
 ];
 return <div className="user-connections">{sections.map(section=><section key={section.title}><strong>{section.title} · {section.edges.length}</strong>{section.edges.length?section.edges.sort((a,b)=>b.score-a.score||b.count-a.count).map(edge=>{const id=section.other(edge);return <button key={id} disabled={disabled} onClick={()=>onInspect(id)}><span>{edge.source===userId?'→':'←'} @{nodes.find(node=>node.id===id)?.name??id.replace(/^(sim|twitch):/,'')}</span><small className={edge.score>.6?'toxic-link':''}>{edge.count} {edge.count===1?'interaction':'interactions'} · {edge.score>.6?'flagged signal':'low signal'}</small></button>;}):<p>No interactions in this window.</p>}</section>)}</div>;
}
