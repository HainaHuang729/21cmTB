import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {ATLAS_FIELDS,atlasColor,atlasValue,checkHash,decodeAtlasField,validateSlices,loadAtlasIndex} from '../atlas-data.js';

const base=new URL('../../web_data/',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const index=await json('index.json');
const asArrayBuffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);

test('static deployment reuses the repository slice data without copying the local symlink',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async url=>{
    requested.push(url);
    return url==='../web_data/index.json'?Response.json(index):new Response('',{status:404});
  };
  try{
    const result=await loadAtlasIndex();assert.equal(result.base,'../web_data/');
    assert.equal(result.index.inventory.length,55);assert.equal(result.index.pl_inventory.length,32);
    assert.deepEqual(requested,['./atlas-data/index.json','../web_data/index.json']);
  }finally{globalThis.fetch=original;}
});

test('paired color windows retain the signed zero and valid endpoint colors',()=>{
  const white=ATLAS_FIELDS.brightness.palette[1];
  assert.deepEqual(atlasColor(0,'brightness',[0,25]),white);
  assert.deepEqual(atlasColor(0,'brightness',[-150,0]),white);
  assert.deepEqual(atlasColor(0,'brightness',[-40,20]),white);
  assert.notDeepEqual(atlasColor(-30,'brightness',[-40,20]),atlasColor(20,'brightness',[-40,20]));
  assert.deepEqual(atlasColor(10,'spin',[10,1000]),ATLAS_FIELDS.spin.palette[0]);
  assert.deepEqual(atlasColor(1000,'spin',[10,1000]),ATLAS_FIELDS.spin.palette[2]);
});

test('real BPL and matched PL decode all five fields at independent row/column/frame offsets',async()=>{
  const bpl=index.inventory.find(e=>e.run_id===index.baseline_run_id);
  const meta=await json(`runs/${bpl.run_id}.json`);
  const pl=index.pl_inventory.find(e=>e.pl_id===meta.pl_reference.pl_id);
  const reference=await json(`pl/${pl.pl_id}.json`);
  assert.deepEqual(meta.slices.redshift,reference.slices.redshift);
  for(const [entry,kind,id,metadata] of [[bpl,'runs',bpl.run_id,meta],[pl,'pl',pl.pl_id,reference]]){
    const metadataBytes=await readFile(new URL(`${kind}/${id}.json`,base));await checkHash(asArrayBuffer(metadataBytes),entry.web_sha256);
    const bytes=await readFile(new URL(`${kind}/${id}.slices.bin`,base));await checkHash(asArrayBuffer(bytes),entry.slice_binary_sha256);
    validateSlices(metadata.slices,bytes.length);
    for(const [field,f] of Object.entries(ATLAS_FIELDS)){
      const decoded=await decodeAtlasField(asArrayBuffer(bytes),metadata.slices,field),d=metadata.slices.binary_fields[f.key];
      const independentlyInflated=inflateSync(bytes.subarray(d.offset,d.offset+d.compressed_bytes));
      for(const [frame,column,row] of [[0,1,0],[0,0,1],[13,173,49],[31,255,255]]){
        const raw=independentlyInflated.readInt16LE(2*(frame*65536+row*256+column))*metadata.slices[f.scale];
        const expected=f.log?10**raw:raw;assert.equal(atlasValue(decoded,frame,column,row),expected);
        const color=atlasColor(expected,field);assert.ok(color.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
        if(field==='ionized')assert.ok(expected>=0&&expected<=1);
        if(field==='density')assert.ok(expected>= -1);
        if(f.log)assert.ok(expected>0);
      }
      assert.throws(()=>atlasValue(decoded,32,0,0),/超出/);
    }
  }
});

test('slice transport rejects changed hashes, bad dimensions, overlapping blocks and wrong scales',async()=>{
  const meta=await json(`runs/${index.baseline_run_id}.json`),entry=index.inventory.find(e=>e.run_id===index.baseline_run_id);
  const bytes=await readFile(new URL(`runs/${index.baseline_run_id}.slices.bin`,base));
  const corrupt=Buffer.from(bytes);corrupt[0]^=1;await assert.rejects(checkHash(asArrayBuffer(corrupt),entry.slice_binary_sha256),/校验失败/);
  const wrong=structuredClone(meta.slices);wrong.shape=[256,256,32];assert.throws(()=>validateSlices(wrong,bytes.length),/形状/);
  const overlap=structuredClone(meta.slices);overlap.binary_fields.density_i16_le.offset=0;assert.throws(()=>validateSlices(overlap,bytes.length),/字段描述/);
  const scale=structuredClone(meta.slices);scale.temperature_log10_quantization=-1;assert.throws(()=>validateSlices(scale,bytes.length),/字段描述/);
  assert.throws(()=>validateSlices(meta.slices,bytes.length-1),/长度/);
  await assert.rejects(decodeAtlasField(asArrayBuffer(bytes),meta.slices,'invented'),/未知/);
});
