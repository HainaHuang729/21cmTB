"""Read only completed target cache files while the full sequence proceeds."""
from pathlib import Path
import json,os
import numpy as np
import h5py
ROOT=Path('/project/tkcastrosim/HNHuang/project_mcmc/data')
repair=ROOT/'web_pl_thermal_repair_20261016';cache=ROOT/'web_pl256_thermal_fixed_v3/cache'
reference=json.loads((repair/'native-reference/result.json').read_text());z=reference['z']
classes={'Ts':('TsBox','Ts_box'),'Tk':('TsBox','Tk_box'),'xe':('TsBox','x_e_box'),'Tb':('BrightnessTemp','brightness_temp'),'xH':('IonizedBox','xH_box'),'density':('PerturbedField','density')}
paths={}
for cls in sorted(set(cls for cls,_ in classes.values())):
 matches=[]
 for path in cache.glob(cls+'_*.h5'):
  try:
   with h5py.File(path,'r') as h:
    if abs(float(h.attrs['redshift'])-z)<1e-9:matches.append(path)
  except OSError:continue
 assert len(matches)==1,(cls,z,matches)
 paths[cls]=matches[0]
result={'job':os.environ['SLURM_JOB_ID'],'z':z,'passed':True,'fields':{}}
with h5py.File(repair/'native-reference/target.h5','r') as ref:
 for name,(cls,dataset) in classes.items():
  with h5py.File(paths[cls],'r') as h:actual=h[cls+'/'+dataset][:]
  expected=ref[name][:];difference=actual.astype(float)-expected
  metrics={'min':float(actual.min()),'max':float(actual.max()),'mean':float(actual.mean(dtype=np.float64)),'maxAbsoluteDifference':float(np.max(np.abs(difference))),'rmsDifference':float(np.sqrt(np.mean(difference*difference)))}
  atol=.001 if name in ('Ts','Tk','Tb') else 2e-5 if name=='density' else 1e-6
  passed=bool(np.allclose(actual,expected,rtol=2e-5,atol=atol));result['passed'] &= passed
  result['fields'][name]={'passed':passed,**metrics}
(repair/'native-early-comparison.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
print(json.dumps(result),flush=True)
assert result['passed'],result
