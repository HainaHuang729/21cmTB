const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.join(__dirname,'../web_data/walkers1000');
test('walker export preserves actual ensemble/walker/step identities and full saved coordinates',()=>{
 const index=JSON.parse(fs.readFileSync(path.join(dir,'index.json'))),diag=JSON.parse(fs.readFileSync(path.join(__dirname,'../web_data/joint_repaired1000/diagnostics.json')));
 assert.equal(index.live,false);assert.equal(index.steps,1000);assert.equal(index.walkers,32);assert.equal(index.parameters.length,12);
 index.ensembles.forEach((e,i)=>assert.equal(e.source_sha256,diag.sources[i].sha256));
 const csv=fs.readFileSync(path.join(__dirname,'../web_data/joint_repaired1000/pooled_samples.csv'),'utf8').trim().split('\n'),names=csv.shift().trim().split(','),rows=csv.map(l=>l.split(',').map(Number));
 for(const p of index.parameters){const bytes=fs.readFileSync(path.join(dir,p.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),index.files[p.key].sha256);const data=JSON.parse(bytes);assert.equal(data.ensembles.length,2);
 for(let e=0;e<2;e++){assert.equal(data.ensembles[e].length,32);for(let w=0;w<32;w++){const a=data.ensembles[e][w];assert.equal(a.length,1000);assert.ok(a.every(Number.isFinite));for(let step=0;step<1000;step++){const row=rows[e*32000+step*32+w];assert.equal(row[0],e);if(names.includes(p.key))assert.equal(a[step],row[names.indexOf(p.key)]);if(p.key==='F_STAR10')assert.ok(Math.abs(a[step]-(row[1]+Math.log10(row[2])))<1e-12);}}}
 }
});
