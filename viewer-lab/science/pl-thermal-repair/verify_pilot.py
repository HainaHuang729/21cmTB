from pathlib import Path
import json, numpy as np, os
BASE=Path('/project/tkcastrosim/HNHuang/project_mcmc/data/web_pl_thermal_repair_20261016')
root=BASE/os.environ.get('PILOT_FOLDER','pilot');result={'passed':False,'job':os.environ['SLURM_JOB_ID'],'comparisons':{}}
with np.load(root/'fixed-dense/target.npz') as fixed:
 for case in ['single-target','single-original','fixed-offgrid']:
  with np.load(root/case/'target.npz') as reference:
   differences={}
   for key in fixed.files:
    differences[key]={'maxAbsolute':float(np.max(np.abs(fixed[key].astype(float)-reference[key]))),'rms':float(np.sqrt(np.mean((fixed[key].astype(float)-reference[key])**2)))}
    assert np.allclose(fixed[key],reference[key],rtol=3e-6,atol=3e-6),(case,key,differences[key])
   result['comparisons'][case]=differences
 old=json.loads((root/'old-dense/result.json').read_text())['rows'][-1]
 new=json.loads((root/'fixed-dense/result.json').read_text())['rows'][-1]
 assert old['Tk']['min']<.1,(old,new)
 assert new['Tk']['min']>10,(old,new)
 assert all(np.isfinite(fixed[k]).all() for k in fixed.files)
 result.update(passed=True,oldTarget=old,fixedTarget=new,scope='32^3 causal/output-schedule regression; not a 256^3 physical certification')
(BASE/'pilot-validation.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
print(json.dumps(result),flush=True)
