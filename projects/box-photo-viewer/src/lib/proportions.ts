import { BOX_FACES, validDimensions, type BoxDimensions, type BoxFace, type BoxProportionEstimate } from './types';

/** Fit log(width/height), log(depth/height) to the available aligned face ratios. */
export function estimateBoxProportions(ratios:Partial<Record<BoxFace,number>>,fallback:BoxDimensions={width:1,height:1,depth:1}):BoxProportionEstimate|undefined {
  const rows:Array<{face:BoxFace;a:number;b:number;value:number}>=[];
  for(const face of BOX_FACES){
    const ratio=ratios[face];if(typeof ratio!=='number'||!Number.isFinite(ratio)||ratio<.001||ratio>1000)continue;
    const [a,b]=face==='front'||face==='back'?[1,0]:face==='left'||face==='right'?[0,1]:[1,-1];
    rows.push({face,a,b,value:Math.log(ratio)});
  }
  if(!rows.length)return undefined;
  let aa=0,ab=0,bb=0,av=0,bv=0;
  for(const r of rows){aa+=r.a*r.a;ab+=r.a*r.b;bb+=r.b*r.b;av+=r.a*r.value;bv+=r.b*r.value;}
  const base=validDimensions(fallback)?fallback:{width:1,height:1,depth:1};
  let x=Math.log(base.width/base.height),z=Math.log(base.depth/base.height);
  const determinant=aa*bb-ab*ab;
  if(determinant>0){x=(av*bb-bv*ab)/determinant;z=(bv*aa-av*ab)/determinant;}
  else if(aa&&bb){x=av/aa+z;} // Top/bottom only: preserve the unknown depth-to-height ratio.
  else if(aa){x=av/aa;}else{z=bv/bb;}
  const dimensions={width:Math.exp(x),height:1,depth:Math.exp(z)};
  if(!validDimensions(dimensions))return undefined;
  return {dimensions,faces:rows.map(r=>r.face),inconsistent:rows.some(r=>Math.abs(r.a*x+r.b*z-r.value)>Math.log(1.2))};
}
