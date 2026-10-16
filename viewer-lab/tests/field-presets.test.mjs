import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE_FIELDS,sampleDefaults,structureValue,epochThreshold} from '../field-presets.js';
import {evaluateTransfer} from '../transfer.js';
import {readFile} from 'node:fs/promises';

test('density display mapping is monotone while negative density contrast stays outside the bright web',()=>{
  assert.equal(structureValue(-.8,'density'),0);
  assert.equal(structureValue(0,'density'),0);
  const values=[.02,.22,.5,1,3].map(v=>structureValue(v,'density'));
  assert.ok(values.every((v,i)=>i===0||v>values[i-1]));
  assert.equal(structureValue(3,'density'),1);
});

test('the transition preset is a real cached snapshot with both absorption and emission',async()=>{
  const id=SAMPLE_FIELDS.brightness_temperature.snapshotIDs[1];
  const bytes=await readFile(new URL(`../data/legacy/${id}/brightness_temperature.f32.bin`,import.meta.url));
  let positive=0,negative=0;
  for(let i=0;i<bytes.length;i+=4){const value=bytes.readFloatLE(i);if(value>0)positive++;if(value<0)negative++;}
  assert.ok(positive>0&&negative>0);
  assert.equal(SAMPLE_FIELDS.brightness_temperature.defaultEpoch,1);
});
test('brightness threshold means absolute mK and the raw-volume transfer is transparent at signed zero',()=>{
  assert.equal(structureValue(-75,'brightness_temperature'),.75);
  assert.equal(structureValue(75,'brightness_temperature'),.75);
  assert.equal(structureValue(0,'brightness_temperature'),0);
  const defaults=sampleDefaults('brightness_temperature');
  assert.equal(evaluateTransfer(5/6,defaults.points),0);
  assert.equal(SAMPLE_FIELDS.brightness_temperature.model,'legacy');
  assert.deepEqual([0,1,2].map(i=>epochThreshold('brightness_temperature',i)),[75,7,8]);
  assert.equal(SAMPLE_FIELDS.density.model,SAMPLE_FIELDS.xH.model);
});
