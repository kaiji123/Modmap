export interface Point { x: number; y: number }

function onSegment(point: Point, a: Point, b: Point): boolean {
  const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
  return Math.abs(cross) < 1e-7 && point.x >= Math.min(a.x,b.x)-1e-7 && point.x <= Math.max(a.x,b.x)+1e-7 && point.y >= Math.min(a.y,b.y)-1e-7 && point.y <= Math.max(a.y,b.y)+1e-7;
}

/** Even/odd polygon test, including its boundary; drawing coordinates are SVG-local. */
export function insideLasso(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  let inside = false;
  for (let i=0,j=polygon.length-1; i<polygon.length; j=i++) {
    const a=polygon[j],b=polygon[i];
    if (onSegment(point,a,b)) return true;
    if ((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}

export function lassoIds(positions: Map<string,Point>, polygon: Point[]): string[] {
  // Treat clicks and accidental tiny scribbles as an empty selection.
  if (polygon.length<3) return [];
  const width=Math.max(...polygon.map(p=>p.x))-Math.min(...polygon.map(p=>p.x));
  const height=Math.max(...polygon.map(p=>p.y))-Math.min(...polygon.map(p=>p.y));
  if (width<4 || height<4) return [];
  return [...positions].filter(([,p])=>insideLasso(p,polygon)).map(([id])=>id);
}
