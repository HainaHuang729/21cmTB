"""Unmodified driver's single-target native control at the first formerly bad z."""
from pathlib import Path
import sys,os,json,time
import numpy as np
import h5py
ROOT=Path('/project/tkcastrosim/HNHuang/project_mcmc')
sys.path.insert(0,str(ROOT/'software/21cmFAST/src'))
import py21cmfast as p21
identity=json.loads((ROOT/'data/web_pl256_full_v2/identity.json').read_text())
out=ROOT/'data/web_pl_thermal_repair_20261016/native-reference';out.mkdir(parents=True,exist_ok=False)
cache=out/'cache';cache.mkdir()
z=identity['requested_redshifts'][18]
assert 24.35<z<24.36
start=time.perf_counter()
with p21.global_params.use(Z_HEAT_MAX=35):
 ic=p21.InitialConditions.from_file(identity['initial_conditions_file'],load_data=True)
 cube=p21.run_coeval(redshift=z,init_box=ic,astro_params=identity['astro_params'],flag_options=identity['flag_options'],write=True,regenerate=False,direc=str(cache))
 fields={k:np.asarray(getattr(cube,attr)) for k,attr in [('Ts','Ts_box'),('Tk','Tk_box'),('xe','x_e_box'),('Tb','brightness_temp'),('xH','xH_box'),('density','density')]}
 summaries={}
 with h5py.File(out/'target.h5','w') as h:
  h.attrs['z']=z;h.attrs['source_module']=str(p21.__file__);h.attrs['initial_conditions_sha256']=identity['initial_conditions_sha256']
  for key,array in fields.items():
   assert array.shape==(256,)*3 and np.isfinite(array).all()
   h.create_dataset(key,data=array,compression='lzf')
   summaries[key]={'min':float(array.min()),'max':float(array.max()),'mean':float(array.mean(dtype=np.float64))}
 assert summaries['Tk']['min']>.1 and summaries['Ts']['min']>.1
 assert max(abs(summaries['Tb']['min']),abs(summaries['Tb']['max']))<1e4
 report={'job':os.environ['SLURM_JOB_ID'],'grid':256,'z':z,'elapsedSeconds':time.perf_counter()-start,'module':str(p21.__file__),'statistics':summaries,'sameIC':identity['initial_conditions_sha256'],'passedRangeChecks':True}
 (out/'result.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print(json.dumps(report),flush=True)
