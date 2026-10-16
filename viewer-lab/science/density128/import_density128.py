"""Verify every 128^3 density file before activating the model's complete series."""
import argparse,hashlib,json,shutil
from pathlib import Path
LAB=Path(__file__).resolve().parents[2]
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):
 temporary=p.with_suffix('.pending');temporary.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n');temporary.replace(p)
def main(root):
 incoming=read(root/'manifest.json');validation=read(root/'validation.json');model=incoming['model'];assert model in ('pl','bt')
 assert validation['passed'] and validation['snapshots']==85 and validation['grid']==128
 assert incoming['grid']==[128]*3 and incoming['exportFastestAxis']=='grid-X'
 manifest_path=LAB/f'data/{model}-manifest.json';m=read(manifest_path)
 assert m['sourceIdentity']==incoming['sourceIdentity']==validation['sourceIdentity']
 assert m['source_simulation_id']==incoming['sourceSimulationId'] and len(m['snapshots'])==len(incoming['snapshots'])==85
 files=[]
 for current,fine in zip(m['snapshots'],incoming['snapshots']):
  assert current['id']==fine['id'] and current['redshift']==fine['redshift']
  descriptor=fine['density'];path=root/descriptor['url']
  assert path.resolve().is_relative_to(root.resolve()) and descriptor['grid']==[128]*3
  assert descriptor['sourceId']==current['fields']['density']['sourceId']
  assert descriptor['byteLength']==128**3*4==path.stat().st_size and sha(path)==descriptor['sha256']
  assert descriptor['statistics']['count']==128**3 and descriptor['statistics']['nonfinite']==0 and descriptor['statistics']['min']>=-1
  assert abs(descriptor['statistics']['mean']-current['fields']['density']['statistics']['mean'])<1e-6
  files.append((current,descriptor,path))
 registry=read(LAB/'data/local-files.json');target=LAB/f'data/{model}-density128-v1'
 for current,descriptor,path in files:
  destination=target/descriptor['url'];destination.parent.mkdir(parents=True,exist_ok=True)
  if not destination.exists():shutil.copyfile(path,destination)
  assert sha(destination)==descriptor['sha256']
  registry[f"{model}/{current['id']}/density"]='./'+destination.relative_to(LAB).as_posix()
 archive=LAB/f'data/{model}-manifest-before-density128.json'
 if not archive.exists():save(archive,m)
 for current,descriptor,path in files:current['fields']['density']=descriptor
 m['fields']['density']['grid']=[128]*3
 m['fields']['density']['displayRange']=[min(s['density']['statistics']['min'] for s in incoming['snapshots']),max(s['density']['statistics']['max'] for s in incoming['snapshots'])]
 m['fields']['density']['downsampling_method']=incoming['downsampling']
 m['simulationId']=m['source_simulation_id']+'-web-density128'
 m['field_grid_shapes']={key:m['fields'][key].get('grid',m['grid']) for key in m['fields']}
 m['gridOverridePolicy']='fields.<field>.grid overrides the default grid and display_grid_shape'
 m['downsampling_method']='Density: 2^3 native linear-value volume means to 128^3; xH/Tb: 4^3 means to 64^3. Float64 accumulation, float32 output.'
 m['densityResolution']={'grid':[128]*3,'sourceGrid':[256]*3,'cellSizeCMpc':250/128,'job':validation['job'],'sourceIdentity':incoming['sourceIdentity'],'method':incoming['downsampling']}
 save(manifest_path,m);save(LAB/'data/local-files.json',dict(sorted(registry.items())))
 save(LAB/f'science/density128/{model}-validation.json',validation)
 print(f'Activated {model.upper()} density: all 85 redshifts at 128^3; old density files preserved.')
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('root',type=Path);main(parser.parse_args().root)
