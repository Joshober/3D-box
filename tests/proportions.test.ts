import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateBoxProportions } from '../projects/box-photo-viewer/src/lib/proportions';

test('square and wide/tall face photos change the box proportions',()=>{
  assert.deepEqual(estimateBoxProportions({front:1})?.dimensions,{width:1,height:1,depth:1});
  assert.deepEqual(estimateBoxProportions({front:2})?.dimensions,{width:2,height:1,depth:1});
  assert.deepEqual(estimateBoxProportions({front:.5})?.dimensions,{width:.5,height:1,depth:1});
});
test('side and top measurements resolve depth consistently',()=>{
  const result=estimateBoxProportions({front:2,right:3,top:2/3})!;
  assert.ok(Math.abs(result.dimensions.width-2)<1e-10);assert.ok(Math.abs(result.dimensions.depth-3)<1e-10);assert.equal(result.inconsistent,false);
  const top=estimateBoxProportions({top:2},{width:1,height:1,depth:3})!.dimensions;assert.ok(Math.abs(top.width-6)<1e-10&&Math.abs(top.depth-3)<1e-10);
});
test('missing faces preserve unconstrained ratios; inconsistent photos are flagged',()=>{
  const partial=estimateBoxProportions({front:2},{width:5,height:2,depth:6})!.dimensions;assert.ok(Math.abs(partial.width-2)<1e-10&&Math.abs(partial.depth-3)<1e-10);
  assert.equal(estimateBoxProportions({front:1,back:4})?.inconsistent,true);
  assert.equal(estimateBoxProportions({}),undefined);assert.equal(estimateBoxProportions({front:NaN,right:Infinity,top:0}),undefined);
});
