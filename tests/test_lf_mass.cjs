const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const base = fs.existsSync(path.join(root,'static')) ? path.join(root,'static') : root;
const {magnitude, stellarFraction} = require(path.join(base,'lf-mass.js'));
const cosmo = {OMm:.308,OMb:.0484,hlittle:.678};
const astro = {F_STAR10:-1.3,ALPHA_STAR:.5,t_STAR:.5};

test('full stellar fraction has the correct pivot, slopes, cap and domain', () => {
  assert.equal(stellarFraction(-1.3,.5,1e10),10**-1.3);
  assert.ok(Math.abs(stellarFraction(-1.3,.5,1e12)-10**-.3)<1e-14);
  assert.equal(stellarFraction(-1.3,.5,1e13),1);
  assert.equal(stellarFraction(-1,.5,1e12),1);
  assert.equal(stellarFraction(-1,-.5,1e7),1);
  assert.equal(stellarFraction(-1,0,1e7),.1);
  assert.equal(stellarFraction(-1,0,1e13),.1);
  for (const mass of [0,-1,NaN,Infinity]) assert.equal(stellarFraction(-1,.5,mass),null);
});

test('mass-to-UV mapping respects SFR, halo mass, redshift and efficiency cap', () => {
  const u = magnitude(astro,cosmo,6);
  assert.ok(u > -20 && u < -15);
  assert.ok(Math.abs(magnitude({...astro,F_STAR10:-1},cosmo,6)-u+.75)<1e-10);
  assert.ok(Math.abs(magnitude({...astro,t_STAR:1},cosmo,6)-u-2.5*Math.log10(2))<1e-10);
  assert.equal(magnitude({...astro,ALPHA_STAR:2},cosmo,6),u);
  assert.ok(magnitude(astro,cosmo,10)<u);
  assert.equal(magnitude({...astro,F_STAR10:1},cosmo,6),magnitude({...astro,F_STAR10:0},cosmo,6));
  assert.equal(magnitude({...astro,t_STAR:0},cosmo,6),null);
  assert.equal(magnitude(astro,{},6),null);
});

test('all published best-fit marker positions agree with the JS relation', () => {
  const data = path.join(root,'web_data');
  if (!fs.existsSync(data)) return;
  const catalog = JSON.parse(fs.readFileSync(path.join(data,'lf_main_comparison/index.json')));
  for (const model of [...catalog.models,catalog.pl_only]) {
    const marker = model.halo_mass_marker;
    assert.equal(marker.halo_mass_msun,1e10);
    assert.ok(marker.native_mapping_max_error_mag<1e-4);
    for (const [z,u] of Object.entries(marker.muv_by_redshift))
      assert.ok(Math.abs(magnitude(model.best_astro,cosmo,Number(z))-u)<1e-7);
  }
});

test('OAT reset is explicit, but PL remains kp=0 during astrophysical scans', () => {
  const source = fs.readFileSync(path.join(base,'app.js'),'utf8');
  const resolve = source.slice(source.indexOf('function resolveRunId('),source.indexOf('\nfunction ',source.indexOf('function resolveRunId(')+1));
  const state = {parameters:{KP_h_Mpc:10,MS:2.5,F_STAR10:-1},activeAstro:null,
    controls:new Map(['KP_h_Mpc','MS','F_STAR10','t_STAR'].map(name=>[name,{name}])),
    design:{mappings:{astro_oat:{F_STAR10:['astro-result']}}}};
  const resets=[];
  const context={window:{},state,astroNames:new Set(['F_STAR10','t_STAR']),currentIndex:()=>0,
    resetOne:c=>{resets.push(c.name);if(c.name==='KP_h_Mpc')state.parameters.KP_h_Mpc=1;if(c.name==='MS')state.parameters.MS=1.5;},selectedGridRunId:()=> 'grid-result'};
  vm.createContext(context);vm.runInContext(resolve,context);
  assert.equal(context.resolveRunId('F_STAR10'),'astro-result');
  assert.deepEqual(resets,['KP_h_Mpc','MS','t_STAR']);
  assert.equal(state.parameters.KP_h_Mpc,1);assert.equal(state.parameters.MS,1.5);
  state.parameters.KP_h_Mpc=0;state.parameters.MS=4;resets.length=0;
  assert.equal(context.resolveRunId('F_STAR10'),'astro-result');
  assert.deepEqual(resets,['t_STAR']);assert.equal(state.parameters.KP_h_Mpc,0);
  assert.equal(state.parameters.MS,4);
});
