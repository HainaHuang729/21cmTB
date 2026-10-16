# PL thermal evolution repair

The original 256³ PL run requested every canonical evolution node as an output. In the saved source version `0.1.dev1835+gaefc273.d20250321`, `run_coeval` advanced its previous spin-temperature, ionization and density states only at nodes that were not requested outputs. For this schedule, the z=35 state remained the predecessor of much later snapshots. Native cache headers and temperature traces confirm the error; it is upstream of averaging, caching and rendering.

`driver.patch` advances these states on canonical evolution nodes whether or not they are requested outputs. Additional output-only nodes still do not advance the trajectory. The C binary, physical flags, astrophysical parameters, cosmology, IC file and random seed are retained. The original shared software and original native outputs are preserved; the patched package and new cache are isolated.

A 32³ regression reproduces the collapse in the original dense-output schedule and compares the repair with an unmodified single-target calculation. A separate off-grid-output comparison tests that requesting extra snapshots does not change the canonical trajectory. These are algorithmic regression tests, not resolution convergence or independent physical certification.

The scripts are the cluster workflow used for investigation, regression, native-256 recomputation, an independent native single-target control, and 64³ export. Their project paths target the existing HPC layout; all project computation must run in Slurm. Do not execute these scripts on a login node or point them at the original source/output directory for in-place replacement.

The full 32³ regression (job `2224330`) uses identical saved IC/density fields and matches the unmodified single-target result and the off-grid-output variant bit for bit at z=8.055. Independent regeneration of those input fields initially introduced float32 differences; those failed strict comparisons are retained in the cluster logs and were not reclassified as passes. Native early comparison `2224337` passes at z=24.358, with Tb RMS difference 7.37e-7 mK and minimum Tk 9.263 K.

Native run `2224253` completed all 85 requested 256³ snapshots in 1:33:30, with zero source-temperature/range flags. Across the complete native sequence, Tk spans 2.174–32,098.889 K, Ts spans 5.618–11,182.261 K, and brightness temperature spans −237.765–30.099 mK. These are source-grid ranges, before volume averaging.

Native control `2224258`, full regression gate `2224330`, and validation/export `2224333` all passed. The exporter verifies the predecessor chain, original IC hash, independent native control, float64-accumulated 4³ volume means, x-fastest packing, orthogonal slices, readback and mean conservation. The 255 exported 64³ volumes span −121.631–24.077 mK in brightness temperature and fit the viewer's existing fixed [−150,40] mK color scale. Packaging job `2224638` ran on a compute node; no project computation ran on a login node.

Receipts:

- [Parameter identity](parameter-validation.json): identical original/recomputed IC, physics, cosmology, astrophysics, numerical global settings, grid, seed and requested redshifts; filesystem lookup paths are excluded.
- [Full native run](native-run-validation.json): all 85 native snapshot statistics, zero review flags and validated file readback. Absolute snapshot paths are reduced to filenames in this published copy.
- [Native export](native-validation.json): all 85 predecessor checks, independent native-control differences and 255 validated display volumes.
- [Full 32³ regression](full-pilot-validation.json), [initial causal regression](pilot-validation.json), and [early native comparison](native-early-comparison.json).
- [Driver provenance](driver-provenance.json) and [minimal patch](driver.patch): the original and frozen C binaries have the same SHA-256.

The active PL manifest and registry point to `data/pl-thermal-fixed-v3/`; the previous PL payloads and `data/pl/manifest-source-v2.json` are retained for tracing and rollback. BT and the separate lightcone slice library were not recomputed in this repair. The sample remains independent of the main page.
