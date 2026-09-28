const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const json = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const catalog = json('web_data/mcmc/index.json');
const lf = json(`${catalog.categories.lf_only.directory}/index.json`);
const joint = json(`${catalog.categories.joint.directory}/index.json`);

test('pooled observables retain actual joint samples and numerical provenance', () => {
  const p=json(`${catalog.categories.joint.directory}/pooled_observables.json`);
  assert.equal(p.sample_count,12800);assert.equal(p.status,'EXPLORATORY_NOT_CONVERGED');
  assert.match(p.aggregation,/Repeated|repeated/);
  const best=p.best_sample,offset=best.ensemble*6400+best.step_zero_based*32+best.walker;
  assert.deepEqual(best.theta,joint.samples[offset]);
  assert.ok(Math.abs(p.lf.recomputed_log_lf-best.log_likelihood_components.LF)<.01);
  assert.deepEqual(p.lf.redshifts,[6,7,8,10]);
  assert.equal(Object.values(p.lf.observations).flat().length,34);
  assert.ok(Object.values(p.lf.observations).flat().every(r=>r.muv>-20));
  assert.equal(p.xi_history.redshifts.length,32);
  p.xi_history.redshifts.forEach((z,i)=>{
    const q=p.xi_history.quantiles.map(row=>row[i]);
    assert.ok(q.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.ok(q[0]<=q[1]&&q[1]<=q[2]);
  });
  assert.equal(p.lf.mass_marker.halo_mass_msun,1e10);
  assert.doesNotMatch(JSON.stringify(p),/\/oss06\/|\/project\/|\/storage01\//);
  for(const file of ['pooled_lf.png','pooled_tau_xi.png']){
    const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,catalog.categories.joint.directory,file))).digest('hex');
    assert.equal(hash,joint.figure_sha256[file]);
  }
});

test('all active inference branches use -20 chains, not relabelled -23 chains', () => {
  for (const item of [lf, joint, ...Object.values(catalog.categories)]) {
    assert.equal(item.magnitude_cut, -20);
    assert.equal(item.lf_points, 34);
  }
  assert.equal(lf.models.length, 25);
  assert.equal(lf.pl_only.steps_per_ensemble, 30000);
  assert.match(lf.pl_only.source, /pl_lf_muv20_control_20260916/);
  assert.equal(lf.models.filter(m => m.diagnostic_gate_passed).length, catalog.categories.lf_only.diagnostic_gate_passed_count);
  for (const m of lf.models) {
    assert.match(m.source, /web_bpl_lf_muv20_grid_20260917/);
    assert.equal(m.steps_per_ensemble, 15000);
    assert.equal(m.magnitude_cut, -20);
    assert.equal(m.pl_baseline.magnitude_cut, -20);
    assert.deepEqual(m.pl_baseline.best_astro, lf.pl_only.best_astro);
    assert.ok(Math.abs(m.recomputed_best_log_LF - m.best_log_LF) < .01);
    const data = json(`${catalog.categories.lf_only.directory}/${m.file.replace('.png', '.json')}`);
    assert.equal(data.lf_points, 34);
    assert.equal(Object.values(data.observations).flat().length, 34);
    assert.ok(Object.values(data.observations).flat().every(p => p.muv > -20));
    assert.deepEqual(data.bpl_best_astro, m.best_astro);
    assert.deepEqual(data.pl_best_astro, lf.pl_only.best_astro);
    assert.deepEqual(data.pl, json('web_data/park_pl_comparison/index.json').PL.curves);
  }
});

test('joint data are explicitly a new fixed-cosmology eight-parameter functional test', () => {
  assert.equal(joint.status, 'EXPLORATORY_NOT_CONVERGED');
  assert.deepEqual(joint.sources[0].shape, [200, 32, 8]);
  assert.equal(joint.sources.length, 2);
  assert.deepEqual(joint.fixed, {KP_h_Mpc: 10, MS: 2.5});
  assert.equal(joint.simulation.HII_DIM, 128);
  assert.equal(joint.sample_count, 12800);
  assert.equal(joint.continuation_included, true);
  assert.equal(joint.diagnostic_gate_passed, false);
  assert.equal(joint.samples.length, 12800);
  assert.equal(new Set(joint.parameters).size, 8);
  joint.samples.forEach((row, i) => {
    assert.equal(row.length, 8);
    assert.ok(row.every(Number.isFinite));
    assert.ok(Math.abs(joint.native_samples[i][0] - row[0] - Math.log10(row[1])) < 1e-12);
  });
  const audit = json(`${catalog.categories.joint.directory}/layout_audit.json`);
  for (const file of ['corner_eta.png', 'corner_native.png']) {
    assert.equal(audit[file].passed, true);
    assert.deepEqual(audit[file].panels,['LF z6','LF z7','LF z8','LF z10','tau','xHI']);
    const h=json(`${catalog.categories.joint.directory}/pooled_observables.json`);
    const display=audit[file].history_display;
    assert.equal(display.quantity,'volume_mean_neutral_hydrogen_fraction');
    assert.equal(display.observation_direction,'upper');
    assert.equal(display.observation_threshold,h.observational_inputs.neutral_fraction.threshold);
    display.quantiles.forEach((row,j)=>row.forEach((v,i)=>assert.ok(Math.abs(v-(1-h.xi_history.quantiles[2-j][i]))<1e-12)));
    display.best.forEach((v,i)=>assert.ok(Math.abs(v-(1-h.xi_history.best[i]))<1e-12));
    assert.equal(audit[file].layout,'park-inspired-lf-2x2-stacked-history-tau');
    const pos=audit[file].positions;
    assert.equal(pos[0][0],pos[2][0]);assert.equal(pos[1][0],pos[3][0]);
    assert.equal(pos[0][1],pos[1][1]);assert.equal(pos[2][1],pos[3][1]);
    assert.ok(pos[4][1]+pos[4][3]<pos[5][1]);
    assert.ok(Math.abs(pos[5][0]+pos[5][2]-pos[4][0]-pos[4][2])<1e-10);
    assert.ok(Math.abs(pos[5][0]+pos[5][2]-pos[1][0]-pos[1][2])<1e-10);
    assert.ok(Math.abs(pos[4][2]/pos[4][3]-pos[5][2]/pos[5][3])<1e-10);
    assert.ok(pos[4][2]/pos[4][3]>1.5);
    assert.deepEqual(audit[file].text_overlaps, []);
    assert.deepEqual(audit[file].clipped_text, []);
    const relative = `${catalog.categories.joint.directory}/${file}`;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
    assert.equal(hash, joint.figure_sha256[file]);
    assert.equal(hash, catalog.files_sha256[relative]);
  }
});

test('LF band uses reproducible balanced retained-row selection and explicit finite support',()=>{
  const dir=catalog.categories.joint.directory,b=json(`${dir}/pooled_lf_bands.json`);
  assert.equal(b.status,'EXPLORATORY_NOT_CONVERGED');
  assert.equal(b.source_row_count,12800);assert.equal(b.sample_count,256);
  assert.equal(b.selection_seed,20260928);assert.deepEqual(b.quantile_levels,[.16,.5,.84]);
  assert.equal(new Set(b.selected_row_indices).size,256);
  assert.equal(b.selected_row_indices.filter(i=>i<6400).length,128);
  assert.ok(b.selected_row_indices.every(i=>Number.isInteger(i)&&i>=0&&i<12800));
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,dir,b.source))).digest('hex');
  assert.equal(hash,b.source_sha256);
  for(const z of ['6.0','7.0','8.0','10.0']){
    const c=b.curves[z];assert.ok(c.finite_row_count.some(n=>n===256));
    c.muv.forEach((m,i)=>{
      const q=c.log10_phi_quantiles.map(row=>row[i]);
      if(c.finite_row_count[i]!==256)assert.deepEqual(q,[null,null,null]);
      else{assert.ok(q.every(Number.isFinite));assert.ok(q[0]<=q[1]&&q[1]<=q[2]);}
    });
  }
});

test('active pages and defaults do not expose the old cutoff or joint branch', () => {
  for (const name of ['index.html', 'ms-corner.html', 'ms-corner.js']) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    assert.doesNotMatch(text, /49 LF|same 49|160 saved|Seven sampled|06B \/ 7D|Fixed kₚ\. Free mₛ\.|web_data\/ms_corner_(?:chunk1|lfstyle)\//);
  }
  const page = fs.readFileSync(path.join(root, 'ms-corner.html'), 'utf8');
  assert.match(page, /SOURCE JOB \/ 2153993/);
  assert.match(page, /128/);
  // Historical evidence remains available, but is never passed off as new data.
  assert.ok(fs.existsSync(path.join(root, 'web_data/ms_corner_chunk1/index.json')));
});
