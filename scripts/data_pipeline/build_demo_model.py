"""Build the small linear autoencoder used by the bundled browser replay.

The model is intentionally transparent: four normalized telemetry inputs are
projected into a two-dimensional bottleneck and reconstructed. The full ESA
pipeline replaces this artifact with one trained from Mission 2 nominal data.

This script also regenerates public/models/detector-config.json with the
bundled-demo profile so the TypeScript build consumes consistent values.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

_BUNDLED_DETECTOR_CONFIG = {
    "schemaVersion": "1",
    "configProfile": "bundled-demo-v1",
    "scope": (
        "DEMONSTRATION ONLY — not official ESA-ADB benchmark results. "
        "Bundled weights were hand-selected for the two-scenario browser demo; "
        "run train_ensemble.py against ESA Mission 2 source data to replace with "
        "grid-search-calibrated values."
    ),
    "weights": {
        "mad": 0.3,
        "isolationForest": 0.3,
        "autoencoder": 0.4,
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
    "modelType": "bundled-rank2-linear-onnx",
    "provenance": {
        "source": "build_demo_model.py deterministic construction — no ESA source data",
        "weightsSource": "hand-selected for bundled two-scenario demo",
        "thresholdSource": "hand-selected for bundled two-scenario demo",
        "generatedBy": "scripts/data_pipeline/build_demo_model.py",
        "replacedBy": (
            "Run scripts/data_pipeline/train_ensemble.py against ESA Mission 2 "
            "source data (Zenodo 12528696)"
        ),
    },
}


CHANNELS = [
    "eps_bus_voltage",
    "aocs_wheel_current",
    "thermal_panel_temp",
    "aocs_attitude_error",
]


def build_model(output_path: Path) -> None:
    # Orthonormal basis learned from the correlated nominal shape of the
    # bundled fixture. Production training writes its learned basis instead.
    encoder = np.array(
        [
            [0.54, 0.42],
            [-0.50, 0.52],
            [-0.47, -0.61],
            [0.49, -0.43],
        ],
        dtype=np.float32,
    )
    encoder, _ = np.linalg.qr(encoder)
    decoder = encoder.T.astype(np.float32)

    graph = helper.make_graph(
        [
            helper.make_node("MatMul", ["input", "encoder"], ["latent"]),
            helper.make_node("MatMul", ["latent", "decoder"], ["reconstruction"]),
        ],
        "FlightSentryLinearAutoencoder",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, 4])],
        [
            helper.make_tensor_value_info(
                "reconstruction", TensorProto.FLOAT, [None, 4]
            )
        ],
        [
            numpy_helper.from_array(encoder.astype(np.float32), name="encoder"),
            numpy_helper.from_array(decoder, name="decoder"),
        ],
    )
    model = helper.make_model(
        graph,
        producer_name="FlightSentry",
        opset_imports=[helper.make_opsetid("", 18)],
    )
    model.ir_version = 9
    onnx.checker.check_model(model)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, output_path)

    metadata = {
        "name": "FlightSentry bundled linear autoencoder (demo artifact)",
        "version": 1,
        "architecture": "rank-2 linear: MatMul(encoder) + MatMul(decoder), no activation",
        "input": "normalized telemetry rows (StandardScaler fit on first 36 samples)",
        "channels": CHANNELS,
        "bottleneckDimensions": 2,
        "trainingData": "bundled deterministic challenge fixture — NOT trained on ESA Mission 2 source data",
        "distinction": (
            "This is the transparent browser demo artifact. "
            "train_ensemble.py produces a nonlinear MLPRegressor 4-8-2-8-4 "
            "trained on ESA Mission 2 nominal data and replaces this file."
        ),
        "replacement": "Run train_ensemble.py against ESA Mission 2 extracts.",
    }
    output_path.with_suffix(".json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )

    # Also regenerate the versioned detector configuration artifact so the
    # TypeScript build gets consistent values when only the demo model is built.
    config_path = output_path.parent / "detector-config.json"
    config_path.write_text(
        json.dumps(_BUNDLED_DETECTOR_CONFIG, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/models/flightsentry-autoencoder.onnx"),
    )
    args = parser.parse_args()
    resolved = args.output.resolve()
    build_model(resolved)
    print(f"Wrote {args.output}")
    print(f"Wrote {resolved.parent / 'detector-config.json'}")


if __name__ == "__main__":
    main()
