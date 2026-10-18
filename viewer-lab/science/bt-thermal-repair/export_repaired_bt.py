"""Validate corrected native BT sequence and export the complete 64^3 display set."""
from pathlib import Path
import os,json,hashlib,math,argparse
import numpy as np
import h5py
ROOT=Path('/project/tkcastrosim/HNHuang/project_mcmc')
REPAIR=ROOT/'data/web_bt_thermal_repair_20261017'
DRIVER=ROOT/'data/web_pl_thermal_repair_20261016'
SOURCE=ROOT/'data/web_bt256_thermal_fixed_v2'
OUT=REPAIR/'display64'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--matched-perturb-control',action='store_true')
args=parser.parse_args()
CONTROL=REPAIR/('native-reference-matched-perturb' if args.matched_perturb_control else 'native-reference')


def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for block in iter(lambda:stream.read(8*1024*1024),b''):h.update(block)
 return h.hexdigest()

def stats(a):
 assert np.isfinite(a).all()
 return {'min':float(a.min()),'max':float(a.max()),'mean':float(a.mean(dtype=np.float64)),'nonfinite':0,'negative':int(np.count_nonzero(a<0)),'zero':int(np.count_nonzero(a==0)),'count':a.size}

def save(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.pending');temp.write_text(json.dumps(data,indent=2,allow_nan=False)+'\n');temp.replace(path)

identity=json.loads((SOURCE/'identity.json').read_text());complete=json.loads((SOURCE/'complete.json').read_text())
assert complete['validated'] and not complete['review'] and len(complete['snapshots'])==85
pilot=json.loads((DRIVER/'pilot-validation.json').read_text());assert pilot['passed']
full_pilot=json.loads((DRIVER/'full-pilot-validation.json').read_text());assert full_pilot['passed']
assert sha(Path(identity['initial_conditions_file']))==identity['initial_conditions_sha256']
reference=json.loads((CONTROL/'result.json').read_text());assert reference['passedRangeChecks']
assert reference['sameIC']==identity['initial_conditions_sha256']
comparison_design={'kind':'pristine-cold-single-target'}
if args.matched_perturb_control:
 assert reference['passedStrictControl']
 provenance=reference['inputProvenance']
 assert provenance['sameIC']==identity['initial_conditions_sha256']
 assert provenance['sourceIdentity']==sha(SOURCE/'identity.json')
 assert provenance['sharedEvolvedFields'] is False and provenance['tolerancesChanged'] is False
 assert {'Ts','Tk','xe','xH','Tb','recombination history'}<=set(provenance['independentlyRecomputed'])
 assert provenance['binarySHA256']==identity['thermal_evolution_repair']['originalBinarySHA256']
 for item in provenance['perturbedFields']:
  assert sha(SOURCE/'cache'/item['file'])==sha(CONTROL/'cache'/item['file'])==item['sha256']
 cold=json.loads((REPAIR/'control-diagnostic-2234653.json').read_text())
 assert cold['fields']['density']['passed']
 ablation=json.loads((REPAIR/'input-ablation-2234724/result.json').read_text())
 cases={c['name']:c for c in ablation['cases']}
 for name,target in [('reference_repeat_1','Reference'),('reference_repeat_2','Reference'),('native_repeat','Native'),('native_perturb_only','Native'),('native_temperature_only','Reference'),('native_predecessor_only','Reference')]:
  assert all(v['passed'] for v in cases[name]['againstStored'+target].values())
 assert all(v['maxAbsolute']==0 for v in cases['reference_repeat_2']['againstFirstRepeat'].values())
 mutation=json.loads((REPAIR/'perturbation-state-2234793/result.json').read_text())
 assert mutation['sourceIC']==identity['initial_conditions_sha256'] and mutation['restorationExact']
 assert mutation['pristineRepeat']['differentVoxels']==0 and mutation['historyVsPristine']['differentVoxels']>0
 comparison_design={'kind':'factorized-independent-perturbation-plus-matched-input-thermal-ionization',
  'coldIndependentDensityPassed':True,'coldControlRetained':True,'coldControlJob':cold['job'],
  'matchedPerturbControlPassed':True,'matchedPerturbControlJob':reference['job'],
  'sharedEvolvedFields':False,'tolerancesChanged':False,
  'inputProvenance':provenance,'causalAblationJob':ablation['job'],'stateMutationProbeJob':mutation['job'],
  'cause':'PerturbField.c rescales float32 IC velocity buffers in place and divides them back; round-trip residuals make regenerated perturbations depend on the preceding redshift calls. Their accepted tiny input differences cross discrete partial-ionization branches. Freeze perturbation inputs when testing thermal/ionization evolution.'}
# Independently reconstruct the pristine redshift schedule.
z=6.;canon=[z];factor=identity['resolved_global_params']['ZPRIME_STEP_FACTOR']
while z<35:
 z=(z+1)*factor-1;canon.append(min(z,35.))
canon=sorted(set(canon),reverse=True)
cache=[]
for path in (SOURCE/'cache').glob('TsBox_*.h5'):
 with h5py.File(path,'r') as h:cache.append((float(h.attrs['redshift']),path))
frames=complete['snapshots'];control_frame=next(s for s in frames if s['redshift']==reference['z'])
control_cache=next(p for z,p in cache if abs(z-reference['z'])<1e-9)
metrics={}
with h5py.File(CONTROL/'target.h5','r') as ref,h5py.File(control_frame['file'],'r') as native,h5py.File(control_cache,'r') as thermal:
 for name in ['Ts','Tk','xe','Tb','xH','density']:
  actual=thermal['TsBox/'+{'Ts':'Ts_box','Tk':'Tk_box','xe':'x_e_box'}[name]][:] if name in ('Ts','Tk','xe') else native['brightness_temperature' if name=='Tb' else name][:]
  expected=ref[name][:];difference=actual.astype(float)-expected
  atol=.001 if name in ('Ts','Tk','Tb') else 2e-5 if name=='density' else 1e-6
  mismatch=~np.isclose(actual,expected,rtol=2e-5,atol=atol)
  metrics[name]={'passed':not bool(mismatch.any()),'mismatchedVoxels':int(mismatch.sum()),'rtol':2e-5,'atol':atol,'maxAbsolute':float(np.max(np.abs(difference))),'rms':float(np.sqrt(np.mean(difference*difference)))}
  assert metrics[name]['passed'],(name,metrics[name])

manifest=json.loads((ROOT/'web_21cm_viewer/thermal-repair-bt-20261017/base-bt-manifest.json').read_text())
simulation=identity['simulation_id']+'-display64'
manifest.update(simulationId=simulation,source_simulation_id=identity['simulation_id'],sourceIdentity=sha(SOURCE/'identity.json'),title='BT / native 256³ / thermal evolution repaired',snapshots=[],exporterVersion='bt-thermal-repair-1')
manifest['identity']['icFingerprint']=identity['initial_conditions_sha256']
quality_note='Canonical-scroll thermal/ionization driver repaired. Native source-temperature/range and predecessor-chain checks passed. The pristine cold control independently validates density; the pristine matched-perturbation control independently recomputes thermal/ionization history with identical density/velocity inputs, without sharing evolved fields or changing tolerances. This is not independent physical certification.' if args.matched_perturb_control else 'Canonical-scroll thermal/ionization driver repaired. Native source-temperature/range, predecessor-chain and independent single-target checks passed; this is not independent physical certification.'
manifest['fields']['brightness_temperature'].update(qualityStatus='range-check-passed',qualityNote=quality_note)
manifest['publication'].update(brightnessTemperatureAvailable=85,qualityPolicy=manifest['fields']['brightness_temperature']['qualityNote'])
manifest['thermalEvolutionRepair']={'id':'canonical-scroll-v1','recomputedAllFields':True,'sameInitialConditions':True,'physicalParametersChanged':False,'wrapperSHA256':identity['thermal_evolution_repair']['fixedWrapperSHA256'],'binarySHA256':identity['thermal_evolution_repair']['binarySHA256'],'controlRedshift':reference['z'],'nativeControlDifferences':metrics,'recomputeJob':complete['job'],'exportJob':os.environ['SLURM_JOB_ID']}
manifest['thermalEvolutionRepair']['comparisonDesign']=comparison_design
OUT.mkdir(parents=True,exist_ok=False)
root=OUT/simulation;root.mkdir()
chain=[]
for frame in frames:
 z=frame['redshift'];source=Path(frame['file']);assert source.parent==SOURCE/'snapshots'
 thermal_paths=[p for zz,p in cache if abs(zz-z)<1e-9];assert len(thermal_paths)==1
 with h5py.File(thermal_paths[0],'r') as h:
  actual_prev=float(h.attrs['prev_spin_redshift']);higher=[zz for zz in canon if zz>z+1e-9]
  if z<35:
   expected_prev=min(higher);assert abs(actual_prev-expected_prev)<1e-8,(z,actual_prev,expected_prev)
  else:expected_prev=None
  assert int(h.attrs['random_seed'])==identity['random_seed']
 chain.append({'z':z,'previousZ':actual_prev if math.isfinite(actual_prev) else None,'expectedPreviousZ':expected_prev})
 sid=f'z{z:.10f}';record={'id':sid,'redshift':z,'scaleFactor':1/(1+z),'meanNeutralFraction':frame['statistics']['xH']['mean'],'fields':{},'fieldQuality':{'brightness_temperature':{'status':'range-check-passed','reasons':[],'sourceTemperatureRangeK':{key:[frame['statistics'][key]['min'],frame['statistics'][key]['max']] for key in ('Ts','Tk')}}}}
 source_hash=sha(source);before=source.stat()
 with h5py.File(source,'r') as h:
  assert h.attrs['source_simulation_id']==identity['simulation_id']
  assert h.attrs['initial_conditions_sha256']==identity['initial_conditions_sha256']
  for field in ('xH','brightness_temperature','density'):
   native=h[field][:];assert native.shape==(256,)*3 and native.dtype==np.float32
   actual_stats=stats(native)
   for key in ('min','max','mean'):assert actual_stats[key]==frame['statistics'][field][key]
   reduced=native.reshape(64,4,64,4,64,4).mean(axis=(1,3,5),dtype=np.float64).astype('<f4')
   packed=np.ascontiguousarray(reduced.transpose(2,1,0),dtype='<f4')
   url=f'snapshots/{sid}/{field}.f32.bin';destination=root/url;destination.parent.mkdir(parents=True,exist_ok=True)
   packed.tofile(destination);readback=np.fromfile(destination,dtype='<f4').reshape(64,64,64)
   assert np.array_equal(readback,packed)
   restored=readback.transpose(2,1,0)
   for axis in range(3):assert np.array_equal(np.take(restored,32,axis=axis),np.take(reduced,32,axis=axis))
   for x,y,zz in [(0,0,0),(63,63,63),(32,32,32),(1,17,39)]:assert readback.ravel()[x+64*(y+64*zz)]==reduced[x,y,zz]
   tolerance=np.finfo(np.float32).eps*float(np.abs(native).mean(dtype=np.float64))+1e-12
   assert abs(reduced.mean(dtype=np.float64)-native.mean(dtype=np.float64))<=tolerance
   record['fields'][field]={'url':url,'dtype':'float32-le','byteLength':packed.nbytes,'sha256':sha(destination),'sourceId':source_hash,'statistics':stats(reduced)}
 assert source.stat().st_mtime_ns==before.st_mtime_ns
 manifest['snapshots'].append(record)
 print(json.dumps({'saved':len(manifest['snapshots']),'z':z}),flush=True)
manifest['defaultSnapshot']=min(manifest['snapshots'],key=lambda s:abs(s['meanNeutralFraction']-.5))['id']
for field in ('density','brightness_temperature'):
 values=[s['fields'][field]['statistics'] for s in manifest['snapshots']]
 manifest['fields'][field]['displayRange']=[min(v['min'] for v in values),max(v['max'] for v in values)]
save(root/'manifest-all.json',manifest)
save(OUT/'validation.json',{'passed':True,'snapshots':85,'volumes':255,'nativeControlDifferences':metrics,'predecessorChain':chain,'initialConditionsSHA256':identity['initial_conditions_sha256'],'sourceIdentity':manifest['sourceIdentity'],'recomputeJob':complete['job'],'job':os.environ['SLURM_JOB_ID'],'meanConservationAndXFastestReadback':True,'comparisonDesign':comparison_design})
print('BT_FIXED_EXPORT_COMPLETE',flush=True)
