import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPoint, validateCorners } from '../projects/box-photo-viewer/src/lib/perspective';
import { DEFAULT_CORNERS, MATERIAL_FACES, FACE_VECTORS, validDimensions, type FaceCorners } from '../projects/box-photo-viewer/src/lib/types';

test('identity warp and perspective corners map to the intended source',()=>{
  assert.deepEqual(projectPoint(DEFAULT_CORNERS,.25,.75),{x:.25,y:.75});
  const c:FaceCorners=[{x:.2,y:.1},{x:.8,y:.25},{x:.9,y:.9},{x:.1,y:.8}];
  validateCorners(c);
  for(const [i,[u,v]] of [[0,0],[1,0],[1,1],[0,1]].entries()){
    const result=projectPoint(c,u,v);assert.ok(Math.abs(result.x-c[i].x)<1e-8);assert.ok(Math.abs(result.y-c[i].y)<1e-8);
  }
  const middle=projectPoint(c,.5,.5);assert.ok(middle.x>.1&&middle.x<.9&&middle.y>.1&&middle.y<.9);
});
test('reject self-intersecting, reversed, collapsed, and out-of-range corners',()=>{
  for(const c of [
    [{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}],
    [...DEFAULT_CORNERS].reverse(),
    Array(4).fill({x:.5,y:.5}),
    [{x:-1,y:0},...DEFAULT_CORNERS.slice(1)]
  ])assert.throws(()=>validateCorners(c as FaceCorners));
});
test('dimensions reject invalid numbers and preserve valid proportions',()=>{
  assert.ok(validDimensions({width:40,height:30,depth:20}));
  for(const width of [0,-1,NaN,Infinity])assert.equal(validDimensions({width,height:1,depth:1}),false);
});
test('material order agrees with Three.js face normals including bottom',()=>{
  assert.deepEqual(MATERIAL_FACES.map(f=>FACE_VECTORS[f]),[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);
});
