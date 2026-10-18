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

The initial failed result and cancelled dependency jobs remain part of the audit
trail. They are not overwritten by the follow-up investigation.

The six-case ablation (`2234724`) isolates the perturbation input. Repeating the
same cached inputs is bit-exact. Substituting only the native density/velocity
perturbations reproduces all 47 xH and 7 Tb failures, while substituting only
temperature or the preceding ionization box does not. The Poisson replay uses
the original GSL generator and produces the discrete counts associated with the
large outliers; there is no evidence of a drifting random sequence.

`PerturbField.c` scales the IC velocity arrays in place and divides them back.
The native 256³ state probe (`2234793`) shows that float32 round trips leave
residuals in those in-memory arrays even though the saved IC file is unchanged.
The next perturbation calculation differs at 14,882,507 density voxels, with
maximum absolute difference 3.5762786865234375e-7. Restoring the pristine buffers
before each call makes the repeat bit-exact. The cold control's density still
passes the original density tolerance; a small accepted perturbation difference
can nevertheless cross a discrete partial-ionization branch.

The follow-up control fixes the input contract: freeze and SHA-256-check the
native density/velocity perturbations, then use the **pristine original driver**
to independently recompute all thermal, ionization and recombination history.
Only the IC and perturbation inputs are shared. Ts, Tk, xe, xH, Tb and previous
ionization outputs are never copied from the repaired sequence into this control.
The cold independent density control remains required, and the per-voxel
thermal/ionization tolerances remain unchanged. This is a factorized check of
perturbations and evolution, not an independent regeneration of the perturbation
fields in the matched-input control. The underlying C source and binary are
unchanged; this workflow addresses the validation input mismatch, rather than
claiming a patched C kernel. No native scalar values are edited or clipped.

Matched-input control `2234763` completed in 22m53s. All six native 256³ fields
are **bit-exact** to the repaired run at z=24.864783070661233: zero mismatches,
zero maximum difference and zero RMS. Export `2234810` passed all 85 snapshots
and 255 volumes with unchanged tolerances; packaging `2234813` completed. The
128³ density export `2234814` passed all 85 snapshots. Both archive hashes and
all local payload hashes passed; the complete BT sequence is now activated in
the web registry, with 128³ density and 64³ xH/Tb. The importer verifies every
incoming file hash and statistic before changing active references. The initial failed strict comparison remains available below.

- [Recorded job states](job-accounting.txt)
- [Native source completion and range receipt](native-run-validation.json)
- [Recomputed source identity](recomputed-identity.json)
- [Original cold-driver reference receipt](native-reference-result.json)
- [Original per-field comparison and discrepant voxels](control-diagnostic.json)
- [Matched-input native-256 reference and all six comparisons](matched-reference-result.json)
- [Shared-input provenance and perturbation SHA-256 list](matched-input-provenance.json)
- [Six-case perturbation/temperature/predecessor ablation](input-ablation.json)
- [Native IC velocity mutation and exact restoration](perturbation-state.json)
- [GSL Poisson replay](rng-probe.json)
- [Initial failed publication decision](publication-decision-initial.json)
- [Current publication decision](publication-decision.json)
- [Workflow and archive fingerprints](workflow-fingerprints.json)
- [Full display export checks and predecessor chain](native-validation.json)
- [All 85 density128 checks](../density128/bt-validation.json)

`diagnose_control.py` and the causal probes run in Slurm allocations. They leave
source snapshots and the IC file untouched. `matched_perturb_reference.py` builds
a separate cache, checks the original wrapper/binary fingerprints and physical
parameters, copies only perturbation inputs and records every SHA-256.
`export_repaired_bt.py --matched-perturb-control` gates on the original cold
density check, ablation, restoration probe and matched-input result. It then
rechecks all six fields directly against the native-256 control and verifies
all 85 exports. Failed gates must not be relaxed to publish more frames.

The known PL 32³ causal/output-schedule regressions are reused as tests of the
shared driver, not presented as BT-specific physical validation. The cold BT
density check and matched-input thermal/ionization control provide the separate
BT numerical validation described above. Export requires all 85 native source
checks, original IC SHA-256, the full predecessor chain, native-control
comparison, mean conservation and x-fastest readback. Failed gates must not be
relaxed to publish more frames.

The separate density128 workflow exports the complete 128³ density series only
after the BT native and display-export gates pass.
