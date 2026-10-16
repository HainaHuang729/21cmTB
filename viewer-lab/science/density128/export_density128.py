"""Export real 128^3 density from validated native-256 coeval snapshots; Slurm only."""
from pathlib import Path
import argparse,hashlib,json,os,tarfile
import h5py
import numpy as np
ROOT=Path('/project/tkcastrosim/HNHuang/project_mcmc')
parser=argparse.ArgumentParser();parser.add_argument('--model',choices=['pl','bt'],required=True);args=parser.parse_args()
model=args.model
native=ROOT/('data/web_pl256_thermal_fixed_v3' if model=='pl' else 'data/web_bt256_thermal_fixed_v2')
repair=ROOT/('data/web_pl_thermal_repair_20261016' if model=='pl' else 'data/web_bt_thermal_repair_20261017')
out=ROOT/'data/web_density128_20261017'/model;out.mkdir(parents=True,exist_ok=False)
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
 return h.hexdigest()
def stats(a):
 assert np.isfinite(a).all() and a.min()>=-1
 return dict(min=float(a.min()),max=float(a.max()),mean=float(a.mean(dtype=np.float64)),count=a.size,nonfinite=0)
def save(p,v):p.write_text(json.dumps(v,indent=2,allow_nan=False)+'\n')
identity=json.loads((native/'identity.json').read_text());complete=json.loads((native/'complete.json').read_text())
validation=json.loads((repair/'display64/validation.json').read_text());assert validation['passed'] and complete['validated'] and not complete['review']
base=repair/'display64'/(identity['simulation_id']+'-display64')
coarse=json.loads((base/'manifest-all.json').read_text());assert len(coarse['snapshots'])==len(complete['snapshots'])==85
assert sha(native/'identity.json')==coarse['sourceIdentity']
records=[];checks=[]
for frame,snapshot in zip(complete['snapshots'],coarse['snapshots']):
 assert frame['redshift']==snapshot['redshift']
 path=Path(frame['file']);source_hash=sha(path);assert source_hash==snapshot['fields']['density']['sourceId']
 with h5py.File(path,'r') as h:
  assert h.attrs['source_simulation_id']==identity['simulation_id']
  data=h['density'][:];assert data.shape==(256,)*3 and data.dtype==np.float32
  reduced=data.reshape(128,2,128,2,128,2).mean(axis=(1,3,5),dtype=np.float64).astype('<f4')
  source_stats=stats(data);reduced_stats=stats(reduced)
  tolerance=np.finfo(np.float32).eps*float(np.abs(data).mean(dtype=np.float64))+1e-12
  assert abs(source_stats['mean']-reduced_stats['mean'])<=tolerance
 packed=np.ascontiguousarray(reduced.transpose(2,1,0),dtype='<f4')
 relative=f"snapshots/{snapshot['id']}/density.f32.bin";dest=out/relative;dest.parent.mkdir(parents=True,exist_ok=True);packed.tofile(dest)
 check=np.fromfile(dest,dtype='<f4').reshape(128,128,128);assert np.array_equal(check,packed)
 for axis in range(3):assert np.array_equal(np.take(check.transpose(2,1,0),64,axis=axis),np.take(reduced,64,axis=axis))
 for x,y,z in [(0,0,0),(127,127,127),(64,64,64),(1,17,39)]:assert check.ravel()[x+128*(y+128*z)]==reduced[x,y,z]
 coarse_path=base/snapshot['fields']['density']['url'];assert sha(coarse_path)==snapshot['fields']['density']['sha256']
 reference=np.fromfile(coarse_path,dtype='<f4').reshape(64,64,64).transpose(2,1,0)
 reconstructed=reduced.reshape(64,2,64,2,64,2).mean(axis=(1,3,5),dtype=np.float64).astype(np.float32)
 assert np.allclose(reference,reconstructed,rtol=1e-6,atol=1e-6)
 difference=float(np.max(np.abs(reference.astype(np.float64)-reconstructed)))
 record=dict(id=snapshot['id'],redshift=snapshot['redshift'],density=dict(url=relative,dtype='float32-le',byteLength=packed.nbytes,grid=[128]*3,sha256=sha(dest),sourceId=source_hash,statistics=reduced_stats))
 records.append(record);checks.append(dict(id=snapshot['id'],meanDifference=reduced_stats['mean']-source_stats['mean'],coarseMaxDifference=difference))
 print(json.dumps(dict(saved=len(records),model=model,z=snapshot['redshift'])),flush=True)
manifest=dict(schemaVersion=1,model=model,field='density',grid=[128]*3,sourceGrid=[256]*3,sourceSimulationId=identity['simulation_id'],sourceIdentity=coarse['sourceIdentity'],boxLength=250,boxUnit='cMpc',downsampling='2^3 linear-value volume mean; float64 accumulation and float32 output',exportFastestAxis='grid-X',snapshots=records)
save(out/'manifest.json',manifest)
save(out/'validation.json',dict(passed=True,job=os.environ['SLURM_JOB_ID'],model=model,snapshots=85,grid=128,sourceIdentity=coarse['sourceIdentity'],readbackAndAxisChecks=True,meanConservation=True,coarseConsistency=True,checks=checks))
with tarfile.open(out.with_suffix('.tar'),'w') as archive:archive.add(out,arcname=model)
print('DENSITY128_EXPORT_COMPLETE',flush=True)
