# Corner archive refresh — 2026-09-15

The LF-only archive now covers all 25 pairs of
`kp = [1, 3, 10, 20, 30] h Mpc^-1` and `ms = [1.5, 2, 2.5, 3.25, 4]`.
The compact grouped selector is independent of the lightcone parameter dock.

- The original three figures from `job_2128818` are refreshed to their prepared
  5,000-step snapshots, exported on September 14 at 12:47.
- The 22 additional figures from `job_2132128` were exported by plotting job
  `2133583` on September 15 at 09:51–09:52.
- Each figure includes two 32-walker ensembles. The `kp=3, ms=1.5` model retains
  4,000 steps (256,000 correlated rows); the other 24 retain 5,000 (320,000 rows
  each). These counts are not effective sample sizes. Extra saved steps beyond
  the exported common/capped length are not added to the figures.
- Six original final reports mark their existing diagnostic gate as passed:
  `(3, 1.5)`, `(3, 2)`, `(3, 2.5)`, `(20, 2.5)`, `(20, 3.25)`, `(30, 1.5)`.
  The interface shows the selected model's actual flag. This is not a new
  convergence assessment, proof of global mixing, or resolution-convergence test.

All PNGs are reused unchanged from the prepared `site/web_data/lf_corner`
directory. `index_seed.json` and `index_remaining.json` preserve both original
export manifests. The merged `index.json` records each model's original job/task
index, export date, diagnostic flag, final-report path/hash and figure hash.
`web_data/mcmc/index.json` checksums the published files. Image URLs include a
content-hash cache key so refreshed seed plots cannot silently reuse old images.

The joint LF + tau + xi corner, native-coordinate plot and traces remain the
previous **2026-09-14, 160-step, preliminary/not-converged** archive. No newer
completed joint plot/diagnostic export was available in the inspected archive.
Continuing chunk-2 files and fixed-kp/ms joint test runs were not mixed into this
seven-dimensional free-ms archive. Its source files are unchanged.

Verification: all 25 LF manifests checked against 50 production-chain shapes and
their corresponding final reports; 25 PNGs checked against the archived hashes.
Frontend tests cover all selections, grouped options, sample counts, diagnostic
flags, source attribution, language persistence, stale-image cache keys and
incomplete-grid rejection. No MCMC, 21cmFAST simulation, resampling, or new
scientific plotting was launched. UI revision: v22; simulation-data version: v18.
