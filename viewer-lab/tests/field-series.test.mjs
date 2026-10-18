import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {availableFields,snapshotFieldAvailable,nearest,verifyVolume} from '../data.js';
import {fieldGaps,publishedSnapshots,nextPublishedIndex,stageIndices,sampleCacheTasks} from '../field-series.js';

const root=new URL('../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root)));
const manifests={pl:await json('data/pl-manifest.json'),bt:await json('data/bt-manifest.json')};
const archivedBT=await json('data/bt-manifest-source-v1.json');
const registry=await json('data/local-files.json');
const tb='brightness_temperature';

test('both repaired models publish all three fields at all 85 real redshifts',()=>{
  for(const model of Object.values(manifests)){
    assert.equal(model.snapshots.length,85);
    assert.deepEqual(availableFields(model),['xH','density',tb]);
    for(const field of ['xH','density',tb]){
      assert.equal(publishedSnapshots(model.snapshots,field).length,85);
      assert.deepEqual(fieldGaps(model.snapshots,field),[]);
    }
    for(const s of model.snapshots){
      assert.equal(snapshotFieldAvailable(s,tb),true);
      assert.equal(s.fieldQuality[tb].status,'range-check-passed');
    }
  }
});

test('the archived BT source review gap still fails closed and remains navigable',()=>{
  const sequence=archivedBT.snapshots;
  assert.equal(publishedSnapshots(sequence,tb).length,68);
  assert.deepEqual(availableFields(archivedBT),['xH','density']);
  assert.deepEqual(fieldGaps(sequence,tb),[{start:17,end:33,count:17,firstZ:sequence[17].redshift,lastZ:sequence[33].redshift}]);
  assert.equal(nextPublishedIndex(sequence,17,1,tb),34);assert.equal(nextPublishedIndex(sequence,33,-1,tb),16);
  assert.equal(nextPublishedIndex(sequence,0,-1,tb),-1);
  for(const s of sequence){
    assert.equal(snapshotFieldAvailable(s,tb),s.fieldQuality[tb].status==='range-check-passed');
    if(!snapshotFieldAvailable(s,tb))assert.equal(s.fields[tb],undefined);
  }
});

test('BT keeps its IC and records the factorized control without sharing evolved fields or relaxing tolerances',()=>{
  const m=manifests.bt,repair=m.thermalEvolutionRepair,design=repair.comparisonDesign;
  assert.equal(m.source_simulation_id,'coeval-bt256-thermal-fixed-v2');
  assert.equal(m.identity.icFingerprint,'eceb1c4ad4fd694329d4129fcf03ac8c6559c4964ec181eb301bcf875fff7c5b');
  assert.equal(repair.sameInitialConditions,true);assert.equal(repair.physicalParametersChanged,false);
  assert.equal(repair.recomputedAllFields,true);
  assert.equal(design.coldIndependentDensityPassed,true);assert.equal(design.coldControlRetained,true);
  assert.equal(design.matchedPerturbControlPassed,true);assert.equal(design.sharedEvolvedFields,false);
  assert.equal(design.tolerancesChanged,false);
  assert.deepEqual(design.inputProvenance.sharedInputs,['initial_conditions','PerturbedField density/velocity']);
  assert.equal(design.inputProvenance.sameIC,m.identity.icFingerprint);
  for(const field of ['Ts','Tk','xe','xH','Tb','density']){
    const result=repair.nativeControlDifferences[field];
    assert.equal(result.passed,true);assert.equal(result.mismatchedVoxels,0);
    assert.equal(result.rtol,2e-5);
    assert.equal(result.atol,['Ts','Tk','Tb'].includes(field)?.001:field==='density'?2e-5:1e-6);
  }
  assert.deepEqual(m.fields.density.grid,[128,128,128]);
  for(const snapshot of m.snapshots){
    for(const range of Object.values(snapshot.fieldQuality[tb].sourceTemperatureRangeK)){
      assert.ok(range[0]>=.1);assert.ok(range[1]<=1e6);
    }
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

test('switching can retain the same real redshift after both models are repaired',()=>{
  const source=manifests.pl.snapshots[30];
  const match=manifests.bt.snapshots[nearest(manifests.bt.snapshots,source.redshift,'redshift')];
  assert.equal(match.id,source.id);assert.equal(match.redshift,source.redshift);
  assert.equal(snapshotFieldAvailable(source,tb),true);assert.equal(snapshotFieldAvailable(match,tb),true);
  assert.equal(snapshotFieldAvailable(match,'xH'),true);assert.equal(snapshotFieldAvailable(match,'density'),true);
});

test('510 cache tasks include complete local series with aligned per-model native sources',()=>{
  const tasks=sampleCacheTasks(manifests);
  assert.equal(tasks.length,510);assert.equal(tasks.filter(t=>t.model==='pl').length,255);
  assert.equal(tasks.filter(t=>t.model==='bt').length,255);
  for(const {model,snapshot,field}of tasks){
    assert.ok(registry[`${model}/${snapshot.id}/${field}`]);
    const descriptor=snapshot.fields[field];assert.match(descriptor.sourceId,/^[a-f0-9]{64}$/);
    assert.equal(descriptor.sourceId,snapshot.fields.xH.sourceId);
    if(field===tb){
      // A presentation color range is not a physical validity bound.
      const sourceRange=manifests[model].fields[tb].displayRange;
      assert.ok(descriptor.statistics.min>=sourceRange[0]);
      assert.ok(descriptor.statistics.max<=sourceRange[1]);
    }
  }
});

test('representative stages select real published absorption/emission/late frames in each model',async()=>{
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
