"""BT native-256 repair: same IC/physics, frozen canonical-scroll Python driver."""
import os,sys,time,json,hashlib
from pathlib import Path
import h5py
import numpy as np
PROJECT=Path('/project/tkcastrosim/HNHuang/project_mcmc')
REPAIR=PROJECT/'data/web_bt_thermal_repair_20261017'
DRIVER=PROJECT/'data/web_pl_thermal_repair_20261016'
sys.path.insert(0,str(DRIVER/'software'))
import py21cmfast as p21
from py21cmfast.c_21cmfast import ffi


def atomic_json(path,value):
 temporary=path.with_suffix(path.suffix+'.pending');temporary.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n');temporary.replace(path)

def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for block in iter(lambda:stream.read(8*1024*1024),b''):h.update(block)
 return h.hexdigest()

def stats(array):
 finite=np.isfinite(array)
 assert finite.all(),'Native output contains non-finite values'
 return {'min':float(array.min()),'max':float(array.max()),'mean':float(array.mean(dtype=np.float64)),'nonfinite':0,'count':array.size}


def main():
 gate=json.loads((DRIVER/'pilot-validation.json').read_text());assert gate['passed']
 build=json.loads((DRIVER/'software/repair-build.json').read_text())
 assert digest(DRIVER/'software/py21cmfast/wrapper.py')==build['fixedWrapperSHA256']
 assert digest(DRIVER/'software/py21cmfast/c_21cmfast.abi3.so')==build['binarySHA256']
 identity=json.loads((PROJECT/'data/web_bt256_full_v1/identity.json').read_text())
 assert p21.__version__==identity['version']
 ic_path=Path(identity['initial_conditions_file'])
 assert ic_path.is_file()
 out=PROJECT/'data/web_bt256_thermal_fixed_v2';out.mkdir(parents=True,exist_ok=False)
 started=time.perf_counter()
 atomic_json(out/'STARTED.json',{'job':os.environ['SLURM_JOB_ID'],'startedUnix':time.time(),'source':identity['simulation_id'],'repair':build})
 assert digest(ic_path)==identity['initial_conditions_sha256'],'Original IC identity changed'
 zs=identity['requested_redshifts'];assert len(zs)==85 and zs[-1]==6
 assert identity['user_params']['POWER_SPECTRUM']==6 and identity['user_params']['HII_DIM']==256
 identity.update(simulation_id='coeval-bt256-thermal-fixed-v2',source_previous_simulation_id='coeval-bt256-full-v1',thermal_evolution_repair=build,repair_validation={'job':gate['job'],'report':str(DRIVER/'pilot-validation.json')},merge_policy='Fresh full thermal/ionization evolution from the identical saved BT IC; no mixing with old temperature or ionization frames',physical_parameters_changed=False)
 cache=out/'cache';cache.mkdir();snapshots=out/'snapshots';snapshots.mkdir()
 with p21.global_params.use(Z_HEAT_MAX=identity['Z_HEAT_MAX']):
  resolved={}
  for key,value in p21.global_params.items():
   if key in ('external_table_path','wisdoms_path'):value=None if value==ffi.NULL else ffi.string(value).decode()
   elif isinstance(value,np.generic):value=value.item()
   resolved[key]=value
  # Only data-table lookup paths may change with the frozen module copy.
  for key,value in identity['resolved_global_params'].items():
   if key not in ('external_table_path','wisdoms_path'):assert resolved[key]==value,(key,resolved[key],value)
  identity['resolved_global_params']=resolved;atomic_json(out/'identity.json',identity)
  ic=p21.InitialConditions.from_file(str(ic_path),load_data=True)
  assert ic.user_params.HII_DIM==256 and ic.random_seed==identity['random_seed']
  # The standard driver writes a fresh cache and returns all requested native cubes.
  print(json.dumps({'phase':'start','requested':len(zs),'output':str(out),'repair':build}),flush=True)
  cubes=p21.run_coeval(redshift=zs,init_box=ic,astro_params=identity['astro_params'],flag_options=identity['flag_options'],write=True,regenerate=False,direc=str(cache))
  assert len(cubes)==85
  records=[];review=[]
  for n,cube in enumerate(cubes,1):
   assert cube.redshift==zs[n-1]
   arrays={key:np.asarray(getattr(cube,attr)) for key,attr in [('xH','xH_box'),('brightness_temperature','brightness_temp'),('density','density'),('Ts','Ts_box'),('Tk','Tk_box')]}
   summary={}
   for key,array in arrays.items():
    assert array.shape==(256,)*3 and array.dtype==np.float32,(key,array.shape,array.dtype)
    summary[key]=stats(array)
   assert summary['xH']['min']>=0 and summary['xH']['max']<=1
   assert summary['density']['min']>=-1
   reasons=[]
   if min(summary['Ts']['min'],summary['Tk']['min'])<.1:reasons.append('source temperature below 0.1 K')
   if max(summary['Ts']['max'],summary['Tk']['max'])>1e6:reasons.append('source temperature above 1e6 K')
   if max(abs(summary['brightness_temperature']['min']),abs(summary['brightness_temperature']['max']))>1e4:reasons.append('source |Tb| above 10000 mK')
   if reasons:review.append({'z':cube.redshift,'reasons':reasons})
   path=snapshots/f'z{cube.redshift:.10f}.h5';temporary=path.with_suffix('.pending')
   with h5py.File(temporary,'w') as h:
    h.attrs['source_simulation_id']=identity['simulation_id'];h.attrs['redshift']=cube.redshift;h.attrs['scale_factor']=1/(1+cube.redshift)
    h.attrs['source_grid_shape']=[256]*3;h.attrs['initial_conditions_sha256']=identity['initial_conditions_sha256'];h.attrs['identity_json']=json.dumps(identity)
    for key in ('xH','brightness_temperature','density'):h.create_dataset(key,data=arrays[key],chunks=(16,256,256),compression='lzf')
   temporary.replace(path)
   with h5py.File(path,'r') as h:
    for key in ('xH','brightness_temperature','density'):
     for x in range(256):assert np.array_equal(h[key][x],arrays[key][x]),(key,x)
   records.append({'redshift':cube.redshift,'file':str(path),'statistics':summary})
   progress_record={'phase':'saving-validated-snapshots','saved':n,'requested':85,'z':cube.redshift,'reviewCount':len(review),'elapsedSeconds':time.perf_counter()-started}
   atomic_json(out/'progress.json',progress_record);print(json.dumps(progress_record),flush=True)
  atomic_json(out/'complete.json',{'validated':not review,'snapshots':records,'review':review,'job':os.environ['SLURM_JOB_ID'],'elapsedSeconds':time.perf_counter()-started,'note':'Range/source and readback checks; physical model not independently certified.'})
  assert not review,review
  print('BT_NATIVE_THERMAL_REPAIR_COMPLETE',flush=True)

if __name__=='__main__':main()
