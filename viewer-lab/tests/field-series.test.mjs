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

test('the repaired PL has all 85 redshifts; BT retains its explicit source review gap',()=>{
  const pl=manifests.pl,btModel=manifests.bt,sequence=btModel.snapshots;
  assert.equal(pl.snapshots.length,85);assert.equal(publishedSnapshots(pl.snapshots,tb).length,85);
  assert.deepEqual(availableFields(pl),['xH','density',tb]);assert.deepEqual(fieldGaps(pl.snapshots,tb),[]);
  assert.equal(sequence.length,85);assert.equal(publishedSnapshots(sequence,tb).length,68);
  assert.deepEqual(availableFields(btModel),['xH','density']);
  assert.deepEqual(availableFields(btModel,{partial:true}),['xH','density',tb]);
  assert.deepEqual(fieldGaps(sequence,tb),[{start:17,end:33,count:17,firstZ:sequence[17].redshift,lastZ:sequence[33].redshift}]);
  assert.equal(nextPublishedIndex(sequence,17,1,tb),34);assert.equal(nextPublishedIndex(sequence,33,-1,tb),16);
  assert.equal(nextPublishedIndex(sequence,0,-1,tb),-1);
  for(const s of [...pl.snapshots,...sequence]){
    assert.equal(snapshotFieldAvailable(s,tb),s.fieldQuality[tb].status==='range-check-passed');
    if(!snapshotFieldAvailable(s,tb))assert.equal(s.fields[tb],undefined);
  }
});

test('the native repair keeps the identical IC and records the canonical driver/control checks',()=>{
  const m=manifests.pl,repair=m.thermalEvolutionRepair;
  assert.equal(m.source_simulation_id,'coeval-pl256-thermal-fixed-v3');
  assert.equal(m.identity.icFingerprint,'b6600197c677906f43746d8fdd82c0cf7b3e763ae5fb94a44464458aa630e92e');
  assert.equal(repair.sameInitialConditions,true);assert.equal(repair.physicalParametersChanged,false);
  assert.equal(repair.recomputedAllFields,true);assert.match(repair.wrapperSHA256,/^[a-f0-9]{64}$/);
  assert.ok(repair.nativeControlDifferences.Tb.rms<1e-4);
  for(const snapshot of m.snapshots){
    for(const range of Object.values(snapshot.fieldQuality[tb].sourceTemperatureRangeK)){
      assert.ok(range[0]>=.1);assert.ok(range[1]<=1e6);
    }
  }
});

test('source review is model-specific while switching can retain the same real redshift',()=>{
  const source=manifests.pl.snapshots[30];
  const match=manifests.bt.snapshots[nearest(manifests.bt.snapshots,source.redshift,'redshift')];
  assert.equal(match.id,source.id);assert.equal(match.redshift,source.redshift);
  assert.equal(snapshotFieldAvailable(source,tb),true);assert.equal(snapshotFieldAvailable(match,tb),false);
  assert.equal(snapshotFieldAvailable(match,'xH'),true);assert.equal(snapshotFieldAvailable(match,'density'),true);
});

test('493 cache tasks include only published local volumes with aligned per-model native sources',()=>{
  const tasks=sampleCacheTasks(manifests);
  assert.equal(tasks.length,493);assert.equal(tasks.filter(t=>t.model==='pl').length,255);
  assert.equal(tasks.filter(t=>t.model==='bt').length,238);
  for(const {model,snapshot,field}of tasks){
    assert.ok(registry[`${model}/${snapshot.id}/${field}`]);
    const descriptor=snapshot.fields[field];assert.match(descriptor.sourceId,/^[a-f0-9]{64}$/);
    assert.equal(descriptor.sourceId,snapshot.fields.xH.sourceId);
    if(field===tb){
      assert.ok(descriptor.statistics.min>=FIELDS[tb].range[0]);
      assert.ok(descriptor.statistics.max<=FIELDS[tb].range[1]);
    }
  }
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
