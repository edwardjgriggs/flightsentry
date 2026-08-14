"""Parity tests for robust_normalize across TypeScript and Python.

These tests verify that the normalization formula used by the Python pipeline
matches the TypeScript implementation in src/lib/detectors.ts exactly.
Formula: clip((z - 1.5) / 7, 0, 1) where z = (value - median(cal)) / (MAD(cal) * 1.4826)

If the Python and TypeScript formulas diverge, these tests will fail.
"""

from __future__ import annotations

import math
import unittest

import numpy as np

from scripts.data_pipeline.normalize import robust_normalize


class NormalizationParityTests(unittest.TestCase):
    """Each test case uses fixed raw scores and calibration values so a
    TypeScript reimplementation can reproduce the expected output exactly.
    Cross-reference: src/lib/detectors.ts robustNormalize()."""

    def _ts_robust_normalize(self, score: float, calibration: list[float]) -> float:
        """Python reference implementation of the TypeScript robustNormalize function.

        Mirrors exactly:
          function robustNormalize(score, baseline) {
            const center = median(baseline);
            const deviations = baseline.map(v => Math.abs(v - center));
            const scale = Math.max(median(deviations) * 1.4826, 1e-6);
            const z = (score - center) / scale;
            return Math.max(0, Math.min(1, (z - 1.5) / 7));
          }
        """
        sorted_cal = sorted(calibration)
        n = len(sorted_cal)
        mid = n // 2
        center = (sorted_cal[mid - 1] + sorted_cal[mid]) / 2 if n % 2 == 0 else sorted_cal[mid]
        deviations = sorted([abs(v - center) for v in calibration])
        m = len(deviations)
        mid_d = m // 2
        mad = (deviations[mid_d - 1] + deviations[mid_d]) / 2 if m % 2 == 0 else deviations[mid_d]
        scale = max(mad * 1.4826, 1e-6)
        z = (score - center) / scale
        return max(0.0, min(1.0, (z - 1.5) / 7.0))

    def test_nominal_score_returns_zero(self) -> None:
        """A score at the calibration median should produce z=0, which maps to 0."""
        calibration = [1.0, 2.0, 3.0, 4.0, 5.0, 3.0, 2.5, 3.5, 2.8, 3.2]
        score = float(np.median(calibration))
        result = float(robust_normalize(np.array([score]), np.array(calibration))[0])
        expected = self._ts_robust_normalize(score, calibration)
        self.assertAlmostEqual(result, expected, places=9)
        self.assertEqual(result, 0.0)

    def test_large_anomaly_clips_to_one(self) -> None:
        """A very large score should be clipped to 1.0 in both implementations."""
        calibration = [1.0, 1.1, 0.9, 1.05, 0.95, 1.0, 1.02, 0.98, 1.0, 0.99]
        score = 1000.0
        result = float(robust_normalize(np.array([score]), np.array(calibration))[0])
        expected = self._ts_robust_normalize(score, calibration)
        self.assertAlmostEqual(result, expected, places=9)
        self.assertEqual(result, 1.0)

    def test_known_fixed_values_match_typescript(self) -> None:
        """Fixed calibration + score pair with known expected output.

        calibration = [10, 11, 9, 10.5, 9.5, 10, 10.2, 9.8, 10.0, 9.9]
        median(cal) = 9.95 (average of 9.95 and 10.0 after sort)
        deviations from 9.95 = [0.05, 0.05, 0.5, 0.55, ...] sorted
        MAD ≈ 0.05 (exact depends on sort)
        score = 20.0 → high anomaly
        """
        calibration = [10.0, 11.0, 9.0, 10.5, 9.5, 10.0, 10.2, 9.8, 10.0, 9.9]
        score = 20.0
        result = float(robust_normalize(np.array([score]), np.array(calibration))[0])
        expected = self._ts_robust_normalize(score, calibration)
        self.assertAlmostEqual(result, expected, places=9)

    def test_mid_range_score_parity(self) -> None:
        """A moderate anomaly score should produce the same value in both."""
        calibration = [0.5, 0.6, 0.55, 0.48, 0.62, 0.51, 0.59, 0.53, 0.57, 0.56]
        score = 1.2
        result = float(robust_normalize(np.array([score]), np.array(calibration))[0])
        expected = self._ts_robust_normalize(score, calibration)
        self.assertAlmostEqual(result, expected, places=9)

    def test_dead_band_suppresses_small_deviation(self) -> None:
        """z < 1.5 should map to 0 (dead-band behaviour)."""
        calibration = [1.0] * 10
        # MAD is 0, scale becomes 1e-6; z = (1.0 - 1.0) / 1e-6 = 0 → result = 0
        score = 1.0
        result = float(robust_normalize(np.array([score]), np.array(calibration))[0])
        expected = self._ts_robust_normalize(score, calibration)
        self.assertAlmostEqual(result, expected, places=9)
        self.assertEqual(result, 0.0)

    def test_array_of_scores_all_match(self) -> None:
        """Multiple scores in a batch should each match the TypeScript scalar formula."""
        calibration = [2.0, 2.1, 1.9, 2.05, 1.95, 2.0, 2.02, 1.98, 2.0, 1.99]
        scores = [1.5, 2.0, 2.5, 5.0, 10.0, 50.0, -1.0]
        py_results = list(robust_normalize(np.array(scores), np.array(calibration)).astype(float))
        ts_results = [self._ts_robust_normalize(s, calibration) for s in scores]
        for i, (py_val, ts_val) in enumerate(zip(py_results, ts_results)):
            self.assertAlmostEqual(
                py_val, ts_val, places=9,
                msg=f"Divergence at score index {i}: py={py_val}, ts={ts_val}"
            )

    def test_output_always_in_zero_one_range(self) -> None:
        """The normalized output must always be in [0, 1]."""
        calibration = [3.0, 3.1, 2.9, 3.05, 2.95, 3.0, 3.02, 2.98, 3.0, 2.99]
        extreme_scores = [-1000.0, -1.0, 0.0, 3.0, 10.0, 100.0, 1000.0]
        for score in extreme_scores:
            result = float(robust_normalize(np.array([score]), np.array(calibration))[0])
            self.assertGreaterEqual(result, 0.0, f"Score {score} produced negative output")
            self.assertLessEqual(result, 1.0, f"Score {score} produced output > 1")

    def test_old_formula_would_differ(self) -> None:
        """Regression guard: the old Python formula (z/8) produces different values
        from the TypeScript formula ((z-1.5)/7) for the same inputs.

        Uses score=1.15 so z≈2, keeping both formula results below 1.0 and making
        the divergence (0.25 vs 0.071) clearly detectable.
        This test verifies the bug has been fixed by confirming the new formula matches."""
        calibration = [1.0, 1.1, 0.9, 1.05, 0.95, 1.0, 1.02, 0.98, 1.0, 0.99]
        score = 1.15
        center = float(np.median(calibration))
        deviations = np.abs(np.array(calibration) - center)
        scale = max(float(np.median(deviations)) * 1.4826, 1e-6)
        z = (score - center) / scale
        old_formula = min(1.0, max(0.0, z / 8.0))
        new_formula = min(1.0, max(0.0, (z - 1.5) / 7.0))
        ts_result = self._ts_robust_normalize(score, calibration)
        py_result = float(robust_normalize(np.array([score]), np.array(calibration))[0])
        # The old formula differs from TypeScript
        self.assertNotAlmostEqual(old_formula, ts_result, places=3,
            msg="Old formula unexpectedly matches TypeScript; guard is invalid")
        # The new formula matches TypeScript
        self.assertAlmostEqual(py_result, ts_result, places=9)
        self.assertAlmostEqual(py_result, new_formula, places=9)


if __name__ == "__main__":
    unittest.main()
