from pathlib import Path
import json, numpy as np, os
BASE=Path('/project/tkcastrosim/HNHuang/project_mcmc/data/web_pl_thermal_repair_20261016')
root=BASE/os.environ.get('PILOT_FOLDER','pilot_full_t1');result={'passed':False,'job':os.environ['SLURM_JOB_ID'],'comparisons':{}}
with np.load(root/'fixed-dense/target.npz') as fixed:
 for case in ['single-original','fixed-offgrid']:
  with np.load(root/case/'target.npz') as reference:
   differences={}
   for key in fixed.files:
    differences[key]={'maxAbsolute':float(np.max(np.abs(fixed[key].astype(float)-reference[key]))),'rms':float(np.sqrt(np.mean((fixed[key].astype(float)-reference[key])**2)))}
    assert np.allclose(fixed[key],reference[key],rtol=3e-6,atol=3e-6),(case,key,differences[key])
   result['comparisons'][case]=differences
 report=json.loads((root/'fixed-dense/result.json').read_text());assert len(report['rows'])==85
 assert abs(report['target']-8.055244211905698)<1e-9
 for row in report['rows']:
  assert min(row['Ts']['min'],row['Tk']['min'])>.1,row
  assert max(row['Ts']['max'],row['Tk']['max'])<1e6,row
 result.update(passed=True,grid=32,target=report['target'],snapshots=85,scope='Full 32^3 canonical evolution/output scheduling regression; native 256^3 checks remain separate')
(BASE/'full-pilot-validation.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
print(json.dumps(result),flush=True)
