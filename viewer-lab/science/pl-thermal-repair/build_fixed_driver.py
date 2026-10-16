"""Freeze the existing source/binary and repair canonical-scroll state tracking."""
from pathlib import Path
import hashlib, json, shutil, difflib, os
ROOT=Path('/project/tkcastrosim/HNHuang/project_mcmc')
OUT=ROOT/'data/web_pl_thermal_repair_20261016/software'
SOURCE=ROOT/'software/21cmFAST/src/py21cmfast'
assert not OUT.exists(), 'Do not overwrite a frozen repair build'
TARGET=OUT/'py21cmfast';TARGET.parent.mkdir(parents=True)
shutil.copytree(SOURCE,TARGET,ignore=shutil.ignore_patterns('__pycache__'))
p=TARGET/'wrapper.py';original=p.read_text();start=original.index('def run_coeval(');end=original.index('\ndef _get_required_redshifts_coeval',start)
body=original[start:end]
old='        redshifts = _get_required_redshifts_coeval(flag_options, redshift)'
assert body.count(old)==1
body=body.replace(old,old+'\n        evolution_redshifts = set(_get_required_redshifts_coeval(flag_options, [min(redshift)]))')
old='                if z not in redshift:\n                    st = st2';assert body.count(old)==1
body=body.replace(old,'                if z in evolution_redshifts:\n                    st = st2')
old='            else:\n                ib = ib2\n                pf = pf2\n                _bt = None';assert body.count(old)==1
body=body.replace(old,'            else:\n                _bt = None\n\n            if z in evolution_redshifts:\n                ib = ib2\n                pf = pf2')
fixed=original[:start]+body+original[end:];compile(fixed,str(p),'exec');p.write_text(fixed)
patch=''.join(difflib.unified_diff(original.splitlines(True),fixed.splitlines(True),fromfile='original/wrapper.py',tofile='canonical-scroll/wrapper.py'))
(OUT/'driver.patch').write_text(patch)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record={'repair':'canonical-scroll-v1','source':str(SOURCE),'originalWrapperSHA256':sha(SOURCE/'wrapper.py'),'fixedWrapperSHA256':sha(p),'patchSHA256':sha(OUT/'driver.patch'),'binarySHA256':sha(TARGET/'c_21cmfast.abi3.so'),'originalBinarySHA256':sha(SOURCE/'c_21cmfast.abi3.so'),'physicalParametersChanged':False,'policy':'Advance previous spin/ionization/perturbed fields on every pristine evolution node, including requested output nodes; off-grid output nodes do not alter the trajectory.'}
assert record['binarySHA256']==record['originalBinarySHA256']
(OUT/'repair-build.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record),flush=True)
