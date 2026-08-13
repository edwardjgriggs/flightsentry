"""Train, validate, and export FlightSentry detector artifacts."""

from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

from scripts.data_pipeline.normalize import robust_normalize

__all__ = ["robust_normalize"]


def persistent_flags(scores: np.ndarray, threshold: float = 0.78) -> np.ndarray:
    flags = np.zeros_like(scores, dtype=bool)
    for index in range(len(scores)):
        flags[index] = np.count_nonzero(scores[max(0, index - 4) : index + 1] >= threshold) >= 3
    return flags


def load_scenarios(input_dir: Path) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]], list[str]]:
    all_rows: list[list[float]] = []
    labels: list[int] = []
    boundaries: list[dict[str, Any]] = []
    channel_ids: list[str] | None = None
    for path in sorted(input_dir.glob("esa-m2-*.json")):
        payload = json.loads(path.read_text("utf-8"))
        current_ids = [channel["id"] for channel in payload["channels"]]
        if channel_ids is None:
            channel_ids = current_ids
        if current_ids != channel_ids:
            raise ValueError("Scenario channel order must match for joint training")
        start = len(all_rows)
        for sample in payload["telemetry"]:
            all_rows.append([sample["values"][name] for name in channel_ids])
            labels.append(int(sample["eventActive"]))
        boundaries.append(
            {
                "eventId": payload["eventId"],
                "classification": payload["classification"],
                "start": start,
                "end": len(all_rows),
            }
        )
    if not all_rows or channel_ids is None:
        raise ValueError(f"No scenario packs found in {input_dir}")
    return np.asarray(all_rows, dtype=np.float32), np.asarray(labels), boundaries, channel_ids


def rename_onnx_output(model: Any, new_name: str) -> None:
    old_name = model.graph.output[0].name
    for node in model.graph.node:
        for index, name in enumerate(node.output):
            if name == old_name:
                node.output[index] = new_name
    model.graph.output[0].name = new_name


_WEB_CONFIG_SCHEMA_VERSION = "1"
_NORMALIZATION_FORMULA = "robust-z-clip"
_NORMALIZATION_VERSION = "1"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/work/scenarios"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/training"))
    parser.add_argument(
        "--web-model", type=Path, default=Path("public/models/flightsentry-autoencoder.onnx")
    )
    parser.add_argument(
        "--web-config",
        type=Path,
        default=Path("public/models/detector-config.json"),
        help="Path to write the versioned detector configuration artifact consumed by the TypeScript build.",
    )
    args = parser.parse_args()

    x, event_labels, boundaries, channels = load_scenarios(args.input_dir.resolve())
    nominal_indices = np.flatnonzero(event_labels == 0)
    split = max(1, int(len(nominal_indices) * 0.7))
    train_indices, validation_indices = nominal_indices[:split], nominal_indices[split:]
    scaler = StandardScaler().fit(x[train_indices])
    normalized = scaler.transform(x).astype(np.float32)

    isolation = IsolationForest(n_estimators=128, max_samples="auto", random_state=609618)
    isolation.fit(normalized[train_indices])
    isolation_raw = -isolation.score_samples(normalized)

    autoencoder = MLPRegressor(
        hidden_layer_sizes=(8, 2, 8),
        activation="tanh",
        solver="adam",
        early_stopping=True,
        max_iter=600,
        random_state=609618,
    )
    autoencoder.fit(normalized[train_indices], normalized[train_indices])
    reconstructed = autoencoder.predict(normalized)
    autoencoder_raw = np.mean(np.square(normalized - reconstructed), axis=1)

    centers = np.median(normalized[train_indices], axis=0)
    scales = np.maximum(
        np.median(np.abs(normalized[train_indices] - centers), axis=0) * 1.4826,
        1e-6,
    )
    mad_raw = np.max(np.abs(normalized - centers) / scales, axis=1)
    detector_scores = np.column_stack(
        [
            robust_normalize(mad_raw, mad_raw[validation_indices]),
            robust_normalize(isolation_raw, isolation_raw[validation_indices]),
            robust_normalize(autoencoder_raw, autoencoder_raw[validation_indices]),
        ]
    )

    candidates: list[tuple[float, float, float, float, int, float]] = []
    for first in np.arange(0.0, 1.01, 0.1):
        for second in np.arange(0.0, 1.01 - first, 0.1):
            third = round(1.0 - first - second, 10)
            weights = np.array([first, second, third])
            fused = detector_scores @ weights
            flags = persistent_flags(fused)
            f1 = f1_score(event_labels, flags, zero_division=0)
            false_alerts = int(np.count_nonzero(flags & (event_labels == 0)))
            first_detection = int(np.argmax(flags)) if np.any(flags) else len(flags)
            candidates.append((f1, -false_alerts, -first_detection, first, second, third))
    best = max(candidates)
    weights = np.array(best[3:])
    fused = detector_scores @ weights
    flags = persistent_flags(fused)

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump({"scaler": scaler, "isolationForest": isolation}, output_dir / "detectors.joblib")
    onnx_model = convert_sklearn(
        autoencoder,
        initial_types=[("input", FloatTensorType([None, len(channels)]))],
        target_opset=18,
    )
    rename_onnx_output(onnx_model, "reconstruction")
    web_model = args.web_model.resolve()
    web_model.parent.mkdir(parents=True, exist_ok=True)
    web_model.write_bytes(onnx_model.SerializeToString())

    metrics = {
        "scope": "FlightSentry extracted scenario validation; not official ESA-ADB metrics",
        "samples": int(len(x)),
        "eventSamples": int(event_labels.sum()),
        "precision": precision_score(event_labels, flags, zero_division=0),
        "recall": recall_score(event_labels, flags, zero_division=0),
        "f1": f1_score(event_labels, flags, zero_division=0),
        "falseAlertSamples": int(np.count_nonzero(flags & (event_labels == 0))),
        "weights": {"mad": float(weights[0]), "isolationForest": float(weights[1]), "autoencoder": float(weights[2])},
        "threshold": 0.78,
        "persistence": "3 of 5 windows",
        "channels": channels,
        "scenarioBoundaries": boundaries,
    }
    (output_dir / "metrics.json").write_text(
        json.dumps(metrics, indent=2, default=float) + "\n", "utf-8"
    )
    provenance_doc = {
        "randomSeed": 609618,
        "normalization": "StandardScaler fit on nominal training samples",
        "scoreNormalization": "clip((z - 1.5) / 7, 0, 1) — matches TypeScript robustNormalize in src/lib/detectors.ts",
        "autoencoderPipeline": "MLPRegressor hidden_layer_sizes=(8, 2, 8) activation=tanh — nonlinear, 4-8-2-8-4 structure",
        "autoencoderBundled": "Rank-2 linear ONNX model from build_demo_model.py — replaced by this artifact on pipeline run",
        "isolationForestTrees": 128,
        "source": "ESA Mission 2 / Zenodo 12528696",
    }
    (output_dir / "model-provenance.json").write_text(
        json.dumps(provenance_doc, indent=2) + "\n", "utf-8"
    )

    # ── Write the versioned web configuration artifact ────────────────────────
    # This file is consumed by src/lib/detector-config.ts at TypeScript build
    # time. It replaces the bundled-demo profile with source-data-trained values.
    # The schema must remain compatible with the TypeScript DetectorConfig type.
    web_config_path = args.web_config.resolve()
    web_config_path.parent.mkdir(parents=True, exist_ok=True)
    web_config = {
        "schemaVersion": _WEB_CONFIG_SCHEMA_VERSION,
        "configProfile": "source-data-trained-v1",
        "scope": (
            "Grid-search-calibrated weights from ESA Mission 2 source data. "
            "These are FlightSentry project metrics, not official ESA-ADB benchmark results."
        ),
        "weights": {
            "mad": float(weights[0]),
            "isolationForest": float(weights[1]),
            "autoencoder": float(weights[2]),
        },
        "alertThreshold": 0.78,
        "persistence": {
            "window": 5,
            "requiredCount": 3,
        },
        "normalization": {
            "formula": _NORMALIZATION_FORMULA,
            "version": _NORMALIZATION_VERSION,
            "description": "clip((z - 1.5) / 7, 0, 1) where z = (score - median(calibration)) / (MAD(calibration) * 1.4826)",
            "deadBand": 1.5,
            "scale": 7,
            "madMultiplier": 1.4826,
            "minScale": 1e-6,
        },
        "modelType": "source-data-nonlinear-onnx",
        "provenance": {
            "source": "ESA Mission 2 / Zenodo 12528696",
            "weightsSource": (
                f"Grid search on {int(len(x))} samples from ESA Mission 2 extracted scenarios; "
                f"F1={float(f1_score(event_labels, flags, zero_division=0)):.4f}"
            ),
            "thresholdSource": "Fixed at 0.78 (calibrated to robust-z-clip normalization scale)",
            "generatedBy": "scripts/data_pipeline/train_ensemble.py",
            "replacedBy": "Re-run train_ensemble.py against updated ESA Mission 2 source data",
        },
    }
    web_config_path.write_text(json.dumps(web_config, indent=2) + "\n", "utf-8")
    print(f"Wrote web config to {web_config_path}")
    print(json.dumps(metrics, indent=2, default=float))


if __name__ == "__main__":
    main()
