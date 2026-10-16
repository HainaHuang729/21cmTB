"""Read-only native PL thermal investigation; execute only in Slurm."""
import os, sys, json, hashlib, math
from pathlib import Path
import h5py
import numpy as np
ROOT=Path('/project/tkcastrosim/HNHuang/project_mcmc')
SRC=ROOT/'software/21cmFAST/src'
sys.path.insert(0,str(SRC))
import py21cmfast as p21
from py21cmfast.c_21cmfast import ffi
OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
base=ROOT/'data/web_pl256_full_v2'
identity=json.loads((base/'identity.json').read_text())
frames=json.loads((base/'complete.json').read_text())['snapshots']
audit=json.loads((ROOT/'web_21cm_viewer/reports/private/tb-input-audit-20261016.json').read_text())['models']['PL']

def scalar(x):
 if isinstance(x,bytes):return x.decode()
 if isinstance(x,np.generic):return scalar(x.item())
 if isinstance(x,np.ndarray):return [scalar(v) for v in x.tolist()]
 if isinstance(x,float) and not math.isfinite(x):return str(x)
 return x

def stats(a):
 f=np.isfinite(a);v=a[f]
 return {'min':float(v.min()),'max':float(v.max()),'mean':float(v.mean(dtype=np.float64)), 'quantiles':np.quantile(v,[0,.000001,.0001,.01,.5,.99,.9999,1]).tolist(),'nonfinite':int(a.size-v.size),'below_0p1':int(np.count_nonzero(a<.1))}

result={'job':os.environ['SLURM_JOB_ID'],'node':os.uname().nodename,'version':p21.__version__,'source':str(p21.__file__),'identity':identity,'rows':[]}
pf_paths=[]
for path in (base/'cache').glob('PerturbedField_*.h5'):
 with h5py.File(path,'r') as h:pf_paths.append((float(h.attrs['redshift']),path))
for index in [0,10,14,15,16,17,18,19,20]:
 a=audit[index];z=a['redshift'];ts_path=base/'cache'/a['tsCache']
 row={'index':index,'z':z,'TsCache':str(ts_path)}
 with h5py.File(ts_path,'r') as h:
  row['attrs']={k:scalar(v) for k,v in h.attrs.items()}
  row['groups']=list(h)
  row['flags']={k:scalar(v) for k,v in h['flag_options'].attrs.items()}
  row['globals']={k:scalar(v) for k,v in h['global_params'].attrs.items()} if 'global_params' in h else {}
  ts=h['TsBox/Ts_box'][:];tk=h['TsBox/Tk_box'][:];xe=h['TsBox/x_e_box'][:]
 matches=[p for zz,p in pf_paths if abs(zz-z)<1e-8];assert len(matches)==1,(z,matches)
 with h5py.File(matches[0],'r') as h:delta=h['PerturbedField/density'][:]
 row['statistics']={k:stats(v) for k,v in [('Ts',ts),('Tk',tk),('xe',xe),('density',delta)]}
 at=tuple(int(i) for i in np.unravel_index(np.argmin(tk),tk.shape))
 row['coldest']={'index':at,'Ts':float(ts[at]),'Tk':float(tk[at]),'xe':float(xe[at]),'delta':float(delta[at])}
 with h5py.File(frames[index]['file'],'r') as h:
  tb=h['brightness_temperature'][:];row['statistics']['Tb']=stats(tb)
  row['coldest']['Tb']=float(tb[at]);row['nativeFileAttrs']={k:scalar(v) for k,v in h.attrs.items() if k!='identity_json'}
 result['rows'].append(row)
 print(json.dumps(row,allow_nan=False),flush=True)
 if index==18:
  result['traceIndex']=list(at)
  trace=[]
  for aa in audit[:21]:
   with h5py.File(base/'cache'/aa['tsCache'],'r') as h:
    trace.append({'z':aa['redshift'],'Tk':float(h['TsBox/Tk_box'][at]),'Ts':float(h['TsBox/Ts_box'][at]),'xe':float(h['TsBox/x_e_box'][at])})
  result['coldCellTrace']=trace
(OUT/'native-diagnostic.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
print('NATIVE_DIAGNOSTIC_COMPLETE',flush=True)
