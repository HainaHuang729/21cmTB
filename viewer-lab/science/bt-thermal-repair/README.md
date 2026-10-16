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
BT data and the shared software remain untouched. These jobs have been submitted;
their completion has not been checked at this checkpoint, and the active BT web
data have not yet been replaced. Progress monitoring is paused at the user's
request; this record does not claim that the rerun or its validation is complete.

The known PL 32³ causal/output-schedule regressions are reused as tests of the
shared driver, not presented as BT-specific physical validation. The native BT
control separately verifies this model. Export requires all 85 native source
checks, original IC SHA-256, the full predecessor chain, native-control
comparison, mean conservation and x-fastest readback. Failed gates must not be
relaxed to publish more frames.

The separate density128 workflow exports the complete 128³ density series only
after the BT native and display-export gates pass.
