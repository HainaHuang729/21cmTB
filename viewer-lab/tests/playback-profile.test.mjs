import test from 'node:test';
import assert from 'node:assert/strict';
import {cavityProfile,needsPreparedGradient} from '../playback-profile.js';

test('only the density glow branch can omit its unused full-volume gradient',()=>{
  assert.equal(needsPreparedGradient(1,'energy'),false);
  assert.equal(needsPreparedGradient(1,'surface'),true);
  for(const kind of [0,2])assert.equal(needsPreparedGradient(kind,'energy'),true);
});
test('pause restores the original fine density profile; playback bounds fullscreen GPU cost',()=>{
  const base={gridSize:128,fieldKind:1,pixelRatio:2,width:579,height:703};
  assert.deepEqual(cavityProfile(base),{scale:2,steps:640});
  const playing=cavityProfile({...base,playing:true});
  assert.ok(playing.scale>=1&&playing.scale<2);
  assert.ok(playing.steps>=128*4&&playing.steps<640);
  for(const [width,height] of [[1710,960],[3840,2160]]){
    const q=cavityProfile({...base,width,height,playing:true});
    assert.ok(q.scale*q.scale*width*height<=1100001);
  }
  assert.deepEqual(cavityProfile({...base,playing:false}),cavityProfile(base));
});
