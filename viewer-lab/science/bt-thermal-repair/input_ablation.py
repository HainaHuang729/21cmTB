"""Isolate native-control deviations with the pristine C/Python implementation.

Only a new diagnostic directory is written. Cached inputs and all old outputs
remain untouched; every comparison uses the original per-voxel tolerances.
"""
from pathlib import Path
import gc, hashlib, json, os, sys, time
import h5py
import numpy as np

ROOT = Path('/project/tkcastrosim/HNHuang/project_mcmc')
REPAIR = ROOT / 'data/web_bt_thermal_repair_20261017'
SOURCE = ROOT / 'data/web_bt256_thermal_fixed_v2'
sys.path.insert(0, str(ROOT / 'software/21cmFAST/src'))
import py21cmfast as p21

identity = json.loads((SOURCE / 'identity.json').read_text())
reference = json.loads((REPAIR / 'native-reference/result.json').read_text())
build = json.loads((ROOT / 'data/web_pl_thermal_repair_20261016/software/repair-build.json').read_text())
module = Path(p21.__file__).parent
assert hashlib.sha256((module / 'wrapper.py').read_bytes()).hexdigest() == build['originalWrapperSHA256']
assert hashlib.sha256((module / 'c_21cmfast.abi3.so').read_bytes()).hexdigest() == build['originalBinarySHA256']
OUT = REPAIR / ('input-ablation-' + os.environ['SLURM_JOB_ID'])
OUT.mkdir(exist_ok=False)
z = reference['z']
roots = {'reference': REPAIR / 'native-reference/cache', 'native': SOURCE / 'cache'}
indices = {}
for profile, root in roots.items():
    indices[profile] = {}
    for cls in ['PerturbedField', 'TsBox', 'IonizedBox']:
        records = []
        for path in root.glob(cls + '_*.h5'):
            with h5py.File(path, 'r') as h:
                records.append((float(h.attrs['redshift']), path, dict(h.attrs)))
        indices[profile][cls] = records

def find(profile, cls, redshift):
    matches = [entry for entry in indices[profile][cls] if abs(entry[0] - redshift) < 1e-9]
    assert len(matches) == 1, (profile, cls, redshift, len(matches))
    return matches[0]

def metric(actual, expected, name):
    difference = actual.astype(np.float64) - expected
    atol = .001 if name == 'Tb' else 1e-6
    mismatch = ~np.isclose(actual, expected, rtol=2e-5, atol=atol)
    return {'passed': not bool(mismatch.any()), 'mismatchedVoxels': int(mismatch.sum()),
            'maxAbsolute': float(np.max(np.abs(difference))),
            'rms': float(np.sqrt(np.mean(difference * difference)))}

targets = {}
with h5py.File(REPAIR / 'native-reference/target.h5', 'r') as h:
    targets['reference'] = {'xH': h['xH'][:], 'Tb': h['Tb'][:]}
frame = next(s for s in json.loads((SOURCE / 'complete.json').read_text())['snapshots'] if s['redshift'] == z)
with h5py.File(frame['file'], 'r') as h:
    targets['native'] = {'xH': h['xH'][:], 'Tb': h['brightness_temperature'][:]}

report = {'job': os.environ['SLURM_JOB_ID'], 'redshift': z, 'module': str(p21.__file__),
          'originalWrapperSHA256': build['originalWrapperSHA256'],
          'originalBinarySHA256': build['originalBinarySHA256'], 'cases': []}
cases = [('reference_repeat_1', 'reference', 'reference', 'reference'),
         ('reference_repeat_2', 'reference', 'reference', 'reference'),
         ('native_repeat', 'native', 'native', 'native'),
         ('native_perturb_only', 'native', 'reference', 'reference'),
         ('native_temperature_only', 'reference', 'native', 'reference'),
         ('native_predecessor_only', 'reference', 'reference', 'native')]
previous_result = None
with p21.global_params.use(Z_HEAT_MAX=35):
    report['globalParameterDifferences'] = {k: [v, getattr(p21.global_params, k)]
        for k, v in identity['resolved_global_params'].items()
        if k not in ('external_table_path', 'wisdoms_path') and getattr(p21.global_params, k) != v}
    assert not report['globalParameterDifferences'], report['globalParameterDifferences']
    ic = p21.InitialConditions.from_file(identity['initial_conditions_file'], load_data=True)
    for name, perturb_profile, thermal_profile, prior_profile in cases:
        start = time.perf_counter()
        pf_path = find(perturb_profile, 'PerturbedField', z)[1]
        ts_path = find(thermal_profile, 'TsBox', z)[1]
        prior_z = float(find(prior_profile, 'IonizedBox', z)[2]['prev_ionize_redshift'])
        ib_path = find(prior_profile, 'IonizedBox', prior_z)[1]
        previous_pf_path = find(perturb_profile, 'PerturbedField', prior_z)[1]
        paths = [pf_path, ts_path, ib_path, previous_pf_path]
        stamps = {p: (p.stat().st_size, p.stat().st_mtime_ns) for p in paths}
        pf = p21.PerturbedField.from_file(str(pf_path), load_data=True)
        ts = p21.TsBox.from_file(str(ts_path), load_data=True)
        ib = p21.IonizedBox.from_file(str(ib_path), load_data=True)
        previous_pf = p21.PerturbedField.from_file(str(previous_pf_path), load_data=True)
        # This legacy reader restores AstroParams without its flag-dependent
        # default context. Restore that context before compatibility checks,
        # exactly as run_coeval's setup does; no defining input is changed.
        for box in (ts, ib):
            box.astro_params.INHOMO_RECO = box.flag_options.INHOMO_RECO
            assert box.astro_params.R_BUBBLE_MAX == 50
        print('START_CASE', name, flush=True)
        result = p21.ionize_box(redshift=z, init_boxes=ic, perturbed_field=pf,
            previous_perturbed_field=previous_pf, previous_ionize_box=ib, spin_temp=ts,
            regenerate=True, write=False, direc=str(OUT), cleanup=True)
        tb = p21.brightness_temperature(ionized_box=result, perturbed_field=pf, spin_temp=ts,
            regenerate=True, write=False, direc=str(OUT))
        arrays = {'xH': np.array(result.xH_box, copy=True), 'Tb': np.array(tb.brightness_temp, copy=True)}
        entry = {'name': name, 'perturbProfile': perturb_profile, 'thermalProfile': thermal_profile,
                 'predecessorProfile': prior_profile, 'previousZ': prior_z,
                 'threads': int(pf.user_params.N_THREADS), 'resolvedBubbleRadius': float(ts.astro_params.R_BUBBLE_MAX),
                 'inputs': list(map(str, paths)), 'seconds': time.perf_counter() - start,
                 'againstStoredReference': {k: metric(v, targets['reference'][k], k) for k, v in arrays.items()},
                 'againstStoredNative': {k: metric(v, targets['native'][k], k) for k, v in arrays.items()}}
        if name == 'reference_repeat_1':
            previous_result = arrays
        elif name == 'reference_repeat_2':
            entry['againstFirstRepeat'] = {k: metric(v, previous_result[k], k) for k, v in arrays.items()}
        report['cases'].append(entry)
        with h5py.File(OUT / (name + '.h5'), 'w') as h:
            for key, array in arrays.items():
                h.create_dataset(key, data=array, compression='lzf')
        (OUT / 'result.json').write_text(json.dumps(report, indent=2, allow_nan=False, default=lambda value: value.item()) + '\n')
        assert all((p.stat().st_size, p.stat().st_mtime_ns) == stamps[p] for p in paths)
        print(json.dumps(entry, default=lambda value: value.item()), flush=True)
        del pf, ts, ib, previous_pf, result, tb, arrays
        gc.collect()
print('INPUT_ABLATION_COMPLETE', OUT, flush=True)
