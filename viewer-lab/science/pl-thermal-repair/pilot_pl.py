"""Small-grid causal regression: dense outputs vs pristine single-target evolution."""
import os,sys,json,hashlib,time,shutil
from pathlib import Path
import numpy as np
ROOT=Path('/project/tkcastrosim/HNHuang/project_mcmc')
BASE=ROOT/'data/web_pl_thermal_repair_20261016'
case=sys.argv[1];assert case in ('old-dense','fixed-dense','single-target','single-original','fixed-offgrid')
sys.path.insert(0,str(ROOT/'software/21cmFAST/src' if case in ('old-dense','single-original') else BASE/'software'))
import py21cmfast as p21
from py21cmfast.c_21cmfast import ffi
identity=json.loads((ROOT/'data/web_pl256_full_v2/identity.json').read_text())
assert p21.__version__==identity['version']
user={**identity['user_params'],'HII_DIM':32,'DIM':96,'N_THREADS':int(os.environ.get('PILOT_THREADS','4'))}
flags=identity['flag_options'];zs=identity['requested_redshifts'] if os.environ.get('PILOT_FULL')=='1' else identity['requested_redshifts'][:21];target=zs[int(os.environ.get('PILOT_TARGET_INDEX','-1'))]
if case=='fixed-offgrid':zs=sorted(zs+[25.1],reverse=True)
out=BASE/os.environ.get('PILOT_FOLDER','pilot')/case;out.mkdir(parents=True,exist_ok=True);assert not (out/'result.json').exists()
with p21.global_params.use(Z_HEAT_MAX=35):
 common=os.environ.get('PILOT_COMMON_CACHE')
 if common:
  common=Path(common);cache=out/'cache';cache.mkdir(exist_ok=True)
  for source in common.glob('PerturbedField_*.h5'):shutil.copy2(source,cache/source.name)
  ic_files=list(common.glob('InitialConditions_*.h5'));assert len(ic_files)==1
  initial=p21.InitialConditions.from_file(str(ic_files[0]),load_data=True)
 else:
  initial=p21.initial_conditions(user_params=user,cosmo_params=identity['cosmo_params'],random_seed=identity['random_seed'],write=True,direc=str(out/'cache'))
 start=time.perf_counter()
 cubes=p21.run_coeval(redshift=target if case in ('single-target','single-original') else zs,init_box=initial,astro_params=identity['astro_params'],flag_options=flags,write=True,regenerate=False,direc=str(out/'cache'))
 if case in ('single-target','single-original'):cubes=[cubes]
 c=next(c for c in cubes if c.redshift==target);fields={k:np.asarray(v) for k,v in {'Ts':c.Ts_box,'Tk':c.Tk_box,'xe':c.x_e_box,'Tb':c.brightness_temp,'xH':c.xH_box,'density':c.density}.items()}
 np.savez_compressed(out/'target.npz',**fields)
 rows=[]
 for cube in cubes:
  rows.append({'z':cube.redshift,**{k:{'min':float(a.min()),'max':float(a.max()),'mean':float(a.mean(dtype=np.float64))} for k,a in {'Ts':cube.Ts_box,'Tk':cube.Tk_box,'Tb':cube.brightness_temp,'xH':cube.xH_box}.items()}})
 result={'case':case,'grid':32,'target':target,'elapsedSeconds':time.perf_counter()-start,'rows':rows,'job':os.environ['SLURM_JOB_ID'],'module':str(p21.__file__)}
 (out/'result.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n');print(json.dumps(result),flush=True)
