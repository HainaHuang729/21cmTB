"""Pristine single-target thermal/ionization control with identical PF inputs.

The initial cold control is retained. This control shares only the saved IC and
copied density/velocity perturbations, never spin/ionization/brightness outputs.
"""
from pathlib import Path
import hashlib, json, os, shutil, sys, time
import h5py
import numpy as np

ROOT = Path('/project/tkcastrosim/HNHuang/project_mcmc')
REPAIR = ROOT / 'data/web_bt_thermal_repair_20261017'
SOURCE = ROOT / 'data/web_bt256_thermal_fixed_v2'
sys.path.insert(0, str(ROOT / 'software/21cmFAST/src'))
import py21cmfast as p21

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

identity = json.loads((SOURCE / 'identity.json').read_text())
complete = json.loads((SOURCE / 'complete.json').read_text())
build = json.loads((ROOT / 'data/web_pl_thermal_repair_20261016/software/repair-build.json').read_text())
module = Path(p21.__file__).parent
assert sha(module / 'wrapper.py') == build['originalWrapperSHA256']
assert sha(module / 'c_21cmfast.abi3.so') == build['originalBinarySHA256']
assert sha(identity['initial_conditions_file']) == identity['initial_conditions_sha256']
assert complete['validated'] and not complete['review']
OUT = REPAIR / 'native-reference-matched-perturb'
OUT.mkdir(exist_ok=False)
cache = OUT / 'cache'
cache.mkdir()
z = identity['requested_redshifts'][17]
records = []
for path in sorted((SOURCE / 'cache').glob('PerturbedField_*.h5')):
    with h5py.File(path, 'r') as h:
        redshift = float(h.attrs['redshift'])
        assert int(h.attrs['random_seed']) == identity['random_seed']
    if redshift < z - 1e-9:
        continue
    destination = cache / path.name
    before = (path.stat().st_size, path.stat().st_mtime_ns)
    shutil.copyfile(path, destination)
    checksum = sha(path)
    assert sha(destination) == checksum
    assert before == (path.stat().st_size, path.stat().st_mtime_ns)
    records.append({'z': redshift, 'file': path.name, 'sha256': checksum})
assert records and not list(cache.glob('TsBox_*')) and not list(cache.glob('IonizedBox_*'))
provenance = {'job': os.environ['SLURM_JOB_ID'], 'sameIC': identity['initial_conditions_sha256'],
    'sourceIdentity': sha(SOURCE / 'identity.json'), 'pristineWrapperSHA256': build['originalWrapperSHA256'],
    'binarySHA256': build['originalBinarySHA256'], 'sharedInputs': ['initial_conditions', 'PerturbedField density/velocity'],
    'independentlyRecomputed': ['Ts', 'Tk', 'xe', 'xH', 'Tb', 'recombination history'],
    'sharedEvolvedFields': False, 'perturbedFields': records, 'tolerancesChanged': False}
(OUT / 'input-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print('MATCHED_INPUTS_READY', len(records), flush=True)
started = time.perf_counter()
with p21.global_params.use(Z_HEAT_MAX=35):
    for key, value in identity['resolved_global_params'].items():
        if key not in ('external_table_path', 'wisdoms_path'):
            assert getattr(p21.global_params, key) == value, key
    ic = p21.InitialConditions.from_file(identity['initial_conditions_file'], load_data=True)
    cube = p21.run_coeval(redshift=z, init_box=ic, astro_params=identity['astro_params'],
        flag_options=identity['flag_options'], write=True, regenerate=False, direc=str(cache))
    fields = {key: np.asarray(getattr(cube, attr)) for key, attr in
        [('Ts', 'Ts_box'), ('Tk', 'Tk_box'), ('xe', 'x_e_box'), ('Tb', 'brightness_temp'), ('xH', 'xH_box'), ('density', 'density')]}
    summaries = {}
    with h5py.File(OUT / 'target.h5', 'w') as h:
        h.attrs['z'] = z
        h.attrs['initial_conditions_sha256'] = identity['initial_conditions_sha256']
        for key, array in fields.items():
            assert array.shape == (256,) * 3 and np.isfinite(array).all()
            h.create_dataset(key, data=array, compression='lzf')
            summaries[key] = {'min': float(array.min()), 'max': float(array.max()), 'mean': float(array.mean(dtype=np.float64))}
    assert summaries['Ts']['min'] >= .1 and summaries['Tk']['min'] >= .1
    assert max(abs(summaries['Tb']['min']), abs(summaries['Tb']['max'])) < 1e4
    frame = next(s for s in complete['snapshots'] if s['redshift'] == z)
    thermal = []
    for path in (SOURCE / 'cache').glob('TsBox_*.h5'):
        with h5py.File(path, 'r') as h:
            if abs(float(h.attrs['redshift']) - z) < 1e-9:
                thermal.append(path)
    assert len(thermal) == 1
    metrics = {}
    with h5py.File(frame['file'], 'r') as native, h5py.File(thermal[0], 'r') as spin:
        for key, expected in fields.items():
            actual = spin['TsBox/' + {'Ts': 'Ts_box', 'Tk': 'Tk_box', 'xe': 'x_e_box'}[key]][:] if key in ('Ts', 'Tk', 'xe') else native['brightness_temperature' if key == 'Tb' else key][:]
            difference = actual.astype(np.float64) - expected
            atol = .001 if key in ('Ts', 'Tk', 'Tb') else 2e-5 if key == 'density' else 1e-6
            mismatch = ~np.isclose(actual, expected, rtol=2e-5, atol=atol)
            metrics[key] = {'passed': not bool(mismatch.any()), 'mismatchedVoxels': int(mismatch.sum()),
                'maxAbsolute': float(np.max(np.abs(difference))), 'rms': float(np.sqrt(np.mean(difference * difference)))}
    for item in records:
        assert sha(SOURCE / 'cache' / item['file']) == item['sha256']
        assert sha(cache / item['file']) == item['sha256']
    report = {'job': os.environ['SLURM_JOB_ID'], 'z': z, 'grid': 256, 'sameIC': identity['initial_conditions_sha256'],
        'passedRangeChecks': True, 'passedStrictControl': all(v['passed'] for v in metrics.values()),
        'elapsedSeconds': time.perf_counter() - started, 'statistics': summaries,
        'fields': metrics, 'inputProvenance': provenance}
    (OUT / 'result.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(json.dumps(report), flush=True)
    assert report['passedStrictControl'], metrics
print('MATCHED_PERTURB_REFERENCE_COMPLETE', flush=True)
