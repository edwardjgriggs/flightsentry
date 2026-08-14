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


def persistent_flags(
    scores: np.ndarray,
    threshold: float = 0.78,
    window: int = 5,
    required_count: int = 3,
) -> np.ndarray:
    flags = np.zeros_like(scores, dtype=bool)
    for index in range(len(scores)):
        recent = scores[max(0, index - (window - 1)) : index + 1]
        flags[index] = np.count_nonzero(recent >= threshold) >= required_count
    return flags


def persistent_flags_by_scenario(
    scores: np.ndarray, boundaries: list[dict[str, Any]], threshold: float = 0.78
) -> np.ndarray:
    flags = np.zeros_like(scores, dtype=bool)
    for boundary in boundaries:
        start, end = boundary["start"], boundary["end"]
        flags[start:end] = persistent_flags(scores[start:end], threshold)
    return flags


def _episode_count(mask: np.ndarray) -> int:
    if len(mask) == 0:
        return 0
    return int(np.count_nonzero(mask & np.concatenate(([True], ~mask[:-1]))))


def evaluate_event_level(
    scores: np.ndarray,
    event_labels: np.ndarray,
    boundaries: list[dict[str, Any]],
    timestamps: np.ndarray,
) -> dict[str, Any]:
    true_positive_events = 0
    false_alert_episodes = 0
    delays: list[float] = []
    event_results: list[dict[str, Any]] = []
    replay_seconds = 0.0

    for boundary in boundaries:
        start, end = boundary["start"], boundary["end"]
        local_scores = scores[start:end]
        local_labels = event_labels[start:end].astype(bool)
        local_timestamps = timestamps[start:end]
        flags = persistent_flags(local_scores)
        event_positions = np.flatnonzero(local_labels)
        if len(event_positions) == 0:
            raise ValueError(f"Scenario {boundary['eventId']} contains no active event samples")
        detected_positions = np.flatnonzero(flags & local_labels)
        detected = len(detected_positions) > 0
        if detected:
            true_positive_events += 1
            delay = float(
                local_timestamps[detected_positions[0]] - local_timestamps[event_positions[0]]
            )
            delays.append(delay)
        else:
            delay = None
        false_episodes = _episode_count(flags & ~local_labels)
        false_alert_episodes += false_episodes
        replay_seconds += max(float(local_timestamps[-1] - local_timestamps[0]), 1.0)
        event_results.append(
            {
                "eventId": boundary["eventId"],
                "classification": boundary["classification"],
                "detected": detected,
                "detectionDelaySeconds": delay,
                "falseAlertEpisodes": false_episodes,
                "maxScore": float(np.max(local_scores)),
            }
        )

    false_negative_events = len(boundaries) - true_positive_events
    precision = (
        true_positive_events / (true_positive_events + false_alert_episodes)
        if true_positive_events + false_alert_episodes
        else 0.0
    )
    recall = true_positive_events / len(boundaries) if boundaries else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "detectedEvents": true_positive_events,
        "missedEvents": false_negative_events,
        "falseAlertEpisodes": false_alert_episodes,
        "falseAlertsPerReplayHour": false_alert_episodes / (replay_seconds / 3600),
        "meanDetectionDelaySeconds": float(np.mean(delays)) if delays else None,
        "events": event_results,
    }


def load_scenarios(
    input_dir: Path,
) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]], list[str], np.ndarray]:
    all_rows: list[list[float]] = []
    labels: list[int] = []
    timestamps: list[int] = []
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
            timestamps.append(int(sample["timestamp"]))
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
    return (
        np.asarray(all_rows, dtype=np.float32),
        np.asarray(labels),
        boundaries,
        channel_ids,
        np.asarray(timestamps),
    )


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


def require_explicit_promotion(
    outputs: list[Path], public_root: Path, promote_web: bool
) -> None:
    public_root = public_root.resolve()
    if not promote_web and any(path.resolve().is_relative_to(public_root) for path in outputs):
        raise ValueError("Writing source-trained artifacts under public/ requires --promote-web")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/work/scenarios"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/training/source-v1"))
    parser.add_argument(
        "--web-model",
        type=Path,
        default=Path("artifacts/training/source-v1/flightsentry-autoencoder.onnx"),
        help="Candidate ONNX output. Defaults to ignored staging, not the public browser model.",
    )
    parser.add_argument(
        "--web-config",
        type=Path,
        default=Path("artifacts/training/source-v1/detector-config.json"),
        help="Candidate detector configuration output. Defaults to ignored staging.",
    )
    parser.add_argument(
        "--promote-web",
        action="store_true",
        help="Permit explicit writes under public/. Use only after browser parity and evaluation review.",
    )
    args = parser.parse_args()

    public_root = Path.cwd() / "public"
    requested_outputs = [args.web_model, args.web_config]
    require_explicit_promotion(requested_outputs, public_root, args.promote_web)

    x, event_labels, boundaries, channels, timestamps = load_scenarios(args.input_dir.resolve())
    boundary_by_id = {boundary["eventId"]: boundary for boundary in boundaries}
    if 609 not in boundary_by_id or 618 not in boundary_by_id:
        raise ValueError("Source-data evaluation requires paired events 609 and 618")
    validation_boundary = boundary_by_id[609]
    held_out_boundary = boundary_by_id[618]
    validation_range = np.arange(validation_boundary["start"], validation_boundary["end"])
    nominal_indices = validation_range[event_labels[validation_range] == 0]
    if len(nominal_indices) < 20:
        raise ValueError("Event 609 scenario does not contain enough nominal samples for fitting")
    split = min(len(nominal_indices) - 1, max(1, int(len(nominal_indices) * 0.7)))
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
        max_iter=2000,
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

    candidates: list[tuple[float, float, float, float, float, float]] = []
    for first in np.arange(0.0, 1.01, 0.1):
        for second in np.arange(0.0, 1.01 - first, 0.1):
            third = round(1.0 - first - second, 10)
            weights = np.array([first, second, third])
            fused = detector_scores @ weights
            validation_metrics = evaluate_event_level(
                fused,
                event_labels,
                [validation_boundary],
                timestamps,
            )
            delay = validation_metrics["meanDetectionDelaySeconds"]
            candidates.append(
                (
                    validation_metrics["f1"],
                    -validation_metrics["falseAlertEpisodes"],
                    -(delay if delay is not None else float("inf")),
                    first,
                    second,
                    third,
                )
            )
    best = max(candidates)
    weights = np.round(np.array(best[3:]), 10)
    fused = detector_scores @ weights
    flags = persistent_flags_by_scenario(fused, boundaries)

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

    methods = {
        "rollingMad": detector_scores[:, 0],
        "isolationForest": detector_scores[:, 1],
        "autoencoder": detector_scores[:, 2],
        "weightedEnsemble": fused,
    }
    validation_metrics = {
        name: evaluate_event_level(scores, event_labels, [validation_boundary], timestamps)
        for name, scores in methods.items()
    }
    held_out_metrics = {
        name: evaluate_event_level(scores, event_labels, [held_out_boundary], timestamps)
        for name, scores in methods.items()
    }
    paired_metrics = {
        name: evaluate_event_level(scores, event_labels, boundaries, timestamps)
        for name, scores in methods.items()
    }
    metrics = {
        "scope": "FlightSentry extracted scenario validation; not official ESA-ADB metrics",
        "evaluationDesign": {
            "modelFit": "Nominal samples from the event 609 replay window only",
            "scoreCalibration": "Held-out nominal samples from the event 609 replay window",
            "weightSelection": "Event-level F1 on event 609; false-alert episodes and detection delay are tie-breakers",
            "heldOutEvaluation": "Event 618 is excluded from model fitting, score calibration, and weight selection",
            "limitation": "One validation event and one held-out event; paired-case proof, not a mission-wide benchmark",
        },
        "samples": int(len(x)),
        "eventSamples": int(event_labels.sum()),
        "nominalTrainingSamples": int(len(train_indices)),
        "nominalCalibrationSamples": int(len(validation_indices)),
        "validation": validation_metrics,
        "heldOut": held_out_metrics,
        "paired": paired_metrics,
        "sampleLevelSecondary": {
            "precision": precision_score(event_labels, flags, zero_division=0),
            "recall": recall_score(event_labels, flags, zero_division=0),
            "f1": f1_score(event_labels, flags, zero_division=0),
            "falseAlertSamples": int(np.count_nonzero(flags & (event_labels == 0))),
        },
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
        "scoreNormalization": "clip((z - 1.5) / 7, 0, 1); matches TypeScript robustNormalize in src/lib/detectors.ts",
        "autoencoderPipeline": "MLPRegressor hidden_layer_sizes=(8, 2, 8) activation=tanh; nonlinear, 4-8-2-8-4 structure",
        "autoencoderBundled": "Rank-2 linear ONNX model from build_demo_model.py, replaced by this artifact on pipeline run",
        "isolationForestTrees": 128,
        "source": "ESA Mission 2 / Zenodo 12528696",
    }
    (output_dir / "model-provenance.json").write_text(
        json.dumps(provenance_doc, indent=2) + "\n", "utf-8"
    )

    # ── Write the versioned candidate configuration artifact ─────────────────
    # The default path is ignored staging. Promotion to the public browser path
    # is an explicit, gated action after parity and evaluation review.
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
                "Event-level grid search on validation event 609; "
                f"F1={validation_metrics['weightedEnsemble']['f1']:.4f}; "
                "event 618 held out from selection"
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
