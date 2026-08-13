# FlightSentry architecture

## Trust boundaries

| Boundary | Input | Output | Rule |
| --- | --- | --- | --- |
| Telemetry replay | Attributed scenario pack | Ordered numeric samples | No LLM processing |
| Detector ensemble | Numeric samples | Scores, contributors, persistent alert | Deterministic and browser-local |
| Context resolver | Known scenario ID | Trusted evidence packet | No arbitrary public prompt or telemetry upload |
| Granite route | Trusted packet | Structured incident brief | Server-only credentials, temperature 0, one retry |
| Response validator | Granite JSON | Operator-visible analysis | Reject unknown evidence IDs; ambiguity becomes `INVESTIGATE` |

## Detector flow

- Rolling MAD detects robust per-channel deviation over a ten-sample window.
- Isolation Forest uses normalized values and deltas, with 48 deterministic trees in the bundled replay.
- The browser loads a **bundled rank-2 linear ONNX autoencoder** (built by `scripts/data_pipeline/build_demo_model.py`) through ONNX Runtime Web. This artifact uses an orthonormal basis derived from the bundled fixture and is intentionally transparent. If loading fails, the equivalent TypeScript PCA scorer remains available and the UI labels the fallback.
- Scores are normalized against nominal calibration samples using `clip((z - 1.5) / 7, 0, 1)` where `z` is the robust z-score against calibration, and fused at weights `0.30 / 0.30 / 0.40`.
- An alert requires at least three of five recent fused scores at or above `0.78`.

The full Python pipeline (`scripts/data_pipeline/train_ensemble.py`) trains a **nonlinear MLPRegressor autoencoder** with the architecture 4-8-2-8-4 on ESA Mission 2 nominal data. It exports a staged ONNX candidate and runs a validation grid search to select ensemble weights and write provenance. Source artifacts remain under ignored staging by default; writing under `public/` requires `--promote-web` after evaluation and browser-parity review. Bundled values demonstrate the interface and are not official ESA benchmark results.

## Granite failure handling

1. Live calls are disabled unless `GRANITE_LIVE_ENABLED=true` and required credentials exist.
2. IAM tokens are cached server-side until one minute before expiry.
3. watsonx requests time out after 25 seconds and retry once.
4. Zod validates field shape and size.
5. Every model-cited evidence ID must exist in the trusted packet.
6. `MONITOR` without operational context, or with explicit ambiguity, becomes `INVESTIGATE`.
7. Failure returns a visibly labeled, validated reference brief; the replay remains usable.

## Safety properties

- The application exposes no command-generation or command-execution interface.
- Public requests accept only `esa-m2-609` or `esa-m2-618`.
- watsonx credentials never enter the client bundle.
- Model output is advice for a human operator, not flight authority.
