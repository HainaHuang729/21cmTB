const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {summarize,limits}=require('../convergence.js');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../web_data/convergence/diagnostics-20261018.json'),'utf8'));
test('source lengths and explicit windows are preserved',()=>{
  assert.deepEqual(data.sources.map(s=>s.shape),[[2000,32,8],[1000,32,8]]);
  assert.equal(data.full.independent_rhat_available,false);
  assert.equal(data.recent1000_vs_reference1000.steps,1000);
  assert.equal(data.material_passport.origin_date,'2026-10-18');
});
test('all pass counts come from saved metrics, including auxiliary quantities',()=>{
  const s=summarize(data);
  assert.equal(s.rows.length,12);assert.equal(s.sampled.length,8);
  assert.deepEqual(s.passCounts,[0,0,1,12,3]);
  assert.equal(s.sampled.filter(r=>r.checks.every(Boolean)).length,0);
  assert.deepEqual(s.rows.filter(r=>r.checks[2]).map(r=>r.key),['ALPHA_ESC']);
  assert.deepEqual(s.rows.filter(r=>r.checks[4]).map(r=>r.key),['ALPHA_STAR','L_X','tau']);
  assert.equal(s.worstRhat,2.203330458708539);
  assert.equal(s.minLength,11.959082897105608);
  assert.equal(s.lengthOnlyTarget,8362);assert.equal(s.lengthOnlyTarget-data.full.steps,6362);
});
test('the late-window comparison is not substituted into full-chain IAT/ESS',()=>{
  const s=summarize(data);
  for(const r of s.rows){
    assert.equal(r.rhat,data.recent1000_vs_reference1000.parameters[r.key].max_rank_folded_rhat_across_matching_walkers);
    assert.equal(r.length,data.full.parameters[r.key].length_over_IAT);
    assert.equal(r.ess,data.full.parameters[r.key].estimated_ensemble_mean_ESS);
  }
  assert.equal(data.recent1000_vs_reference1000.parameters.xHI_z5p9.estimated_ensemble_mean_ESS,null);
  assert.deepEqual(data.recent1000_vs_reference1000.parameters.xHI_z5p9.last_half_constant_walker_sequences,[3,1]);
  assert.equal(limits.length,50);assert.equal(limits.ess,2000);
});
test('wrong dataset and invalid values fail explicitly',()=>{
  const altered=structuredClone(data);altered.full.steps=1000;
  assert.throws(()=>summarize(altered),/Unexpected/);
  const bad=structuredClone(data);bad.full.parameters.ETA_STAR.length_over_IAT=null;
  assert.throws(()=>summarize(bad),/Missing or nonfinite/);
});
test('main page and joint page expose the new panel without relabeling old plots',()=>{
  const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  assert.match(read('index.html'),/data-convergence="summary"/);
  assert.match(read('joint-repaired.html'),/id="convergence" data-convergence="full" data-convergence-archive/);
  for(const file of ['index.html','joint-repaired.html']) assert.match(read(file),/mcmc-progress\.js\?v=20261020-1/);
  const progress=JSON.parse(read('web_data/cache_comparison/progress.json'));
  assert.deepEqual(progress.chains.map(c=>c.stored_steps),[2000,1000]);
  assert.ok(progress.chains.every(c=>c.scheduler_state==='COMPLETED'));
  assert.equal(progress.plot_snapshot_stored_steps_per_ensemble,1000);
  assert.equal(progress.convergence.diagnostics,'web_data/convergence/diagnostics-20261018.json');
  assert.equal(progress.convergence.recent_equal1000_max_rhat,summarize(data).worstRhat);
});
