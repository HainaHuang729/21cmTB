# Real 128³ density

The former 64³ density display averaged 4³ native cells per displayed cell,
corresponding to 3.90625 cMpc per cell in a 250 cMpc box. This workflow instead
averages 2³ native cells, yielding a 128³ display with 1.953125 cMpc cells.
No interpolation, artificial filaments, sharpening filter or generated particles
are introduced into the scalar data.

`export_density128.py` runs in Slurm against an already validated native 256³
sequence. It retains the native snapshot SHA-256 as `sourceId`, computes volume
means with float64 accumulation and float32 output, and checks source identity,
all file hashes, finite/range values, mean conservation, orthogonal slices,
x-fastest packing and exact file readback. Averaging the 128³ export back to 64³
must also agree with the published 64³ source to float32 rounding tolerance.
`import_density128.py` checks all 85 incoming files before changing any active
manifest or registry reference. Previous payloads and manifests are preserved.

PL export job `2224967` passed for all 85 redshifts. The initial BT export
`2224968` was cancelled after the first strict comparison failed. After the
perturbation-input discrepancy was isolated and the matched-input native control
passed bit-exactly, replacement BT export `2234814` passed all 85 redshifts. Its
largest native-to-display mean difference is 1.403968608038042e-11; averaging
back to 64³ differs by at most 2.384185791015625e-7. Per-model receipts are saved
here after local import. Each 128³ raw volume occupies 8 MiB; a complete
85-frame model occupies 680 MiB.

The renderer reads the declared per-field grid, including slices, probes,
gradients and manual trilinear sampling. Raw CPU volumes use a 256 MiB budget;
all verified frames can remain in Cache Storage while recently needed volumes
remain in memory. The gradient worker retains at most four volumes (128 MiB for
128³ density). The same spatial and physical color mappings apply to every
redshift; bloom and gradient shading affect presentation only.
