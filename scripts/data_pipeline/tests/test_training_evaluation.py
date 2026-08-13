from __future__ import annotations

import unittest
import tempfile
from pathlib import Path

import numpy as np

from scripts.data_pipeline.train_ensemble import (
    evaluate_event_level,
    persistent_flags,
    persistent_flags_by_scenario,
    require_explicit_promotion,
)


class TrainingEvaluationTests(unittest.TestCase):
    def test_public_candidate_requires_explicit_promotion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public = root / "public"
            with self.assertRaisesRegex(ValueError, "--promote-web"):
                require_explicit_promotion([public / "models" / "candidate.onnx"], public, False)

    def test_staging_output_does_not_require_promotion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            require_explicit_promotion(
                [root / "artifacts" / "training" / "candidate.onnx"],
                root / "public",
                False,
            )

    def test_explicit_promotion_allows_public_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            require_explicit_promotion(
                [root / "public" / "models" / "candidate.onnx"],
                root / "public",
                True,
            )

    def test_persistence_requires_three_of_five(self) -> None:
        scores = np.asarray([0.9, 0.1, 0.9, 0.1, 0.9])
        self.assertEqual(persistent_flags(scores).tolist(), [False, False, False, False, True])

    def test_persistence_resets_at_scenario_boundary(self) -> None:
        scores = np.asarray([0.9, 0.9, 0.9, 0.1, 0.1, 0.1])
        boundaries = [
            {"start": 0, "end": 3},
            {"start": 3, "end": 6},
        ]
        flags = persistent_flags_by_scenario(scores, boundaries)
        self.assertEqual(flags.tolist(), [False, False, True, False, False, False])

    def test_event_level_metrics_report_delay_and_false_alert_rate(self) -> None:
        scores = np.asarray([0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.1])
        labels = np.asarray([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1])
        timestamps = np.arange(12) * 60
        boundary = {"eventId": 618, "classification": "ANOMALY", "start": 0, "end": 12}
        metrics = evaluate_event_level(scores, labels, [boundary], timestamps)
        self.assertEqual(metrics["detectedEvents"], 1)
        self.assertEqual(metrics["falseAlertEpisodes"], 1)
        self.assertEqual(metrics["meanDetectionDelaySeconds"], 120.0)
        self.assertAlmostEqual(metrics["precision"], 0.5)
        self.assertAlmostEqual(metrics["recall"], 1.0)


if __name__ == "__main__":
    unittest.main()
