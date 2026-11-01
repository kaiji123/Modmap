import type {Point} from './selection';
export interface Viewport {x:number;y:number;zoom:number}
export const INITIAL_VIEW:Viewport={x:0,y:0,zoom:1};
export const MIN_ZOOM=.4;
export const MAX_ZOOM=4;
export function zoomAt(view:Viewport,factor:number,anchor:Point):Viewport {
  if(!Number.isFinite(factor)||factor<=0)return view;
  const zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,view.zoom*factor));
  const ratio=view.zoom/zoom;
  return {x:anchor.x-(anchor.x-view.x)*ratio,y:anchor.y-(anchor.y-view.y)*ratio,zoom};
}
