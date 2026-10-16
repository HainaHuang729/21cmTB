import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateManifest, verifyVolume, nearest, index3, axes, FIELDS, fieldColor, normalizedValue, availableFields } from '../data.js';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const manifests = { pl: await json('data/pl-manifest.json'), bt: await json('data/bt-manifest.json'), legacy:await json('data/legacy-manifest.json') };
const localFiles = await json('data/local-files.json');
const asBuffer = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

test('all packaged real snapshots match the pinned hashes and source statistics', async () => {
  for (const m of Object.values(manifests)) validateManifest(m);
  for (const [key, path] of Object.entries(localFiles)) {
    const [model, id,field='xH'] = key.split('/');
    const snapshot = manifests[model].snapshots.find(s => s.id === id);
    assert.ok(snapshot, key);
    const raw = await readFile(new URL(path, root));
    const result = await verifyVolume(asBuffer(raw), snapshot.fields[field],field);
    assert.equal(result.data.length, 64 ** 3);
    assert.equal(result.bins.reduce((a,b) => a+b,0), 64 ** 3);
    if(field==='xH')assert.ok(Math.abs(result.mean - snapshot.meanNeutralFraction) < 1e-6);
    // Independent little-endian reads at x/y/z strides catch accidental axis transposition.
    for (const [x,y,z] of [[1,0,0],[0,1,0],[0,0,1],[31,17,9],[63,63,63]]) {
      const offset = 4*x + 256*y + 16384*z;
      assert.equal(result.data[index3(x,y,z,64)], raw.readFloatLE(offset));
    }
  }
});

test('field availability excludes unpublished Tb and preserves distinct native boxes',()=>{
  assert.deepEqual(availableFields(manifests.pl),['xH','density']);
  assert.deepEqual(availableFields(manifests.bt),['xH','density']);
  assert.deepEqual(availableFields(manifests.legacy),['xH','density','brightness_temperature']);
  assert.equal(manifests.legacy.boxLength,100);assert.equal(manifests.pl.boxLength,250);
  assert.notEqual(manifests.legacy.identity.randomSeed,manifests.pl.identity.randomSeed);
  assert.equal(manifests.legacy.snapshots.length,19);
});

test('signed physical values map consistently without overwriting source floats',async()=>{
  assert.equal(normalizedValue(0,'brightness_temperature'),15/19);
  assert.deepEqual(fieldColor(0,'brightness_temperature'),FIELDS.brightness_temperature.palette[1]);
  assert.equal(normalizedValue(-1,'density'),0);assert.equal(normalizedValue(20,'density'),1);
  const s=manifests.legacy.snapshots.find(s=>s.id==='coeval-z12.99303239');
  const raw=await readFile(new URL(localFiles[`legacy/${s.id}/brightness_temperature`],root));
  const result=await verifyVolume(asBuffer(raw),s.fields.brightness_temperature,'brightness_temperature');
  assert.ok(result.min< -100);assert.ok(result.mean<0);assert.ok(result.data.some(v=>v<0));
  await assert.rejects(verifyVolume(asBuffer(raw),s.fields.brightness_temperature,'xH'),/越界/);
});

test('modified or truncated binary files fail closed', async () => {
  const s=manifests.pl.snapshots.find(s=>s.id==='z7.5329593443');
  const raw=await readFile(new URL(localFiles[`pl/${s.id}`],root));
  const altered=Uint8Array.from(raw); altered[100]^=1;
  await assert.rejects(verifyVolume(altered.buffer,s.fields.xH),/校验值不符/);
  await assert.rejects(verifyVolume(asBuffer(raw.subarray(0,raw.length-4)),s.fields.xH),/长度不符/);
});

test('nonfinite values and inconsistent statistics are rejected even with a matching hash', async () => {
  const s=manifests.pl.snapshots.find(s=>s.id==='z7.5329593443');
  const raw=await readFile(new URL(localFiles[`pl/${s.id}`],root));
  const corrupt=Buffer.from(raw); corrupt.writeFloatLE(NaN,0);
  const descriptor={...s.fields.xH,sha256:createHash('sha256').update(corrupt).digest('hex')};
  await assert.rejects(verifyVolume(asBuffer(corrupt),descriptor),/非有限值/);
  await assert.rejects(verifyVolume(asBuffer(raw),{...s.fields.xH,statistics:{...s.fields.xH.statistics,mean:.123}}),/统计/);
});

test('same-stage and same-redshift selection remain distinct real snapshots', () => {
  const source=manifests.pl.snapshots[nearest(manifests.pl.snapshots,.5,'meanNeutralFraction')];
  assert.equal(source.id,'z7.5329593443');
  const phase=manifests.bt.snapshots[nearest(manifests.bt.snapshots,source.meanNeutralFraction,'meanNeutralFraction')];
  const time=manifests.bt.snapshots[nearest(manifests.bt.snapshots,source.scaleFactor,'scaleFactor')];
  assert.equal(phase.id,'z12.4556115244');
  assert.equal(time.id,source.id);
  assert.equal(time.meanNeutralFraction,0);
  assert.ok(Math.abs(phase.meanNeutralFraction-source.meanNeutralFraction)<.03);
});

test('bad axes, out-of-order time and nonphysical ranges are rejected', () => {
  const wrongAxes=structuredClone(manifests.pl);wrongAxes.coordinates.exportFastestAxis='grid-Z';
  assert.throws(()=>validateManifest(wrongAxes),/轴顺序/);
  const time=structuredClone(manifests.pl);time.snapshots.reverse();assert.throws(()=>validateManifest(time),/时间/);
  const color=structuredClone(manifests.pl);color.fields.xH.displayRange=[0,.9];assert.throws(()=>validateManifest(color),/色标/);
  assert.deepEqual(axes(0),[1,2]);assert.deepEqual(axes(1),[0,2]);assert.deepEqual(axes(2),[0,1]);
});
