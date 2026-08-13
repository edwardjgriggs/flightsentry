"""Shared normalization utilities for the FlightSentry detector pipeline.

Extracted here to allow import without pulling in scikit-learn, ONNX, or joblib.
The formula matches src/lib/detectors.ts robustNormalize() exactly.
"""

from __future__ import annotations

import numpy as np


def robust_normalize(values: np.ndarray, calibration: np.ndarray) -> np.ndarray:
    """Normalize raw detector scores to [0, 1].

    Formula: clip((z - 1.5) / 7, 0, 1) where z = (value - median) / (MAD * 1.4826).
    Matches the TypeScript implementation in src/lib/detectors.ts robustNormalize().
    The 1.5 dead-band suppresses small nominal deviations; /7 maps typical anomaly
    z-scores into the unit interval.

    Args:
        values: Raw detector scores to normalize (1-D array).
        calibration: Nominal baseline scores used to compute center and scale.

    Returns:
        Normalized scores clipped to [0, 1].
    """
    center = np.median(calibration)
    scale = max(np.median(np.abs(calibration - center)) * 1.4826, 1e-6)
    z = (values - center) / scale
    return np.clip((z - 1.5) / 7.0, 0.0, 1.0)
