import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {VolumeStore,REVISION} from '../data.js';
import {BrowserVolumeCache,preloadVolumes,abortable} from '../volume-cache.js';

const manifest=JSON.parse(await readFile(new URL('../data/pl-manifest.json',import.meta.url)));
const snapshot=manifest.snapshots.find(s=>s.id==='z7.0407986210');
const raw=await readFile(new URL(`../data/pl/${snapshot.id}/xH.f32.bin`,import.meta.url));
const buffer=()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
function disk(){
  const caches=new Map();return {caches,storage:{open:async name=>{
    if(!caches.has(name))caches.set(name,new Map());const entries=caches.get(name);
    return {match:async key=>entries.get(key)?.clone(),put:async(key,response)=>entries.set(key,response.clone()),delete:async key=>entries.delete(key)};
  }}};
}
test('persistent cache is scoped to the pinned revision and content hash across source URLs',async()=>{
  const fake=disk(),first=new BrowserVolumeCache(REVISION,{storage:fake.storage});
  await first.write(snapshot.fields.xH,buffer());
  const reopened=new BrowserVolumeCache(REVISION,{storage:fake.storage});
  assert.deepEqual(new Uint8Array(await reopened.read(snapshot.fields.xH)),new Uint8Array(buffer()));
  assert.equal(await new BrowserVolumeCache('other-revision',{storage:fake.storage}).read(snapshot.fields.xH),null);
});
test('a reopened verified volume needs no source download; a corrupt disk entry is replaced',async()=>{
  const original=globalThis.fetch,fake=disk(),persistent=new BrowserVolumeCache(REVISION,{storage:fake.storage});
  await persistent.write(snapshot.fields.xH,buffer());let requests=0;
  globalThis.fetch=async()=>{requests++;return new Response(buffer());};
  try{
    const first=new VolumeStore({pl:manifest},{},{persistent});
    assert.equal((await first.load('pl',snapshot)).mean,snapshot.fields.xH.statistics.mean);assert.equal(requests,0);
    const corrupt=new Uint8Array(buffer());corrupt[100]^=1;await persistent.write(snapshot.fields.xH,corrupt.buffer);
    const next=new VolumeStore({pl:manifest},{},{persistent});
    await next.load('pl',snapshot);assert.equal(requests,1);
    globalThis.fetch=()=>{throw new Error('Must read the repaired persistent cache');};
    await new VolumeStore({pl:manifest},{},{persistent}).load('pl',snapshot);
  }finally{globalThis.fetch=original;}
});
test('shared preload and foreground loads fetch once; cancelling one subscriber preserves the other',async()=>{
  const original=globalThis.fetch;let requests=0,release;
  globalThis.fetch=()=>{requests++;return new Promise(resolve=>release=()=>resolve(new Response(buffer())));};
  try{
    const store=new VolumeStore({pl:manifest},{}),controller=new AbortController();
    const foreground=store.load('pl',snapshot,controller.signal),background=store.load('pl',snapshot);
    const rejected=assert.rejects(foreground,{name:'AbortError'});controller.abort();
    await new Promise(setImmediate);release();await rejected;await background;assert.equal(requests,1);
    await store.load('pl',snapshot);assert.equal(requests,1);
  }finally{globalThis.fetch=original;}
});
test('an entire active sequence stays resident while other sequences retain only eight LRU frames',async()=>{
  const store=new VolumeStore({},{}),active=Array.from({length:12},(_,i)=>({id:`a${i}`})),other=Array.from({length:20},(_,i)=>({id:`b${i}`}));
  store.read=async()=>({data:new Float32Array(1)});store.pinSequence('pl',active,'xH');
  for(const frame of [...active,...other])await store.load('pl',frame);
  assert.equal(store.resident('pl',active,'xH'),12);assert.equal(store.cache.size,20);
  store.pinSequence('pl',other.slice(0,3),'density');
  for(const frame of other.slice(0,3))await store.load('pl',frame,null,'density');
  assert.equal(store.cache.size,11);assert.equal(store.resident('pl',other.slice(0,3),'density'),3);
});
test('preloading is bounded, counts verified successes, and reports failed frames without claiming ready',async()=>{
  let active=0,peak=0;const progress=[];
  const store={load:async(model,snapshot)=>{
    active++;peak=Math.max(peak,active);await new Promise(setImmediate);active--;
    if(snapshot.id===2)throw new Error('bad hash');
  }};
  const tasks=Array.from({length:6},(_,id)=>({model:'pl',snapshot:{id},field:'xH'}));
  const result=await preloadVolumes(store,tasks,{concurrency:2,onProgress:value=>progress.push(value)});
  assert.equal(peak,2);assert.equal(result.completed,5);assert.equal(result.failures.length,1);
  assert.deepEqual(progress.at(-1),{completed:5,total:6,failed:1});
});
test('cancelling a preloader prevents more queued work and a disk quota failure degrades safely',async()=>{
  const controller=new AbortController();let starts=0;
  const store={load:(model,snapshot,signal)=>{starts++;return abortable(new Promise(()=>{}),signal);}};
  const pending=preloadVolumes(store,Array.from({length:9},()=>({model:'pl',snapshot,field:'xH'})),{signal:controller.signal});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(starts,2);
  const persistent=new BrowserVolumeCache(REVISION,{storage:{open:async()=>({put:async()=>{throw new Error('Quota exceeded');}})}});
  assert.equal(await persistent.write(snapshot.fields.xH,buffer()),false);assert.equal(persistent.enabled,false);
});
test('the complete glow viewer has all 189 physical files locally available',async()=>{
  const registry=JSON.parse(await readFile(new URL('../data/local-files.json',import.meta.url)));
  const legacy=JSON.parse(await readFile(new URL('../data/legacy-manifest.json',import.meta.url)));
  for(const [model,m,fields]of [['pl',manifest,['xH','density']],['legacy',legacy,['brightness_temperature']]]){
    for(const s of m.snapshots)for(const field of fields)assert.ok(registry[`${model}/${s.id}/${field}`]);
  }
  assert.equal(manifest.snapshots.length*2+legacy.snapshots.length,189);
});
