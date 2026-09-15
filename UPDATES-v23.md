# Revision 23 · Shared corner-plot layout

This is a rendering update, not a new MCMC snapshot.

- All 25 LF-only model corners and both joint-coordinate corners use one renderer.
- Blue and orange consistently identify independent ensembles 0 and 1. They do
  not identify different cosmological models or different likelihoods.
- One-dimensional distributions use step histograms. Two-dimensional contours
  use solid lines for the 68% target and dashed lines for the 95% target of the
  binned empirical sample mass. These are not validated credible regions.
- Larger labels, mathematical parameter notation and units, fewer ticks, outer
  tick labels only, and more space between axes prevent adjacent labels colliding.
- No new sampling, thinning, smoothing, reweighting, quantile cropping, burn-in
  discard or convergence calculation. Native stellar efficiency is only the
  coordinate transform `log10(f_star,10) = eta_star + log10(t_star)`.
- LF models retain the exact published 4,000 or 5,000 steps per ensemble; the
  joint archive retains its original 160 × 64 × 2 rows. Snapshot dates and
  per-model diagnostic flags are unchanged. The joint chain is not converged.
- Both overview and detail-page images carry updated cache versions; the
  overview uses each image's content hash.
- The bottom KP/MS controls now select the matching LF-only corner across all
  25 combinations. The redundant archive dropdown is removed. KP=0 explicitly
  shows no matching chain, never another model's corner. Parameter resets and
  late-loading manifests use the current dock state. Other stellar controls do
  not condition a posterior; the joint free-MS snapshot remains separate.

## Checks and reproducibility

The shared renderer and read-only redraw command are in `plotting/`. Dependencies
are NumPy, Matplotlib and h5py. From a checkout with access to the original chain
files and reports, use:

```sh
python plotting/redraw_corner_archive.py \
  --project-root /path/to/project_mcmc \
  --site-root /path/to/21cmTB \
  --output /path/to/new-output-directory
python plotting/test_corner_style.py
```

The output directory must not already exist, unless resuming with `--resume`.
A resume checks source hashes, renderer code and PNG hashes before reusing a
completed figure. `--indices 0 5 24` produces a
preview of those LF models plus both joint-coordinate figures; it does not
write publication manifests. The script never starts or extends a sampler.

LF provenance records the original report hash, the HDF5 file hash and a hash
of the exact retained values. Input files are read through verified temporary
byte snapshots; a source changing during the copy/read is rejected. Separate
processes bound both the HDF5 chunk cache and plotting backend's memory use.

`web_data/mcmc/corner_layout_audit.json` records 27 rendered-text boundary
checks: text–text overlap, canvas clipping and text intruding into plot axes.
The archive hashes cover the figures, manifests and audit. PNG dimensions
remain 1700 × 1700 (LF) and 2400 × 2400 (joint); fonts are larger within the
images. Numerical, bilingual, cache-version and model-selector tests accompany
visual inspection of representative PNGs. Existing lightcones, slices,
four-redshift LF line charts and diagnostic traces are unchanged.

For source files that are still open by a sampler, first use
`freeze_corner_sources.py` with the same `--project-root`, `--site-root` and a
new `--output` path, then pass that output as the redraw's `--project-root`.
The freezer verifies all 77 report/chain byte copies against their source
hashes. This does not stop, extend or modify any running job.
