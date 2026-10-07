const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.join(__dirname,'../web_data/joint_repaired600'),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
test('600-step export includes each closed inherited prefix once, and keeps free-ms separate',()=>{
 const m=read('index.json'),o=read('pooled_observables.json'),bands=read('pooled_lf_bands.json'),d=read('diagnostics.json');
 assert.equal(m.fixed.sample_count,38400);assert.equal(m.free_ms.sample_count,12800);assert.equal(o.sample_count,38400);
 m.fixed.sources.forEach(s=>assert.deepEqual(s.shape,[600,32,8]));m.free_ms.sources.forEach(s=>assert.deepEqual(s.shape,[200,32,9]));
 const rows=fs.readFileSync(path.join(dir,'pooled_samples.csv'),'utf8').trim().split('\n').slice(1).map(s=>s.split(',').map(Number));
 assert.equal(rows.length,38400);assert.equal(rows.filter(x=>x[0]===0).length,19200);assert.equal(rows.filter(x=>x[0]===1).length,19200);assert.ok(rows.every(x=>x.length===11&&x.every(Number.isFinite)));
 assert.equal(bands.source_row_count,38400);assert.equal(bands.sample_count,256);assert.equal(bands.selected_row_indices.filter(i=>i<19200).length,128);assert.equal(new Set(bands.selected_row_indices).size,256);
 assert.equal(bands.source_sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'pooled_samples.csv'))).digest('hex'));
 assert.equal(m.status,'EXPLORATORY_NOT_CONVERGED');assert.equal(d.checkpoint_validation,'PASS');assert.equal(d.full.passed,false);assert.deepEqual(d.walkers.zero_movement_walkers_by_ensemble,[0,0]);
 assert.equal(d.sources.length,2);assert.ok(d.sources.every(s=>s.checkpoint.stored_steps===600));
 for(const [n,h] of Object.entries(m.files_sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex'),h);
 const html=fs.readFileSync(path.join(__dirname,'../joint-repaired.html'),'utf8');assert.match(html,/600 × 32 × 2 · 38,400/);assert.match(html,/joint_repaired600\/corner_fixed.png/);assert.doesNotMatch(html,/web_data\/joint_repaired\/corner_fixed/);
});
