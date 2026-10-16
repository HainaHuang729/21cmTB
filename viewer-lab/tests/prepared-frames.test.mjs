import test from 'node:test';
import assert from 'node:assert/strict';
import {PreparedFrames} from '../prepared-frames.js';
import {gradientVolume} from '../gradient-volume.js';

test('worker preparation deduplicates requests, transfers a copy, and preserves verified source floats',async()=>{
  let calls=0;const worker={postMessage(message,transfer){
    calls++;const copy=structuredClone(message,{transfer});
    queueMicrotask(()=>worker.onmessage({data:{id:copy.id,gradients:gradientVolume(new Float32Array(copy.data)).buffer}}));
  },terminate(){}};
  const data=Float32Array.from({length:64**3},(_,i)=>i%64),original=data.slice();
  const frames=new PreparedFrames({workerFactory:()=>worker,limit:2});
  const [a,b]=await Promise.all([frames.get('first',data),frames.get('first',data)]);
  assert.equal(a,b);assert.equal(calls,1);assert.equal(data.byteLength,1048576);assert.deepEqual(data,original);
  assert.deepEqual(a,gradientVolume(data));
  await frames.get('second',data);await frames.get('third',data);assert.equal(frames.cache.size,2);
  assert.equal(frames.cache.has('first'),false);frames.dispose();
});
test('missing workers fall back to the same gradient and aborted subscribers cannot start work',async()=>{
  const frames=new PreparedFrames({workerFactory:()=>{throw new Error('unavailable');}}),data=new Float32Array(64**3);
  assert.deepEqual(await frames.get('uniform',data),gradientVolume(data));
  const controller=new AbortController();controller.abort();
  await assert.rejects(frames.get('cancelled',data,controller.signal),{name:'AbortError'});
  assert.equal(frames.cache.has('cancelled'),false);frames.dispose();
});
