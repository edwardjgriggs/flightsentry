"""Tests verifying that the Python-generated detector configuration artifacts
are schema-compatible with the TypeScript DetectorConfig type validated by
src/lib/detector-config.ts validateConfig().

These tests do NOT depend on ESA source data. They verify:
 - build_demo_model._BUNDLED_DETECTOR_CONFIG passes schema validation
 - train_ensemble.py web_config shape passes schema validation
 - Invalid configs are correctly rejected
 - The normalization identifiers in the artifact match normalize.py constants
"""

from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.data_pipeline.build_demo_model import _BUNDLED_DETECTOR_CONFIG


# ── Schema validation helper mirroring TypeScript validateConfig() ────────────

_EXPECTED_NORMALIZATION_FORMULA = "robust-z-clip"
_EXPECTED_NORMALIZATION_VERSION = "1"


def _validate_config(config: dict) -> None:
    """Mirrors the invariants enforced by src/lib/detector-config.ts validateConfig().

    Raises ValueError with a descriptive message if any invariant is violated.
    """
    # schemaVersion
    if not isinstance(config.get("schemaVersion"), str) or not config["schemaVersion"].strip():
        raise ValueError("schemaVersion must be a non-empty string")

    # weights
    weights = config.get("weights")
    if not isinstance(weights, dict):
        raise ValueError("weights must be an object")
    for key in ("mad", "isolationForest", "autoencoder"):
        v = weights.get(key)
        if not isinstance(v, (int, float)) or not _is_finite(v) or v < 0:
            raise ValueError(f"weights.{key} must be a finite non-negative number (got {v!r})")
    weight_sum = weights["mad"] + weights["isolationForest"] + weights["autoencoder"]
    if abs(weight_sum - 1.0) > 1e-9:
        raise ValueError(f"weights must sum to 1 within 1e-9 (sum={weight_sum})")

    # alertThreshold
    t = config.get("alertThreshold")
    if not isinstance(t, (int, float)) or not _is_finite(t) or t < 0 or t > 1:
        raise ValueError(f"alertThreshold must be in [0, 1] (got {t!r})")

    # persistence
    p = config.get("persistence")
    if not isinstance(p, dict):
        raise ValueError("persistence must be an object")
    window = p.get("window")
    required = p.get("requiredCount")
    if not isinstance(window, int) or window < 1:
        raise ValueError(f"persistence.window must be a positive integer (got {window!r})")
    if not isinstance(required, int) or required < 1:
        raise ValueError(f"persistence.requiredCount must be a positive integer (got {required!r})")
    if required > window:
        raise ValueError(
            f"persistence.requiredCount ({required}) must not exceed persistence.window ({window})"
        )

    # normalization
    n = config.get("normalization")
    if not isinstance(n, dict):
        raise ValueError("normalization must be an object")
    if n.get("formula") != _EXPECTED_NORMALIZATION_FORMULA:
        raise ValueError(
            f'normalization.formula "{n.get("formula")}" does not match '
            f'implementation "{_EXPECTED_NORMALIZATION_FORMULA}"'
        )
    if n.get("version") != _EXPECTED_NORMALIZATION_VERSION:
        raise ValueError(
            f'normalization.version "{n.get("version")}" does not match '
            f'implementation "{_EXPECTED_NORMALIZATION_VERSION}"'
        )

    # provenance
    prov = config.get("provenance")
    if not isinstance(prov, dict):
        raise ValueError("provenance must be an object")
    for key in ("source", "weightsSource", "thresholdSource", "generatedBy", "replacedBy"):
        v = prov.get(key)
        if not isinstance(v, str) or not v.strip():
            raise ValueError(f"provenance.{key} must be a non-empty string")


def _is_finite(v: float) -> bool:
    import math
    return math.isfinite(v)


# ── Tests ─────────────────────────────────────────────────────────────────────

class DetectorConfigSchemaTests(unittest.TestCase):
    """Verify Python-generated config artifacts pass the TypeScript schema."""

    def test_bundled_demo_config_passes_validation(self) -> None:
        """_BUNDLED_DETECTOR_CONFIG from build_demo_model.py must pass validation."""
        try:
            _validate_config(copy.deepcopy(_BUNDLED_DETECTOR_CONFIG))
        except ValueError as exc:
            self.fail(f"_BUNDLED_DETECTOR_CONFIG failed validation: {exc}")

    def test_bundled_weights_sum_to_one(self) -> None:
        w = _BUNDLED_DETECTOR_CONFIG["weights"]
        total = w["mad"] + w["isolationForest"] + w["autoencoder"]
        self.assertAlmostEqual(total, 1.0, places=9)

    def test_bundled_threshold_in_range(self) -> None:
        t = _BUNDLED_DETECTOR_CONFIG["alertThreshold"]
        self.assertGreaterEqual(t, 0.0)
        self.assertLessEqual(t, 1.0)

    def test_bundled_persistence_required_lte_window(self) -> None:
        p = _BUNDLED_DETECTOR_CONFIG["persistence"]
        self.assertLessEqual(p["requiredCount"], p["window"])

    def test_bundled_normalization_identifiers_match_constants(self) -> None:
        n = _BUNDLED_DETECTOR_CONFIG["normalization"]
        self.assertEqual(n["formula"], _EXPECTED_NORMALIZATION_FORMULA)
        self.assertEqual(n["version"], _EXPECTED_NORMALIZATION_VERSION)

    def test_train_ensemble_config_shape_passes_validation(self) -> None:
        """A representative train_ensemble.py-generated config must pass validation."""
        config = {
            "schemaVersion": "1",
            "configProfile": "source-data-trained-v1",
            "scope": (
                "Grid-search-calibrated weights from ESA Mission 2 source data. "
                "These are FlightSentry project metrics, not official ESA-ADB benchmark results."
            ),
            "weights": {
                "mad": 0.3,
                "isolationForest": 0.4,
                "autoencoder": 0.3,
            },
            "alertThreshold": 0.78,
            "persistence": {
                "window": 5,
                "requiredCount": 3,
            },
            "normalization": {
                "formula": "robust-z-clip",
                "version": "1",
                "description": (
                    "clip((z - 1.5) / 7, 0, 1) where z = (score - median(calibration)) "
                    "/ (MAD(calibration) * 1.4826)"
                ),
                "deadBand": 1.5,
                "scale": 7,
                "madMultiplier": 1.4826,
                "minScale": 1e-6,
            },
            "modelType": "source-data-nonlinear-onnx",
            "provenance": {
                "source": "ESA Mission 2 / Zenodo 12528696",
                "weightsSource": "Grid search on 500 samples; F1=0.9500",
                "thresholdSource": "Fixed at 0.78 (calibrated to robust-z-clip normalization scale)",
                "generatedBy": "scripts/data_pipeline/train_ensemble.py",
                "replacedBy": "Re-run train_ensemble.py against updated ESA Mission 2 source data",
            },
        }
        try:
            _validate_config(config)
        except ValueError as exc:
            self.fail(f"train_ensemble config shape failed validation: {exc}")

    def test_config_written_to_disk_is_valid_json_and_passes_validation(self) -> None:
        """build_demo_model writes valid JSON that passes schema validation."""
        import scripts.data_pipeline.build_demo_model as bdm
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_onnx = Path(tmp_dir) / "model.onnx"
            bdm.build_model(out_onnx)
            config_path = out_onnx.parent / "detector-config.json"
            self.assertTrue(config_path.exists(), "detector-config.json was not written")
            parsed = json.loads(config_path.read_text("utf-8"))
            try:
                _validate_config(parsed)
            except ValueError as exc:
                self.fail(f"Written detector-config.json failed validation: {exc}")

    def test_invalid_weight_sum_is_rejected(self) -> None:
        cfg = copy.deepcopy(_BUNDLED_DETECTOR_CONFIG)
        cfg["weights"]["mad"] = 0.5  # sum becomes 1.2
        with self.assertRaisesRegex(ValueError, "sum"):
            _validate_config(cfg)

    def test_negative_weight_is_rejected(self) -> None:
        cfg = copy.deepcopy(_BUNDLED_DETECTOR_CONFIG)
        cfg["weights"]["mad"] = -0.1
        with self.assertRaisesRegex(ValueError, "non-negative"):
            _validate_config(cfg)

    def test_threshold_out_of_range_is_rejected(self) -> None:
        cfg = copy.deepcopy(_BUNDLED_DETECTOR_CONFIG)
        cfg["alertThreshold"] = 1.5
        with self.assertRaisesRegex(ValueError, r"\[0, 1\]"):
            _validate_config(cfg)

    def test_persistence_required_exceeds_window_is_rejected(self) -> None:
        cfg = copy.deepcopy(_BUNDLED_DETECTOR_CONFIG)
        cfg["persistence"]["requiredCount"] = 6
        cfg["persistence"]["window"] = 5
        with self.assertRaisesRegex(ValueError, "must not exceed"):
            _validate_config(cfg)

    def test_normalization_formula_mismatch_is_rejected(self) -> None:
        cfg = copy.deepcopy(_BUNDLED_DETECTOR_CONFIG)
        cfg["normalization"]["formula"] = "legacy-z-8"
        with self.assertRaisesRegex(ValueError, "normalization.formula"):
            _validate_config(cfg)

    def test_normalization_version_mismatch_is_rejected(self) -> None:
        cfg = copy.deepcopy(_BUNDLED_DETECTOR_CONFIG)
        cfg["normalization"]["version"] = "2"
        with self.assertRaisesRegex(ValueError, "normalization.version"):
            _validate_config(cfg)

    def test_empty_provenance_source_is_rejected(self) -> None:
        cfg = copy.deepcopy(_BUNDLED_DETECTOR_CONFIG)
        cfg["provenance"]["source"] = ""
        with self.assertRaisesRegex(ValueError, "provenance.source"):
            _validate_config(cfg)


if __name__ == "__main__":
    unittest.main()
