"""Numerical and geometry checks for the shared LF / joint corner renderer."""
import tempfile
from pathlib import Path
import unittest

import matplotlib.pyplot as plt
import numpy as np

from corner_style import (LF_LABELS, audit_layout, contour_levels,
                          native_stellar_ensembles, render_corner)


class CornerStyleTests(unittest.TestCase):
    def test_native_conversion_preserves_rows_and_ensembles(self):
        a = np.array([[[-1.0, .1, .5, 9.0], [-.5, .5, .4, 8.0]]])
        before = a.copy()
        values = native_stellar_ensembles([a, a.copy()])
        np.testing.assert_array_equal(a, before)
        self.assertEqual([x.shape for x in values], [(2, 4), (2, 4)])
        np.testing.assert_allclose(values[0][:, 0], before.reshape(-1, 4)[:, 0] + np.log10([.1, .5]))
        np.testing.assert_array_equal(values[0][:, 1:], before.reshape(-1, 4)[:, 1:])
        self.assertFalse(np.shares_memory(values[0], values[1]))

    def test_invalid_stellar_samples_rejected(self):
        for invalid in (0., -.1, np.nan):
            a = np.array([[-1., invalid, .5, 9.]])
            with self.assertRaises(ValueError):
                native_stellar_ensembles([a, a])

    def test_empirical_contour_levels(self):
        self.assertEqual(contour_levels(np.zeros((2, 2))), [])
        self.assertEqual(contour_levels(np.array([[40, 30], [20, 10]])), [(10., .95), (30., .68)])

    def test_audit_detects_overlaps_and_clipping(self):
        fig, axes = plt.subplots(1, 1, squeeze=False)
        try:
            fig.text(.5, .5, "overlap A")
            fig.text(.5, .5, "overlap B")
            fig.text(-.2, .2, "outside")
            result = audit_layout(fig, axes)
            self.assertFalse(result["passed"])
            self.assertIn(["overlap A", "overlap B"], result["text_overlaps"])
            self.assertIn("outside", result["clipped_text"])
            self.assertIn("overlap A", result["text_on_plot"])
        finally:
            plt.close(fig)

    def test_four_dimensional_geometry_and_full_range(self):
        rng = np.random.default_rng(729)
        values = rng.normal(size=(1000, 4)) * [.25, .1, .2, .5] + [-1.5, .5, .5, 9.]
        values[0, 0] = -4.5  # A retained tail must not be quantile-cropped.
        before = values.copy()
        with tempfile.TemporaryDirectory(prefix="corner-style-test-") as temporary:
            audit = render_corner([values, values.copy()], LF_LABELS, Path(temporary)/"corner.png",
                                  title="LF only / sampling distributions", subtitle="Geometry test",
                                  notes=["No sampling or weights changed"])
        np.testing.assert_array_equal(values, before)
        self.assertTrue(audit["passed"])
        self.assertEqual(audit["samples_per_ensemble"], [1000, 1000])
        self.assertEqual(audit["pixel_size"], [1700, 1700])
        self.assertLess(audit["limits"][0][0], -4.5)
        self.assertEqual(audit["smoothing"], False)


if __name__ == "__main__":
    unittest.main()
