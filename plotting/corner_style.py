"""Shared, data-faithful corner layout for the LF and joint inference archives.

No KDE, smoothing, thinning, quantile clipping, or convergence assessment.
Colors identify independent ensembles, never different cosmological models.
"""
from __future__ import annotations

import hashlib
import gc
from pathlib import Path

import numpy as np

STYLE_VERSION = "corner-shared-v2"
COLORS = ("#0072B2", "#D55E00")
LF_LABELS = [r"$\log_{10} f_{\star,10}$", r"$t_\star$", r"$\alpha_\star$",
             r"$\log_{10}(M_{\rm turn}/M_\odot)$"]
JOINT_LABELS = [r"$\eta_\star$", *LF_LABELS[1:],
                r"$\log_{10} f_{\rm esc,10}$", r"$\alpha_{\rm esc}$", r"$m_s$"]


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def native_stellar_ensembles(chains):
    """Coordinate conversion only; preserve every retained row in each ensemble."""
    arrays = []
    for chain in chains:
        values = np.asarray(chain, dtype=np.float64).reshape(-1, chain.shape[-1]).copy()
        if not np.isfinite(values).all() or np.any(values[:, 1] <= 0):
            raise ValueError("Invalid stored stellar chain")
        values[:, 0] += np.log10(values[:, 1])
        arrays.append(values)
    return arrays


def contour_levels(histogram):
    """Same binned enclosed-mass construction as the original joint plot."""
    ranked = np.sort(histogram.ravel())[::-1]
    total = ranked.sum()
    if total <= 0:
        return []
    cumulative = np.cumsum(ranked) / total
    result = []
    for target in (.95, .68):
        level = float(ranked[min(np.searchsorted(cumulative, target), len(ranked)-1)])
        if 0 < level < histogram.max() and not any(row[0] == level for row in result):
            result.append((level, target))
    return sorted(result)


def _format_tick(value, _position):
    return "0" if abs(value) < 1e-12 else f"{value:.3g}".replace("-", "−")


def audit_layout(fig, axes):
    """Check rendered text extents, not just nominal font sizes or CSS."""
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    objects = []
    for ax in axes.flat:
        if not ax.get_visible():
            continue
        for text in [*ax.get_xticklabels(), *ax.get_yticklabels(), ax.xaxis.label, ax.yaxis.label]:
            if text.get_visible() and text.get_text():
                objects.append(text)
    objects.extend(text for text in fig.texts if text.get_visible() and text.get_text())
    for legend in fig.legends:
        objects.extend(legend.get_texts())
    boxes = [(text.get_text(), text.get_window_extent(renderer)) for text in objects]
    canvas = fig.bbox
    clipped, overlaps, on_plot = [], [], []
    def intersects(a, b):
        return min(a.x1, b.x1) - max(a.x0, b.x0) > 1 and min(a.y1, b.y1) - max(a.y0, b.y0) > 1
    for index, (label, box) in enumerate(boxes):
        if box.x0 < 1 or box.y0 < 1 or box.x1 > canvas.width-1 or box.y1 > canvas.height-1:
            clipped.append(label)
        for other, other_box in boxes[index+1:]:
            if intersects(box, other_box):
                overlaps.append([label, other])
        for ax in axes.flat:
            if ax.get_visible() and intersects(box, ax.get_window_extent(renderer)):
                on_plot.append(label)
                break
    return {"checked_text_items": len(boxes), "clipped_text": clipped,
            "text_overlaps": overlaps, "text_on_plot": on_plot,
            "passed": not (clipped or overlaps or on_plot)}


def render_corner(arrays, labels, path, *, title, subtitle, notes):
    # Import the backend only in the rendering worker, not the archive reader.
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    from matplotlib.ticker import MaxNLocator, FuncFormatter

    n = len(labels)
    arrays = [np.asarray(a, dtype=np.float64) for a in arrays]
    if len(arrays) != 2 or any(a.ndim != 2 or a.shape[1] != n or not len(a) or not np.isfinite(a).all() for a in arrays):
        raise ValueError("Expected two finite, nonempty independent ensembles")
    limits = []
    for column in range(n):
        lo = min(a[:, column].min() for a in arrays)
        hi = max(a[:, column].max() for a in arrays)
        pad = max((hi-lo)*.035, 1e-6)
        limits.append((lo-pad, hi+pad))
    inches, dpi = (10, 170) if n <= 4 else (15, 160)
    rc = {"font.family": "DejaVu Sans", "mathtext.fontset": "dejavusans",
          "font.size": 11, "axes.labelsize": 14, "axes.linewidth": 1.0,
          "text.color": "#181a19", "axes.labelcolor": "#181a19",
          "xtick.color": "#181a19", "ytick.color": "#181a19",
          "figure.facecolor": "white", "axes.facecolor": "white",
          "savefig.facecolor": "white"}
    with plt.rc_context(rc):
        fig, axes = plt.subplots(n, n, figsize=(inches, inches), dpi=dpi, squeeze=False)
        try:
            for i in range(n):
                for j in range(n):
                    ax = axes[i, j]
                    if i < j:
                        ax.set_visible(False)
                        continue
                    for values, color in zip(arrays, COLORS):
                        if i == j:
                            ax.hist(values[:, j], bins=35, range=limits[j], density=True,
                                    histtype="step", color=color, lw=1.6)
                        else:
                            hist, xe, ye = np.histogram2d(values[:, j], values[:, i], bins=32,
                                                         range=[limits[j], limits[i]])
                            levels = contour_levels(hist)
                            if levels:
                                ax.contour((xe[1:]+xe[:-1])/2, (ye[1:]+ye[:-1])/2, hist.T,
                                           levels=[v for v, _ in levels], colors=[color],
                                           linewidths=[1.0 if p == .95 else 1.5 for _, p in levels],
                                           linestyles=["dashed" if p == .95 else "solid" for _, p in levels])
                    ax.set_xlim(limits[j])
                    if i != j:
                        ax.set_ylim(limits[i])
                    ax.xaxis.set_major_locator(MaxNLocator(nbins=3, prune="both"))
                    ax.yaxis.set_major_locator(MaxNLocator(nbins=3, prune="both"))
                    ax.xaxis.set_major_formatter(FuncFormatter(_format_tick))
                    ax.yaxis.set_major_formatter(FuncFormatter(_format_tick))
                    ax.tick_params(axis="both", which="major", direction="in", top=True, right=True,
                                   labelsize=11, length=4, width=.85, pad=7,
                                   labelbottom=i == n-1, labelleft=j == 0 and i > 0)
                    if i == n-1:
                        ax.set_xlabel(labels[j], labelpad=10)
                    if j == 0 and i > 0:
                        ax.set_ylabel(labels[i], labelpad=12)
                    if i == j:
                        ax.set_yticks([])
                        ax.margins(y=.12)
            fig.subplots_adjust(left=.115, right=.975, bottom=.11, top=.885,
                                hspace=.13, wspace=.13)
            fig.text(.115, .971, title, fontsize=18, weight="medium", va="top")
            fig.text(.115, .930, subtitle, fontsize=13, va="top", color="#4d514e")
            fig.legend([Line2D([], [], color=color, lw=1.8) for color in COLORS],
                       ["Independent ensemble 0", "Independent ensemble 1"], frameon=False,
                       loc="upper left", bbox_to_anchor=(.605, .845), borderaxespad=0,
                       fontsize=11, handlelength=2.5, labelspacing=.65)
            fig.text(.61, .739, "\n".join(notes), fontsize=10.5, va="top", linespacing=1.6)
            audit = audit_layout(fig, axes)
            audit.update({"style": STYLE_VERSION, "dimensions": n,
                          "samples_per_ensemble": [len(a) for a in arrays],
                          "pixel_size": [round(inches*dpi)]*2,
                          "bins_1d": 35, "bins_2d": 32, "smoothing": False,
                          "limits": [[float(v) for v in pair] for pair in limits]})
            if not audit["passed"]:
                raise ValueError(f"Unsafe corner layout for {path}: {audit}")
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            fig.savefig(path, dpi=dpi, pil_kwargs={"optimize": True})
            return audit
        finally:
            plt.close(fig)
            # Matplotlib axes own cycles and can retain full hist input arrays.
            # Collect between figures so the 27-figure archive has bounded RSS.
            del ax, axes, fig
            gc.collect()
