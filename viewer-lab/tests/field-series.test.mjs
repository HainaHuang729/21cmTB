import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {availableFields,snapshotFieldAvailable,FIELDS,nearest,verifyVolume} from '../data.js';
import {fieldGaps,publishedSnapshots,nextPublishedIndex,stageIndices,sampleCacheTasks} from '../field-series.js';

const root=new URL('../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root)));
const manifests={pl:await json('data/pl-manifest.json'),bt:await json('data/bt-manifest.json')};
const registry=await json('data/local-files.json');
const tb='brightness_temperature';

test('partial availability retains all redshift positions and matches the source review policy',()=>{
  for(const [model,count,start,end]of [['pl',44,18,58],['bt',68,17,33]]){
    const m=manifests[model],sequence=m.snapshots;
    assert.equal(sequence.length,85);assert.equal(publishedSnapshots(sequence,tb).length,count);
    assert.deepEqual(availableFields(m),['xH','density']);
    assert.deepEqual(availableFields(m,{partial:true}),['xH','density',tb]);
    assert.deepEqual(fieldGaps(sequence,tb),[{start,end,count:85-count,firstZ:sequence[start].redshift,lastZ:sequence[end].redshift}]);
    assert.equal(nextPublishedIndex(sequence,start,1,tb),end+1);
    assert.equal(nextPublishedIndex(sequence,end,-1,tb),start-1);
    assert.equal(nextPublishedIndex(sequence,0,-1,tb),-1);
    for(const s of sequence){
      assert.equal(snapshotFieldAvailable(s,tb),s.fieldQuality[tb].status==='range-check-passed');
      if(!snapshotFieldAvailable(s,tb))assert.equal(s.fields[tb],undefined);
    }
  }
});

test('model and field selection can keep the identical real redshift without crossing a review gap',()=>{
  const source=manifests.pl.snapshots[30];
  const match=manifests.bt.snapshots[nearest(manifests.bt.snapshots,source.redshift,'redshift')];
  assert.equal(match.id,source.id);assert.equal(match.redshift,source.redshift);
  assert.equal(snapshotFieldAvailable(match,tb),false);
  assert.equal(snapshotFieldAvailable(match,'xH'),true);assert.equal(snapshotFieldAvailable(match,'density'),true);
});

test('452 cache tasks include only published local field volumes with aligned model sources',()=>{
  const tasks=sampleCacheTasks(manifests);
  assert.equal(tasks.length,452);assert.equal(tasks.filter(t=>t.model==='pl').length,214);
  assert.equal(tasks.filter(t=>t.model==='bt').length,238);
  for(const {model,snapshot,field}of tasks){
    assert.ok(registry[`${model}/${snapshot.id}/${field}`]);
    const descriptor=snapshot.fields[field];
    assert.equal(descriptor.sourceId,snapshot.fields.xH.sourceId);
    if(field===tb){
      assert.ok(descriptor.statistics.min>=FIELDS[tb].range[0]);
      assert.ok(descriptor.statistics.max<=FIELDS[tb].range[1]);
    }
  }
  assert.ok(Math.max(...tasks.filter(t=>t.field===tb).map(t=>t.snapshot.fields[tb].statistics.max))>30);
});

test('representative buttons select real published absorption/emission/late frames in each model',async()=>{
  for(const model of ['pl','bt']){
    const sequence=manifests[model].snapshots,indices=stageIndices(sequence,tb);
    assert.equal(new Set(indices).size,3);
    const [absorption,emission,late]=indices.map(i=>sequence[i]);
    assert.ok(absorption.fields[tb].statistics.mean<0);assert.ok(emission.fields[tb].statistics.mean>0);
    assert.ok(Math.abs(late.meanNeutralFraction-.2)<.06);
    for(const s of [absorption,emission,late]){
      const bytes=await readFile(new URL(registry[`${model}/${s.id}/${tb}`],root));
      const result=await verifyVolume(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),s.fields[tb],tb);
      assert.equal(result.mean,s.fields[tb].statistics.mean);
    }
  }
});
