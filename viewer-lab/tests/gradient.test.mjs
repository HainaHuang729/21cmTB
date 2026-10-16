import test from 'node:test';
import assert from 'node:assert/strict';
import {gradientVolume} from '../gradient-volume.js';

test('a uniform field has no gradient emission, including domain faces',()=>{
  const data=new Float32Array(4**3).fill(.5),before=data.slice();
  assert.ok(gradientVolume(data,4).every(v=>v===0));
  assert.deepEqual(data,before);
});
test('a linear scalar ramp retains its gradient direction and clamped boundary convention',()=>{
  const n=5,data=new Float32Array(n**3);
  for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)data[x+n*(y+n*z)]=x+2*y+3*z;
  const result=gradientVolume(data,n);
  const get=(x,y,z)=>Array.from(result.slice((x+n*(y+n*z))*4,(x+n*(y+n*z))*4+4));
  assert.deepEqual(get(2,2,2).slice(0,3),[2,4,6]);
  assert.deepEqual(get(0,0,0).slice(0,3),[1,2,3]);
  assert.deepEqual(get(4,4,4).slice(0,3),[1,2,3]);
  assert.ok(Math.abs(get(2,2,2)[3]-Math.sqrt(56))<1e-6);
  assert.throws(()=>gradientVolume(data,4),RangeError);
});
