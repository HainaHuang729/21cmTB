# Atlas UI revision 21

- `kp = 0` is a persistent PL selection during astrophysical one-at-a-time scans.
  The other astrophysical controls still reset to baseline because arbitrary
  multi-parameter combinations are not available. `ms` has no effect in PL mode.
- A PL result is reused only when both its reference ID and all eight
  astrophysical parameters match. Request serials protect rapid selection changes.
  Unavailable numerical points remain unavailable; no interpolation is introduced.
- UV LF at z = 6, 7, 8, 10 is displayed together, with shared x/y ranges,
  redshift-matched PL curves and the existing HST/JWST observations. Mobile uses
  a single column; fullscreen retains all four panels.
- Section 06 follows both slice rows. LF-only contains three fixed-kp/ms,
  four-parameter figures from job_2128818. Joint LF + tau + xi retains the
  existing seven-dimensional, free-ms, 160-step snapshot and diagnostics page.
  Its neutral-fraction constraint is McGreer xHI at z=5.9, not a full xi(z)
  likelihood. These are separate parameter spaces, not reweighted chains.
- LF-only PNGs and their manifest are copied unchanged from the prepared
  `site/web_data/lf_corner` archive. SHA-256 hashes are recorded in
  `web_data/mcmc/index.json`. The current plotting helper has a 2,000-step cap;
  it was not rerun to regenerate or shorten these archived figures. The archived
  manifest records common lengths of 3,092 / 3,050 / 2,950 steps across two
  32-walker ensembles, consistent with the saved snapshot chain shapes.
- All counts are correlated stored rows, not effective sample sizes. LF-only
  convergence is not established; the joint snapshot is explicitly not converged.
  Ongoing chain continuations are excluded. Simulation controls do not modify
  the inference archive. Captions and controls support both interface languages;
  original scientific image annotations stay in English.

No simulation data were recomputed or modified. In PL mode the evolution panel
remains explicitly labelled as a central-column view of 32 stored slices, not
the full lightcone plane. UI cache version is v21; simulation data version remains
v18.

Checks: `node tests/test_i18n.cjs` (13 regression tests) and
`node tests/test_ms_corner.cjs` (3 dedicated-page tests). These use a DOM/canvas
adapter, not a browser screenshot or pixel-layout test.
