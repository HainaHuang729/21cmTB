"""Replay only the C source's fixed per-thread GSL Poisson streams."""
from pathlib import Path
import ctypes, json, os

ROOT = Path('/project/tkcastrosim/HNHuang/project_mcmc')
REPAIR = ROOT / 'data/web_bt_thermal_repair_20261017'
diagnostic = json.loads((REPAIR / 'control-diagnostic-2234653.json').read_text())
points = diagnostic['largestTbDifferences'][:7]
ctypes.CDLL('libgslcblas.so.0', mode=ctypes.RTLD_GLOBAL)
gsl = ctypes.CDLL('libgsl.so.25')
kind = ctypes.c_void_p.in_dll(gsl, 'gsl_rng_mt19937')
gsl.gsl_rng_alloc.argtypes = [ctypes.c_void_p]
gsl.gsl_rng_alloc.restype = ctypes.c_void_p
gsl.gsl_rng_set.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
gsl.gsl_ran_poisson.argtypes = [ctypes.c_void_p, ctypes.c_double]
gsl.gsl_ran_poisson.restype = ctypes.c_uint
gsl.gsl_rng_free.argtypes = [ctypes.c_void_p]
report = {'job': os.environ['SLURM_JOB_ID'], 'assumption': '16 threads, OpenMP contiguous static x partition, one Poisson draw per last-filter cell', 'points': []}
groups = {}
for point in points:
    x, y, z = point['coordinate']
    groups.setdefault(x // 16, {})[(x % 16) * 256 * 256 + y * 256 + z] = point
for thread, positions in sorted(groups.items()):
    rng = gsl.gsl_rng_alloc(kind)
    gsl.gsl_rng_set(rng, thread)
    for i in range(max(positions) + 1):
        draw = gsl.gsl_ran_poisson(rng, 5.)
        if i in positions:
            point = positions[i]
            report['points'].append({'coordinate': point['coordinate'], 'thread': thread, 'drawIndex': i,
                'poissonCount': int(draw), 'deltaXH': point['actual']['xH'] - point['reference']['xH']})
    gsl.gsl_rng_free(rng)
path = REPAIR / ('rng-probe-' + os.environ['SLURM_JOB_ID'] + '.json')
path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
