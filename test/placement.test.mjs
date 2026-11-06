import test from 'node:test';
import assert from 'node:assert/strict';
import {alphaBounds,fitPerson,placementBox} from '../public/placement.js';
test('alpha bounds retain all visible limbs and ignore transparent photo margins',()=>{
  const data=new Uint8ClampedArray(10*12*4);
  for(const [x,y] of [[2,1],[7,5],[4,10]])data[(y*10+x)*4+3]=255;
  assert.deepEqual(alphaBounds(data,10,12),{x:2,y:1,w:6,h:10});
  assert.throws(()=>alphaBounds(new Uint8ClampedArray(400),10,10),/透明人物/);
  assert.throws(()=>alphaBounds(new Uint8ClampedArray(400).fill(255),10,10),/透明人物/);
});
for(const [name,w,h] of [['tall person',100,1200],['outstretched arms',1200,300],['square pose',500,500]]){
  test(name+' fits completely inside square and portrait scene guides',()=>{
    for(const height of [736,1313]){
      const fit=fitPerson({w,h},736,height),box=placementBox;
      assert.ok(fit.x>=box.x*736);assert.ok(fit.y>=box.y*height);
      assert.ok(fit.x+fit.w<=(box.x+box.w)*736+1e-8);
      assert.ok(fit.y+fit.h<=(box.y+box.h)*height+1e-8);
      assert.ok(Math.abs(fit.w/fit.h-w/h)<1e-8);
    }
  });
}
