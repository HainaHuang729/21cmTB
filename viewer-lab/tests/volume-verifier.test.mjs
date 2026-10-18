import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {VolumeVerifier} from '../volume-verifier.js';
import {verifyVolume} from '../data.js';

function fixture(){
  const buffer=new Float32Array(8).fill(.25).buffer;
  const field={byteLength:buffer.byteLength,sha256:createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),statistics:{min:.25,max:.25,mean:.25,count:8,nonfinite:0}};
  return {buffer,field};
}
test('worker validation preserves source bytes and rejects corruption before display',async()=>{
  let calls=0;
  const worker={postMessage(message,transfer){
    calls++;const copy=structuredClone(message,{transfer});
    queueMicrotask(async()=>{
      try{
        const result=await verifyVolume(copy.buffer,copy.field,copy.key);
        worker.onmessage({data:{id:copy.id,value:{...result,data:result.data.buffer,bins:result.bins.buffer}}});
      }catch(error){worker.onmessage({data:{id:copy.id,error:error.message}});}
    });
  },terminate(){}};
  const verifier=new VolumeVerifier({workerFactory:()=>worker}),{buffer,field}=fixture();
  const before=buffer.slice(0),result=await verifier.verify(buffer,field,'xH');
  assert.deepEqual(buffer,before);assert.equal(buffer.byteLength,32);
  assert.deepEqual(result.data,new Float32Array(buffer));assert.ok(result.bins instanceof Uint32Array);
  const corrupt=buffer.slice(0);new Float32Array(corrupt)[0]=.5;
  await assert.rejects(verifier.verify(corrupt,field,'xH'),/校验值不符/);
  assert.equal(calls,2);assert.equal(verifier.jobs.size,0);verifier.dispose();
});
test('worker failure uses the same validator; disposal rejects pending jobs',async()=>{
  const worker={postMessage(){queueMicrotask(()=>worker.onerror());},terminate(){}};
  const verifier=new VolumeVerifier({workerFactory:()=>worker}),{buffer,field}=fixture();
  assert.equal((await verifier.verify(buffer,field,'xH')).mean,.25);
  assert.equal(verifier.worker,null);verifier.dispose();
  const pendingVerifier=new VolumeVerifier({workerFactory:()=>({postMessage(){},terminate(){}})});
  const pending=pendingVerifier.verify(buffer,field,'xH');pendingVerifier.dispose();
  await assert.rejects(pending,{name:'AbortError'});
  await assert.rejects(pendingVerifier.verify(buffer,field,'xH'),{name:'AbortError'});
});
