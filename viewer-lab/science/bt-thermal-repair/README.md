# BT thermal evolution repair

The user requested the BT rerun after completion of the PL repair. This workflow
uses the same frozen canonical-scroll Python driver as PL; the C binary and all
BT physical parameters are retained. It reuses the exact saved IC of
`coeval-bt256-full-v1` (SHA-256
`eceb1c4ad4fd694329d4129fcf03ac8c6559c4964ec181eb301bcf875fff7c5b`).
That saved web-run IC is reproducible; identity to the earlier historical IC,
which was not retained, remains unverified. Cross-model phase matching is not
claimed.

Native full rerun: `2224917`. Independent unmodified-driver native control:
`2224918`, at z=24.864783. Export: `2224919`, dependent on both. Packaging:
`2224920`. All project computation and packaging run in Slurm. Original native
BT data and the shared software remain untouched.

Checked on 2026-10-18 (Asia/Shanghai): the native recompute and original-driver
reference both completed with exit code 0. All 85 native snapshots passed the
recorded finite/range and readback checks. The recomputed identity still matches
`parameter-validation.json`; no physical parameters or saved IC were changed.

The strict display export failed at z=24.864783070661233. Read-only diagnostic
job `2234653` confirms that Ts, Tk, electron fraction and density pass the original
comparison tolerances. Of 16,777,216 native voxels, xH fails at 47 (maximum absolute
difference 0.0044760108), and Tb fails at 7 (maximum absolute difference
0.17103577 mK, RMS 0.00006047975 mK). The sparse deviations do not establish their
cause or justify loosening the tolerances. The initial failed result is retained;
no publication gate was disabled or relaxed.

Consequently, packaging `2224920` and density128 export `2224968` were cancelled
through their dependencies. No repaired BT payload has been activated in the
web viewer. A completed native job is not a passed publication decision.

- [Recorded job states](job-accounting.txt)
- [Native source completion and range receipt](native-run-validation.json)
- [Recomputed source identity](recomputed-identity.json)
- [Original-driver reference receipt](native-reference-result.json)
- [Per-field strict comparison and largest discrepant voxels](control-diagnostic.json)
- [Publication decision](publication-decision.json)

`diagnose_control.py` only reads completed native and reference HDF5 files in a
Slurm allocation. It reports every field, mismatch count, percentiles and paired
values without stopping at the first failing field. It does not alter raw data.


The known PL 32³ causal/output-schedule regressions are reused as tests of the
shared driver, not presented as BT-specific physical validation. The native BT
control separately verifies this model. Export requires all 85 native source
checks, original IC SHA-256, the full predecessor chain, native-control
comparison, mean conservation and x-fastest readback. Failed gates must not be
relaxed to publish more frames.

The separate density128 workflow exports the complete 128³ density series only
after the BT native and display-export gates pass.
