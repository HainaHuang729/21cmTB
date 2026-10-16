import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE_FIELDS,sampleDefaults,structureValue,epochThreshold} from '../field-presets.js';
import {evaluateTransfer} from '../transfer.js';

test('density display mapping is monotone while negative density contrast stays outside the bright web',()=>{
  assert.equal(structureValue(-.8,'density'),0);
  assert.equal(structureValue(0,'density'),0);
  const values=[.02,.22,.5,1,3].map(v=>structureValue(v,'density'));
  assert.ok(values.every((v,i)=>i===0||v>values[i-1]));
  assert.equal(structureValue(3,'density'),1);
});

test('brightness threshold means absolute mK and the raw-volume transfer is transparent at signed zero',()=>{
  assert.equal(structureValue(-75,'brightness_temperature'),.75);
  assert.equal(structureValue(75,'brightness_temperature'),.75);
  assert.equal(structureValue(0,'brightness_temperature'),0);
  const defaults=sampleDefaults('brightness_temperature');
  assert.equal(evaluateTransfer(15/19,defaults.points),0);
  assert.equal(SAMPLE_FIELDS.brightness_temperature.model,'pl');
  assert.deepEqual([0,1,2].map(i=>epochThreshold('brightness_temperature',i)),[8,8,5]);
  assert.equal(epochThreshold('brightness_temperature',0,'bt'),50);
  assert.equal(SAMPLE_FIELDS.density.model,SAMPLE_FIELDS.xH.model);
});
