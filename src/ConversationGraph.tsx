import { useEffect, useRef, useState } from 'react';
import type { Edge, UserNode } from '../shared/types';
import { lassoIds, type Point } from './selection';
import { INITIAL_VIEW, MIN_ZOOM, MAX_ZOOM, zoomAt, type Viewport } from './viewport';

interface GraphData { nodes: UserNode[]; edges: Edge[]; centerId?: string }
interface Props extends GraphData {
  selectedIds: string[];
  giftGiverIds: string[];
  disabled: boolean;
  note: string;
  onInspect: (id: string) => void;
  onToggle: (node: UserNode) => void;
  onSelect: (nodes: UserNode[]) => void;
}
const color=(score:number)=>score>.6?'#ff667f':score>=.3?'#ffc66d':'#61d9b0';
function layout(nodes: UserNode[], centerId?: string): Map<string,Point> {
  const rest=nodes.filter(n=>n.id!==centerId);
  return new Map(nodes.map(n=>{
    if(n.id===centerId)return [n.id,{x:410,y:290}];
    const angle=rest.indexOf(n)/Math.max(rest.length,1)*Math.PI*2;
    return [n.id,{x:410+Math.cos(angle)*(n.score>.6?220:290),y:290+Math.sin(angle)*(n.score>.6?190:240)}];
  }));
}

export function ConversationGraph(props: Props) {
  const [draw,setDraw]=useState(false),[polygon,setPolygon]=useState<Point[]>([]);
  const [frozen,setFrozen]=useState<GraphData>();
  const [view,setView]=useState<Viewport>(INITIAL_VIEW),[isPanning,setIsPanning]=useState(false);
  const svgRef=useRef<SVGSVGElement>(null);
  const viewRef=useRef(view);viewRef.current=view;
  const panning=useRef<{pointer:number;start:Point;clientStart:Point;inverse:DOMMatrix;view:Viewport;moved:boolean}>();
  const suppressClick=useRef(false);
  const drawing=useRef<{pointer:number;points:Point[];data:GraphData;positions:Map<string,Point>}>();
  const data=frozen??props,positions=layout(data.nodes,data.centerId);
  const giftGivers=new Set(props.giftGiverIds);
  function point(svg:SVGSVGElement,clientX:number,clientY:number):Point|undefined {
    const transform=svg.getScreenCTM();
    if(!transform)return;
    const local=new DOMPoint(clientX,clientY).matrixTransform(transform.inverse());
    return {x:local.x,y:local.y};
  }
  useEffect(()=>{
    const svg=svgRef.current;if(!svg)return;
    const wheel=(event:WheelEvent)=>{
      if(props.disabled||drawing.current||panning.current)return;
      event.preventDefault();
      const anchor=point(svg,event.clientX,event.clientY);if(!anchor)return;
      const unit=event.deltaMode===1?16:event.deltaMode===2?580:1;
      const factor=Math.exp(Math.max(-1,Math.min(1,-event.deltaY*unit*.0015)));
      setView(current=>zoomAt(current,factor,anchor));
    };
    svg.addEventListener('wheel',wheel,{passive:false});
    return()=>svg.removeEventListener('wheel',wheel);
  },[props.disabled]);
  function zoom(factor:number){setView(current=>zoomAt(current,factor,{x:current.x+410/current.zoom,y:current.y+290/current.zoom}));}
  function cancel(svg?:SVGSVGElement){
    const active=drawing.current??panning.current;drawing.current=undefined;panning.current=undefined;setIsPanning(false);setPolygon([]);setFrozen(undefined);
    if(svg&&active&&svg.hasPointerCapture(active.pointer))svg.releasePointerCapture(active.pointer);
  }
  return <>
    <div className="selection-toolbar"><div className="selection-tools" role="group" aria-label="Graph selection mode">
      <button disabled={props.disabled} aria-pressed={!draw} onClick={()=>setDraw(false)}>↗ Inspect / move</button>
      <button disabled={props.disabled} aria-pressed={draw} onClick={()=>setDraw(true)}>⌁ Draw selection</button>
    </div><span>{draw?'Draw a loop around users · Esc cancels':'Drag to move · Scroll to zoom · Shift-click to select'}</span></div>
    <div className={`graph${draw?' drawing-mode':' move-mode'}${isPanning?' panning':''}`}>
      <div className="zoom-controls" role="group" aria-label="Map view controls">
        <button aria-label="Zoom out" title="Zoom out (-)" disabled={props.disabled||Boolean(frozen)||view.zoom<=MIN_ZOOM} onClick={()=>zoom(1/1.25)}>−</button>
        <output aria-label="Map zoom">{Math.round(view.zoom*100)}%</output>
        <button aria-label="Zoom in" title="Zoom in (+)" disabled={props.disabled||Boolean(frozen)||view.zoom>=MAX_ZOOM} onClick={()=>zoom(1.25)}>+</button>
        <button aria-label="Reset map view" title="Reset map view (0)" disabled={props.disabled||Boolean(frozen)} onClick={()=>setView(INITIAL_VIEW)}>Reset view</button>
      </div>
      <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${820/view.zoom} ${580/view.zoom}`} role="group" tabIndex={0} aria-label="Conversation network. Drag to pan, scroll to zoom, or use arrow keys and plus/minus when focused. Draw selection lassos users; Shift-Enter adds a focused node."
        onPointerDown={event=>{
          if(props.disabled||!event.isPrimary||event.button!==0)return;
          suppressClick.current=false;
          const p=point(event.currentTarget,event.clientX,event.clientY);if(!p)return;
          const current={nodes:props.nodes,edges:props.edges,centerId:props.centerId};
          if(draw){
            drawing.current={pointer:event.pointerId,points:[p],data:current,positions:layout(current.nodes,current.centerId)};
            setFrozen(current);setPolygon([p]);event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
          }else{
            const transform=event.currentTarget.getScreenCTM();if(!transform)return;
            panning.current={pointer:event.pointerId,start:p,clientStart:{x:event.clientX,y:event.clientY},inverse:transform.inverse(),view:{...viewRef.current},moved:false};
            if(!(event.target as Element).closest('.node'))event.currentTarget.focus();
          }
        }}
        onPointerMove={event=>{
          const pan=panning.current;
          if(pan&&pan.pointer===event.pointerId){
            if(!pan.moved&&Math.hypot(event.clientX-pan.clientStart.x,event.clientY-pan.clientStart.y)<4)return;
            if(!pan.moved){
              pan.moved=true;suppressClick.current=true;setIsPanning(true);
              setFrozen({nodes:props.nodes,edges:props.edges,centerId:props.centerId});
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            const moved=new DOMPoint(event.clientX,event.clientY).matrixTransform(pan.inverse);
            setView({...pan.view,x:pan.view.x+pan.start.x-moved.x,y:pan.view.y+pan.start.y-moved.y});
            event.preventDefault();return;
          }
          const active=drawing.current;if(!active||active.pointer!==event.pointerId)return;
          const p=point(event.currentTarget,event.clientX,event.clientY);if(!p)return;
          const last=active.points[active.points.length-1];
          if(Math.hypot(last.x-p.x,last.y-p.y)<2||active.points.length>=2000)return;
          active.points.push(p);setPolygon([...active.points]);
        }}
        onPointerUp={event=>{
          if(panning.current?.pointer===event.pointerId){cancel(event.currentTarget);return;}
          const active=drawing.current;if(!active||active.pointer!==event.pointerId)return;
          const p=point(event.currentTarget,event.clientX,event.clientY);if(p)active.points.push(p);
          const ids=new Set(lassoIds(active.positions,active.points));
          props.onSelect(active.data.nodes.filter(n=>ids.has(n.id)));cancel(event.currentTarget);
        }}
        onPointerLeave={()=>{if(panning.current&&!panning.current.moved)cancel();}}
        onPointerCancel={event=>cancel(event.currentTarget)}
        onLostPointerCapture={()=>{if(drawing.current||panning.current)cancel();}}
        onKeyDown={event=>{
          if(event.key==='Escape'){cancel(event.currentTarget);event.preventDefault();return;}
          if(event.target!==event.currentTarget||props.disabled||drawing.current||panning.current)return;
          const key=event.key;
          if(key==='+'||key==='=')zoom(1.25);
          else if(key==='-')zoom(1/1.25);
          else if(key==='0')setView(INITIAL_VIEW);
          else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key))setView(current=>({...current,x:current.x+(key==='ArrowRight'?40:key==='ArrowLeft'?-40:0)/current.zoom,y:current.y+(key==='ArrowDown'?40:key==='ArrowUp'?-40:0)/current.zoom}));
          else return;
          event.preventDefault();
        }}>
        <defs>{['safe','toxic'].map((v,i)=><marker key={v} id={v} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={i?'#ff667f':'#61d9b0'}/></marker>)}<radialGradient id="glow"><stop stopColor="#61d9b0" stopOpacity=".12"/><stop offset="1" stopColor="#61d9b0" stopOpacity="0"/></radialGradient></defs>
        <circle cx="410" cy="290" r="220" fill="url(#glow)"/>
        {[100,190,270].map(r=><circle key={r} cx="410" cy="290" r={r} fill="none" stroke="#ffffff08" strokeDasharray="3 7"/>)}
        {data.edges.map(edge=>{
          const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)return null;
          const d=Math.hypot(b.x-a.x,b.y-a.y);if(!d)return null;
          return <line key={`${edge.source}-${edge.target}`} x1={a.x} y1={a.y} x2={b.x-(b.x-a.x)/d*22} y2={b.y-(b.y-a.y)/d*22} stroke={color(edge.score)} strokeOpacity=".6" strokeWidth={Math.min(4,1+edge.count*.5)} markerEnd={`url(#${edge.score>.6?'toxic':'safe'})`}><title>{data.nodes.find(n=>n.id===edge.source)?.name} → {data.nodes.find(n=>n.id===edge.target)?.name}: {edge.count} interactions, {edge.score>.6?'flagged signal':'low signal'}</title></line>;
        })}
        {data.nodes.map(node=>{
          const p=positions.get(node.id)!,selected=props.selectedIds.includes(node.id),giftGiver=giftGivers.has(node.id);
          return <g className="node" key={node.id} role="button" tabIndex={props.disabled?-1:0} aria-pressed={selected} aria-label={`${node.name}${giftGiver?', subscription gift-giver':''}, score ${node.score.toFixed(2)}${node.restriction?`, ${node.restriction}`:''}${selected?', selected':''}`}
            onClick={event=>{if(props.disabled||draw||suppressClick.current)return;if(event.shiftKey)props.onToggle(node);else props.onInspect(node.id);}}
            onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(props.disabled)return;if(event.shiftKey||draw)props.onToggle(node);else props.onInspect(node.id);}}}>
            {selected&&<circle cx={p.x} cy={p.y} r={28+Math.min(node.count,10)} fill="#9ae9ff18" stroke="#a3e9ff" strokeWidth="2" strokeDasharray="4 3"/>}
            <circle cx={p.x} cy={p.y} r={20+Math.min(node.count,10)} fill={node.restriction?'#718098':color(node.score)} opacity=".1"/>
            {giftGiver&&<circle className="gift-giver-ring" cx={p.x} cy={p.y} r={14+Math.min(node.count,10)} fill="none" stroke="#f4c86b" strokeWidth="2.5" vectorEffect="non-scaling-stroke"><title>Subscription gift-giver · Select this user for support details</title></circle>}
            <circle cx={p.x} cy={p.y} r={8+Math.min(node.count,10)} fill={node.restriction?'#718098':color(node.score)} stroke={selected?'#fff':'#0c1018'} strokeWidth="3"/>
            <text x={p.x} y={p.y+46} textAnchor="middle" fill="#c4cbd7" fontSize="12">{node.name}{node.restriction?` · ${node.restriction==='ban'?'BANNED':'TIMEOUT'}`:''}</text>
          </g>;
        })}
        {polygon.length>1&&<polygon className="lasso" points={polygon.map(p=>`${p.x},${p.y}`).join(' ')} fill="#8dd6ff18" stroke="#a3e9ff" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none"/>}
      </svg>
      <div className="graph-note">{drawing.current?'Release to select enclosed users':props.note}</div>
    </div>
  </>;
}
