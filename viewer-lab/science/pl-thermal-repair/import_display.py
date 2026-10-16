"""Import a validated PL 64^3 export, preserving the previous display payloads."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil

LAB=Path(__file__).resolve().parents[2]


def json_file(path):
 return json.loads(path.read_text())

def digest(path):
 return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path,value):
 temporary=path.with_suffix(path.suffix+'.pending')
 temporary.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')
 temporary.replace(path)

def main(export):
 validation=json_file(export/'validation.json')
 assert validation['passed'] and validation['snapshots']==85 and validation['volumes']==255
 source=export/'coeval-pl256-thermal-fixed-v3-display64'
 manifest=json_file(source/'manifest-all.json')
 assert manifest['source_simulation_id']=='coeval-pl256-thermal-fixed-v3'
 assert manifest['sourceIdentity']==validation['sourceIdentity']
 inputs=json_file(Path(__file__).with_name('parameter-validation.json'))
 assert inputs['passed'] and manifest['sourceIdentity']==inputs['recomputedIdentitySHA256']
 assert manifest['thermalEvolutionRepair']['sameInitialConditions']
 assert not manifest['thermalEvolutionRepair']['physicalParametersChanged']
 assert len(manifest['snapshots'])==85
 files=[]
 for s in manifest['snapshots']:
  assert s['fieldQuality']['brightness_temperature']['status']=='range-check-passed'
  assert set(s['fields'])=={'xH','density','brightness_temperature'}
  for key,descriptor in s['fields'].items():
   path=source/descriptor['url']
   assert path.resolve().is_relative_to(source.resolve())
   assert descriptor['byteLength']==64**3*4==path.stat().st_size
   assert digest(path)==descriptor['sha256'],path
   files.append((s['id'],key,path,descriptor))
 # No current files are changed until every incoming file has passed verification.
 target=LAB/'data/pl-thermal-fixed-v3'
 registry=json_file(LAB/'data/local-files.json')
 for sid,key,path,descriptor in files:
  relative=Path(descriptor['url']);destination=target/relative
  destination.parent.mkdir(parents=True,exist_ok=True)
  if not destination.exists():
   temporary=destination.with_suffix('.pending');shutil.copyfile(path,temporary);temporary.replace(destination)
  assert digest(destination)==descriptor['sha256']
  registry[f'pl/{sid}/{key}']='./'+destination.relative_to(LAB).as_posix()
 for key in list(registry):
  if key.startswith('pl/') and len(key.split('/'))==2:
   registry[key]=registry[key+'/xH']
 previous=json_file(LAB/'data/pl-manifest.json')
 archive=LAB/'data/pl/manifest-source-v2.json'
 if previous.get('source_simulation_id')=='coeval-pl256-full-v2' and not archive.exists():save(archive,previous)
 save(LAB/'data/pl-manifest.json',manifest)
 save(LAB/'data/local-files.json',dict(sorted(registry.items())))
 save(LAB/'science/pl-thermal-repair/native-validation.json',validation)
 print('Imported 85 PL redshifts / 255 verified field volumes; previous payloads preserved.')

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('export_root',type=Path)
 main(parser.parse_args().export_root)
