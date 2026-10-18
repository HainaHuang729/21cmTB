"""Read-only native control audit; retains the original comparison tolerances."""
from pathlib import Path
import json, os
import h5py
import numpy as np

ROOT = Path('/project/tkcastrosim/HNHuang/project_mcmc')
REPAIR = ROOT / 'data/web_bt_thermal_repair_20261017'
SOURCE = ROOT / 'data/web_bt256_thermal_fixed_v2'
reference = json.loads((REPAIR / 'native-reference/result.json').read_text())
complete = json.loads((SOURCE / 'complete.json').read_text())
frame = next(s for s in complete['snapshots'] if s['redshift'] == reference['z'])
matches = []
for path in (SOURCE / 'cache').glob('TsBox_*.h5'):
    with h5py.File(path, 'r') as h:
        if abs(float(h.attrs['redshift']) - reference['z']) < 1e-9:
            matches.append(path)
assert len(matches) == 1
report = {'job': os.environ['SLURM_JOB_ID'], 'z': reference['z'],
          'passed': True, 'fields': {}, 'tolerancePolicy': 'unchanged rtol=2e-5; atol: Ts/Tk/Tb=.001, density=2e-5, xH/xe=1e-6'}
actual_fields, expected_fields = {}, {}
with h5py.File(REPAIR / 'native-reference/target.h5', 'r') as ref, h5py.File(frame['file'], 'r') as native, h5py.File(matches[0], 'r') as thermal:
    for name in ['Ts', 'Tk', 'xe', 'Tb', 'xH', 'density']:
        actual = thermal['TsBox/' + {'Ts': 'Ts_box', 'Tk': 'Tk_box', 'xe': 'x_e_box'}[name]][:] if name in ('Ts', 'Tk', 'xe') else native['brightness_temperature' if name == 'Tb' else name][:]
        expected = ref[name][:]
        actual_fields[name], expected_fields[name] = actual, expected
        difference = actual.astype(np.float64) - expected
        absolute = np.abs(difference)
        atol = .001 if name in ('Ts', 'Tk', 'Tb') else 2e-5 if name == 'density' else 1e-6
        mismatch = ~np.isclose(actual, expected, rtol=2e-5, atol=atol)
        passed = not np.any(mismatch)
        report['passed'] &= passed
        report['fields'][name] = dict(passed=passed, mismatchedVoxels=int(mismatch.sum()), total=actual.size,
            maxAbsolute=float(absolute.max()), rms=float(np.sqrt(np.mean(difference * difference))),
            meanDifference=float(difference.mean()), maxMismatchCoordinates=np.argwhere(mismatch)[:20].tolist(),
            absolutePercentiles=dict(zip(['50', '95', '99', '99.9', '99.99', '100'], map(float, np.percentile(absolute, [50, 95, 99, 99.9, 99.99, 100])))))
        print(name, json.dumps(report['fields'][name]), flush=True)
    difference = np.abs(actual_fields['Tb'].astype(np.float64) - expected_fields['Tb'])
    indices = np.argpartition(difference.ravel(), -12)[-12:]
    report['largestTbDifferences'] = []
    for index in sorted(indices, key=lambda i: -difference.ravel()[i]):
        coordinate = np.unravel_index(index, difference.shape)
        report['largestTbDifferences'].append({'coordinate': list(map(int, coordinate)),
            'actual': {k: float(v[coordinate]) for k, v in actual_fields.items()},
            'reference': {k: float(v[coordinate]) for k, v in expected_fields.items()}})
    report['thermalAttributes'] = {k: str(v) for k, v in thermal.attrs.items() if k in ('redshift', 'prev_spin_redshift', 'random_seed')}
destination = REPAIR / ('control-diagnostic-' + os.environ['SLURM_JOB_ID'] + '.json')
destination.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
print('CONTROL_DIAGNOSTIC_COMPLETE', destination, flush=True)
