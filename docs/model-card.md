# Model card

## Intended use

FlightSentry provides human-in-the-loop anomaly triage for a challenge prototype. It detects persistent telemetry changes and produces evidence-grounded diagnostic guidance.

## Components

| Component | Purpose | Bundled implementation |
| --- | --- | --- |
| Rolling MAD | Transparent local deviation | Ten-sample robust window |
| Isolation Forest | Multivariate outlier detection | 48 deterministic trees over values and deltas |
| Autoencoder (browser demo) | Correlated reconstruction error | Rank-2 linear ONNX model built by `build_demo_model.py`; orthonormal basis from fixture |
| Autoencoder (source pipeline) | Correlated reconstruction error | Nonlinear MLPRegressor 4-8-2-8-4 trained by `train_ensemble.py` on ESA Mission 2 nominal data |
| Granite 4 | Evidence interpretation | watsonx.ai structured chat, temperature 0 |

### Autoencoder distinction

The **bundled browser demo model** (`public/models/flightsentry-autoencoder.onnx`) is a rank-2 linear ONNX autoencoder produced by `scripts/data_pipeline/build_demo_model.py`. It uses two `MatMul` operations (encoder and decoder) with an orthonormal basis learned from the correlated shape of the bundled fixture. It is intentionally simple and transparent for browser-local evaluation.

The **source-data training pipeline** (`scripts/data_pipeline/train_ensemble.py`) trains a nonlinear `MLPRegressor` with hidden layer sizes `(8, 2, 8)`, activation `tanh`, and an overall 4-8-2-8-4 structure on ESA Mission 2 nominal data. Running the pipeline exports a staged ONNX candidate and selects ensemble weights via grid search calibrated to the same normalization scale used by the browser. Promotion to `public/models` is deliberately gated by `--promote-web`.

## Score normalization

All three detector raw scores are normalized to `[0, 1]` using:

```
normalized = clip((z - 1.5) / 7, 0, 1)
```

where `z = (score - median(calibration)) / (MAD(calibration) * 1.4826)`. This formula is applied identically in TypeScript (`src/lib/detectors.ts`) and Python (`scripts/data_pipeline/train_ensemble.py`). The 1.5 dead-band suppresses small deviations; `/7` scales typical anomaly z-scores into the `[0, 1]` range.

## Guardrails

- Granite sees only trusted scenario evidence.
- Evidence IDs are validated after generation.
- Ambiguous `MONITOR` results become `INVESTIGATE`, and `MONITOR` is refused server-side unless the full deterministic context gate passes, not merely when both evidence kinds exist.
- Explicitly ambiguous `ESCALATE` results resolve to `INVESTIGATE`.
- The deterministic context gate, not Granite prose, controls whether event 609 qualifies for `MONITOR`.
- Telemetry-only mode and every failed required context check resolve to `INVESTIGATE`.
- Counterfactual evidence removal recalculates locally and withholds the now-stale Granite brief.
- Diagnostic checks may be suggested; spacecraft commands may not.
- Reference analyses keep the demo deterministic during API failure.

## Evaluation

The UI reports bundled paired-case detector scores and dispositions, clearly labeled `n=2`. The source-data pipeline writes event-level precision, recall, F1, false-alert episodes per replay hour, detection delay, detector ablation, ensemble weights, and scenario boundaries to `artifacts/training/source-v1/metrics.json`.

The August 13 source run fit on 87 nominal samples, calibrated on 38 separate nominal samples, selected weights on event 609, and held event 618 out of fitting and selection. The staged ensemble detected both events. On held-out event 618 it achieved event F1 `0.50`, two false-alert episodes (`1.6736/hour`), and `198 s` detection delay. Rolling MAD alone achieved F1 `0.67` with one false-alert episode, so the candidate was not promoted. Exact results are in `docs/source-evaluation.md`.

These are FlightSentry project metrics, not official ESA-ADB leaderboard scores.

### Paired-case context evaluation

| Metric | Result |
| --- | ---: |
| Telemetry-only investigations | 2 of 2 |
| Trusted-context investigations | 1 of 2 |
| Unnecessary investigations prevented | 1 |
| Rare-nominal de-escalation rate | 100% |
| Anomaly investigation recall | 100% |
| Counterfactual dependency rate | 100% (2 of 2 removals) |

This `n=2` result measures the intended paired demonstration only. It does not establish mission-wide generalization.

## Limitations

- Two cases cannot establish generalization across spacecraft or mission phases.
- The bundled linear autoencoder prioritizes browser transparency over state-of-the-art accuracy.
- The source-pipeline MLPRegressor is more expressive but requires ESA Mission 2 data to train.
- The source evaluation has one validation event and one held-out event; it does not establish mission-wide generalization.
- Granite hypotheses remain probabilistic interpretations and require operator verification.
- Replay command-history and mission-plan completeness are fixture assertions, not conclusions derived from the anonymized ESA files.
- The ESA data does not prove command acknowledgement or map the anonymized command to a named subsystem.
