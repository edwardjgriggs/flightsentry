# FlightSentry architecture

## Trust boundaries

| Boundary | Input | Output | Rule |
| --- | --- | --- | --- |
| Telemetry replay | Attributed scenario pack | Ordered numeric samples | No LLM processing |
| Detector ensemble | Numeric samples | Scores, contributors, persistent alert | Deterministic and browser-local |
| Context resolver | Known scenario ID | Trusted evidence packet | No arbitrary public prompt or telemetry upload |
| Context-integrity gate | Active trusted evidence | Deterministic disposition | Every required replay check must pass before `MONITOR` |
| Granite route | Trusted packet | Structured incident brief | Server-only credentials, temperature 0, one retry |
| Response validator | Granite JSON | Operator-visible analysis | Reject unknown evidence IDs; ambiguity becomes `INVESTIGATE` |
| Causal decision trace | Paired fixture, detector peaks, active context checks | Recalculating explainability path | Signal similarity is fixture-scoped and never changes policy |
| Operator checkpoint | Deterministic recommendation and active evidence | Accepted or severity-raised final disposition | A failed gate cannot be downgraded to `MONITOR` |
| Decision record export | Validated client state and operator checkpoint | JSON or printable HTML | No credentials, raw archive, or autonomous command interface |

## Context policy

`context-gate-v1` is deterministic and runs independently of Granite.

1. Telemetry-only mode always resolves a persistent anomaly alert to `INVESTIGATE` because operational intent is unavailable.
2. Trusted-context mode requires all six replay checks to pass: persistent detector alert, command record before onset, operational-event overlap, command-history completeness, mission-plan completeness, and the paired context record.
3. Removing either event 609 context record makes the gate fail and immediately changes the disposition from `MONITOR` to `INVESTIGATE`.
4. Event 618 remains `INVESTIGATE` because the complete replay slices contain no explanatory command or operational event.
5. Counterfactual recalculation does not call Granite. This proves the policy result is caused by structured evidence, not persuasive model text.

The completeness checks are explicitly labeled as bundled replay assertions. The ESA records verify anonymized command and event timing but do not prove command acknowledgement, subsystem mapping, or live-feed completeness. A production deployment must supply those attestations before applying the same policy to operational data.

## Detector flow

- Rolling MAD detects robust per-channel deviation over a ten-sample window.
- Isolation Forest uses normalized values and deltas, with 48 deterministic trees in the bundled replay.
- The browser loads a **bundled rank-2 linear ONNX autoencoder** (built by `scripts/data_pipeline/build_demo_model.py`) through ONNX Runtime Web. This artifact uses an orthonormal basis derived from the bundled fixture and is intentionally transparent. If loading fails, the equivalent TypeScript PCA scorer remains available and the UI labels the fallback.
- Scores are normalized against nominal calibration samples using `clip((z - 1.5) / 7, 0, 1)` where `z` is the robust z-score against calibration, and fused at weights `0.30 / 0.30 / 0.40`.
- An alert requires at least three of five recent fused scores at or above `0.78`.

The full Python pipeline (`scripts/data_pipeline/train_ensemble.py`) trains a **nonlinear MLPRegressor autoencoder** with the architecture 4-8-2-8-4 on ESA Mission 2 nominal data. It exports a staged ONNX candidate and runs a validation grid search to select ensemble weights and write provenance. Source artifacts remain under ignored staging by default; writing under `public/` requires `--promote-web` after evaluation and browser-parity review. Bundled values demonstrate the interface and are not official ESA benchmark results.

## Granite failure handling

1. Live calls are disabled unless `GRANITE_LIVE_ENABLED=true` and required credentials exist.
2. IAM tokens are cached server-side until one minute before expiry, and parallel cold-start requests share one in-flight IAM exchange.
3. watsonx requests time out after 25 seconds and retry once; each failed attempt is logged server-side with a sanitized message only.
4. Zod validates field shape and size.
5. Every model-cited evidence ID must exist in the trusted packet.
6. `MONITOR` without operational context, with a failing context-gate result, or with explicit ambiguity becomes `INVESTIGATE`. An explicitly ambiguous `ESCALATE` also resolves to `INVESTIGATE`.
7. Failure returns a visibly labeled, validated reference brief realigned with the deterministic gate; the replay remains usable. The client labels every brief with its provenance (live model id or stored reference).
8. Successful live briefs are cached server-side for five minutes per scenario (deterministic input, temperature 0), so replay reruns do not re-bill watsonx. Reference fallbacks are never cached.
9. The public endpoint applies a per-client token-bucket rate limit (30 requests/minute burst) and returns 429 with `Retry-After` beyond it.

## Decision record

Each completed scenario can export a versioned JSON record or self-contained printable HTML record containing detector configuration and peaks, event onset and first persistent alert, active evidence IDs and timestamps, context checks, policy version, Granite or reference model source, uncertainty, and diagnostic checks. Schema version 2 added the structured operator checkpoint. Schema version 3 adds fixture-derived subsystem impact rows and the complete investigation runbook, including each result, operator finding, and update timestamp. Draft exports remain marked `PENDING`. A counterfactual export records removed evidence and marks the analysis as policy-only.

## Operator analysis surfaces

- The replay timeline is an inspection control, not a detector input. Scrubbing changes only the displayed historical frame. Once the replay has completed, deterministic decisions and analysis remain available while the operator reviews earlier timestamps.
- The causal decision trace computes Pearson shape correlation across the four shared fixture channels from four samples before onset through seven samples after the event window. The metric is labeled as a paired-fixture explainability aid, not an ESA benchmark result.
- The trace recalculates against the active evidence mode and counterfactual exclusions. Detector peaks remain unchanged while command evidence, plan evidence, gate checks, and disposition update.
- The subsystem impact map calculates each channel's pre-event baseline, signed peak delta, peak timestamp, and final-six-sample recovery. It does not collapse incomparable units into a synthetic severity score or claim root cause.
- The investigation runbook converts validated diagnostic checks into `PENDING`, `VERIFIED`, or `CONCERN` records. Pending checks and undocumented concerns block signoff.
- The human checkpoint permits the recommendation or a higher-severity disposition only. It never allows an operator to convert a failed gate to `MONITOR` inside the workbench.
- A recorded concern raises a `MONITOR` recommendation to a minimum final disposition of `INVESTIGATE`; the operator must also record the rationale for that severity raise.

## Safety properties

- The application exposes no command-generation or command-execution interface.
- Public requests accept only `esa-m2-609` or `esa-m2-618`, rate-limited per client.
- watsonx credentials never enter the client bundle.
- Model output is advice for a human operator, not flight authority.
- A strict Content-Security-Policy (no external hosts, `wasm-unsafe-eval` only for ONNX Runtime), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `X-Frame-Options` ship from `next.config.ts` on every host, not only on Vercel.
