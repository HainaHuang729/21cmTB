import test from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotPlayer} from '../snapshot-player.js';

function fixture(load){
  let index=0,active=0,maxActive=0,cancelled=0;const jobs=new Map(),shown=[];let nextTimer=0;
  const player=new SnapshotPlayer({getIndex:()=>index,getCount:()=>3,load:async i=>{
    active++;maxActive=Math.max(maxActive,active);const ok=load?await load(i):true;active--;
    if(ok){index=i;shown.push(i);}return ok;
  },schedule:fn=>{jobs.set(++nextTimer,fn);return nextTimer;},unschedule:id=>jobs.delete(id),cancelPending:()=>cancelled++});
  return {player,shown,jobs,tick:async()=>{const [id,fn]=jobs.entries().next().value;jobs.delete(id);await fn();},maxActive:()=>maxActive,cancelled:()=>cancelled};
}
test('playback visits real frame indices in order, waits for loads and stops at the end',async()=>{
  const f=fixture();await f.player.start();assert.deepEqual(f.shown,[0]);
  await f.tick();await f.tick();assert.deepEqual(f.shown,[0,1,2]);
  assert.equal(f.player.playing,false);assert.equal(f.jobs.size,0);assert.equal(f.maxActive(),1);
  await f.player.start();assert.deepEqual(f.shown,[0,1,2,0]);f.player.pause();
});
test('pausing an in-flight load cannot schedule another frame after it resolves',async()=>{
  let release;const f=fixture(()=>new Promise(resolve=>release=resolve));const pending=f.player.start();
  f.player.pause(true);release(true);await pending;
  assert.equal(f.player.playing,false);assert.equal(f.jobs.size,0);assert.equal(f.cancelled(),1);
});
test('a failed frame stops playback rather than skipping a redshift',async()=>{
  const f=fixture(async i=>i!==1);await f.player.start();await f.tick();
  assert.deepEqual(f.shown,[0]);assert.equal(f.player.playing,false);assert.equal(f.jobs.size,0);
});
test('no next timer is queued until the current asynchronous frame is ready',async()=>{
  let release;const f=fixture(i=>i===1?new Promise(resolve=>release=resolve):true);
  await f.player.start();const pending=f.tick();
  assert.deepEqual(f.shown,[0]);assert.equal(f.jobs.size,0);
  release(true);await pending;assert.deepEqual(f.shown,[0,1]);assert.equal(f.jobs.size,1);
  f.player.pause();
});
test('native timer wrappers preserve browser receiver requirements',async()=>{
  const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;let callback,cleared;
  globalThis.setTimeout=function(fn){assert.equal(this,globalThis);callback=fn;return 42;};
  globalThis.clearTimeout=function(id){assert.equal(this,globalThis);cleared=id;};
  try{
    const player=new SnapshotPlayer({getIndex:()=>0,getCount:()=>2,load:async()=>true});
    await player.start();assert.equal(typeof callback,'function');player.pause();assert.equal(cleared,42);
  }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
test('loading and drawing consume the frame interval rather than adding a second wait',async()=>{
  let clock=0,index=0,loadingMs=35;const jobs=[];
  const player=new SnapshotPlayer({getIndex:()=>index,getCount:()=>4,now:()=>clock,delay:()=>120,
    load:async i=>{clock+=loadingMs;index=i;return true;},
    schedule:(fn,ms)=>{jobs.push({fn,ms});return jobs.length;},unschedule:()=>{}});
  await player.start();assert.equal(jobs[0].ms,85);
  clock+=85;loadingMs=180;await jobs.shift().fn();
  assert.equal(jobs[0].ms,0,'late frames must not wait another full interval');
  loadingMs=20;await jobs.shift().fn();
  assert.equal(jobs[0].ms,100,'a late frame must not cause a catch-up burst');
  assert.equal(index,2);player.pause();
});
test('changing speed during a pending timer keeps the current frame as the time origin',async()=>{
  let clock=0,delay=120,timer,cleared;const player=new SnapshotPlayer({
    getIndex:()=>0,getCount:()=>2,now:()=>clock,delay:()=>delay,load:async()=>true,
    schedule:(fn,ms)=>{timer={fn,ms};return 7;},unschedule:id=>{cleared=id;}});
  await player.start();clock=40;delay=60;player.reschedule();
  assert.equal(cleared,7);assert.equal(timer.ms,20);player.pause();
});
