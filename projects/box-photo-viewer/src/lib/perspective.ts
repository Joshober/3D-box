import { DEFAULT_CORNERS, type FaceCorners, type FacePhoto, type Point } from './types';
import { loadPhoto, PhotoInputError, type PhotoLoadOptions } from './photo-source';

export function validateCorners(c: FaceCorners): void {
  if (!Array.isArray(c) || c.length !== 4 || c.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x<0 || p.y<0 || p.x>1 || p.y>1)) throw new PhotoInputError('invalid-input','Keep all four corners inside the photo.');
  const crosses = c.map((p,i) => {
    const q=c[(i+1)%4], r=c[(i+2)%4];
    return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);
  });
  if (crosses.some(n => n <= 0.00001)) throw new Error('Select a convex face clockwise: top-left, top-right, bottom-right, bottom-left.');
}

/** Projective map from the unit square to a quadrilateral; preserves perspective. */
export function projectPoint(c: FaceCorners, u: number, v: number): Point {
  const [a,b,d,e]=c;
  const dx1=b.x-d.x, dx2=e.x-d.x, dx3=a.x-b.x+d.x-e.x;
  const dy1=b.y-d.y, dy2=e.y-d.y, dy3=a.y-b.y+d.y-e.y;
  const det=dx1*dy2-dx2*dy1;
  const g=(dx3*dy2-dx2*dy3)/det, h=(dx1*dy3-dx3*dy1)/det;
  const denom=g*u+h*v+1;
  return {x:((b.x-a.x+g*b.x)*u+(e.x-a.x+h*e.x)*v+a.x)/denom,
    y:((b.y-a.y+g*b.y)*u+(e.y-a.y+h*e.y)*v+a.y)/denom};
}
export async function renderPhoto(photo: FacePhoto, maxSize=1024, options:PhotoLoadOptions={}): Promise<HTMLCanvasElement> {
  if(!photo || ![0,90,180,270].includes(photo.rotation??0))throw new PhotoInputError('invalid-input','Rotation must be 0, 90, 180, or 270 degrees.');
  const corners=photo.corners ?? DEFAULT_CORNERS; validateCorners(corners);
  const loaded=await loadPhoto(photo.src,options);const img=loaded.image;
  try {
  maxSize=Math.max(1,Math.min(1024,Number.isFinite(maxSize)?maxSize:1024));
  const dist=(a:Point,b:Point)=>Math.hypot((a.x-b.x)*img.width,(a.y-b.y)*img.height);
  const w=Math.max(dist(corners[0],corners[1]),dist(corners[3],corners[2]));
  const h=Math.max(dist(corners[0],corners[3]),dist(corners[1],corners[2]));
  const scale=Math.min(1,maxSize/Math.max(w,h));
  const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(w*scale)); canvas.height=Math.max(1,Math.round(h*scale));
  const source=document.createElement('canvas');
  const sourceScale=Math.min(1,2048/Math.max(img.width,img.height));
  source.width=Math.max(1,Math.round(img.width*sourceScale)); source.height=Math.max(1,Math.round(img.height*sourceScale));
  const ctx=source.getContext('2d')!; ctx.drawImage(img,0,0,source.width,source.height);
  const pixels=ctx.getImageData(0,0,source.width,source.height).data;
  const out=canvas.getContext('2d')!; const data=out.createImageData(canvas.width,canvas.height);
  for(let y=0;y<canvas.height;y++) {
    if(y%32===0){await new Promise<void>(resolve=>setTimeout(resolve,0));options.signal?.throwIfAborted();}
    for(let x=0;x<canvas.width;x++) {
    const p=projectPoint(corners,x/Math.max(1,canvas.width-1),y/Math.max(1,canvas.height-1));
    const sx=Math.max(0,Math.min(source.width-1,p.x*(source.width-1))), sy=Math.max(0,Math.min(source.height-1,p.y*(source.height-1)));
    const x0=Math.floor(sx), y0=Math.floor(sy), x1=Math.min(x0+1,source.width-1), y1=Math.min(y0+1,source.height-1), fx=sx-x0, fy=sy-y0;
    for(let k=0;k<4;k++) data.data[(y*canvas.width+x)*4+k]=
      pixels[(y0*source.width+x0)*4+k]*(1-fx)*(1-fy)+pixels[(y0*source.width+x1)*4+k]*fx*(1-fy)+
      pixels[(y1*source.width+x0)*4+k]*(1-fx)*fy+pixels[(y1*source.width+x1)*4+k]*fx*fy;
  }
  }
  out.putImageData(data,0,0);
  const rotation=photo.rotation ?? 0;
  if(!rotation) return canvas;
  const rotated=document.createElement('canvas'); const swap=rotation===90 || rotation===270;
  rotated.width=swap?canvas.height:canvas.width; rotated.height=swap?canvas.width:canvas.height;
  const r=rotated.getContext('2d')!; r.translate(rotated.width/2,rotated.height/2); r.rotate(rotation*Math.PI/180); r.drawImage(canvas,-canvas.width/2,-canvas.height/2);
  return rotated;
  } finally { loaded.dispose(); }
}
