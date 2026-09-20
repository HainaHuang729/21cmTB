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
  assert.equal(joint.status, 'SMOKE_ONLY_NOT_CONVERGED_NOT_A_POSTERIOR');
  assert.deepEqual(joint.sources[0].shape, [3, 16, 8]);
  assert.equal(joint.sources.length, 1);
  assert.deepEqual(joint.fixed, {KP_h_Mpc: 10, MS: 2.5});
  assert.equal(joint.simulation.HII_DIM, 256);
  assert.equal(joint.sample_count, 48);
  assert.equal(joint.continuation_included, false);
  assert.equal(joint.diagnostic_gate_passed, false);
  assert.equal(joint.samples.length, 48);
  assert.equal(new Set(joint.parameters).size, 8);
  joint.samples.forEach((row, i) => {
    assert.equal(row.length, 8);
    assert.ok(row.every(Number.isFinite));
    assert.ok(Math.abs(joint.native_samples[i][0] - row[0] - Math.log10(row[1])) < 1e-12);
  });
  const audit = json(`${catalog.categories.joint.directory}/layout_audit.json`);
  for (const file of ['corner_eta.png', 'corner_native.png']) {
    assert.equal(audit[file].passed, true);
    assert.deepEqual(audit[file].text_overlaps, []);
    assert.deepEqual(audit[file].clipped_text, []);
    const relative = `${catalog.categories.joint.directory}/${file}`;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
    assert.equal(hash, joint.figure_sha256[file]);
    assert.equal(hash, catalog.files_sha256[relative]);
  }
});

test('active pages and defaults do not expose the old cutoff or joint branch', () => {
  for (const name of ['index.html', 'ms-corner.html', 'ms-corner.js']) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    assert.doesNotMatch(text, /49 LF|same 49|160 saved|Seven sampled|06B \/ 7D|Fixed kₚ\. Free mₛ\.|web_data\/ms_corner_(?:chunk1|lfstyle)\//);
  }
  const page = fs.readFileSync(path.join(root, 'ms-corner.html'), 'utf8');
  assert.match(page, /SOURCE JOB \/ 2135863/);
  assert.match(page, /256/);
  // Historical evidence remains available, but is never passed off as new data.
  assert.ok(fs.existsSync(path.join(root, 'web_data/ms_corner_chunk1/index.json')));
});
