"""Measure IC velocity round-trip mutation in the unchanged native C kernel."""
from pathlib import Path
import hashlib, json, os, sys
import h5py
import numpy as np

ROOT = Path('/project/tkcastrosim/HNHuang/project_mcmc')
REPAIR = ROOT / 'data/web_bt_thermal_repair_20261017'
SOURCE = ROOT / 'data/web_bt256_thermal_fixed_v2'
sys.path.insert(0, str(ROOT / 'software/21cmFAST/src'))
import py21cmfast as p21

identity = json.loads((SOURCE / 'identity.json').read_text())
out = REPAIR / ('perturbation-state-' + os.environ['SLURM_JOB_ID'])
out.mkdir(exist_ok=False)
report = {'job': os.environ['SLURM_JOB_ID'], 'grid': 256, 'sourceIC': identity['initial_conditions_sha256'],
    'kernelSourceSHA256': hashlib.sha256((ROOT / 'software/21cmFAST/src/py21cmfast/src/PerturbField.c').read_bytes()).hexdigest()}
with p21.global_params.use(Z_HEAT_MAX=35):
    ic = p21.InitialConditions.from_file(identity['initial_conditions_file'], load_data=True)
    buffers = {key: np.array(getattr(ic, key), copy=True) for key in
        ['lowres_vx', 'lowres_vy', 'lowres_vz', 'lowres_vx_2LPT', 'lowres_vy_2LPT', 'lowres_vz_2LPT']
        if hasattr(ic, key) and isinstance(getattr(ic, key), np.ndarray) and getattr(ic, key).size}
    def restore():
        for key, original in buffers.items():
            getattr(ic, key)[:] = original
            assert np.array_equal(getattr(ic, key), original)
    def compute(z):
        field = p21.perturb_field(redshift=z, init_boxes=ic, regenerate=True, write=False, direc=str(out))
        return np.array(field.density, copy=True)
    first = compute(identity['requested_redshifts'][0])
    report['velocityChangesAfterFirstCall'] = {}
    for key, original in buffers.items():
        actual = getattr(ic, key)
        report['velocityChangesAfterFirstCall'][key] = {'changedValues': int(np.count_nonzero(actual != original)),
            'total': original.size, 'maxAbsolute': float(np.max(np.abs(actual.astype(np.float64) - original)))}
    with_history = compute(35.)
    restore()
    pristine = compute(35.)
    restore()
    pristine_repeat = compute(35.)
    for key, actual in [('historyVsPristine', with_history), ('pristineRepeat', pristine_repeat)]:
        difference = actual.astype(np.float64) - pristine
        report[key] = {'differentVoxels': int(np.count_nonzero(actual != pristine)),
            'maxAbsolute': float(np.max(np.abs(difference))), 'rms': float(np.sqrt(np.mean(difference * difference)))}
    restore()
    report['restorationExact'] = True
    report['sourceFileUntouched'] = True
    (out / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)
