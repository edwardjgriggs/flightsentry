# Source-data evaluation

## Outcome

FlightSentry completed the real ESA Mission 2 extraction and training path on August 13, 2026. The staged candidate detects both paired events, but it does not outperform Rolling MAD on the held-out anomaly. The production browser therefore remains on the validated `bundled-demo-v1` profile.

These are FlightSentry project results, not official ESA-ADB leaderboard metrics.

## Provenance

| Item | Verified value |
| --- | --- |
| Dataset | ESA Anomaly Dataset, Mission 2 |
| Zenodo record | `12528696` |
| License | CC BY 3.0 IGO |
| Archive | `ESA-Mission2.zip`, 4,098,539,912 bytes |
| Archive MD5 | `0b7505b7f0731ca037ee889ca2a520ce` |
| Shared channels | `channel_18`, `channel_20`, `channel_9`, `channel_13` |
| Extract samples | 686 for event 609; 288 for event 618 |
| Candidate model | Nonlinear MLPRegressor 4-8-2-8-4, exported to ONNX |
| ONNX validation | `onnx.checker.check_model`: PASS |

Published extracts:

- [`esa-m2-609.json`](../public/data/source-evaluation/esa-m2-609.json) — SHA-256 `d9a4eb12dccdde4b95a7689b5d78a919c36b76280c0e2af29cdb2bacccbea059`
- [`esa-m2-618.json`](../public/data/source-evaluation/esa-m2-618.json) — SHA-256 `67f922b8d320e6078e14244abcf0c5e79f9d50db95e3f5a9568df5091021ca58`

## Operational-context check

Event 609 is categorized as `Rare Event`. Its interval contains priority-3 `telecommand_6` at `2000-04-16T09:18:31.636Z` and overlapping `event_14` from `09:18:52.335Z` to `11:03:52.335Z`.

Event 618 is categorized as `Anomaly`. Its interval contains no priority-3 telecommand and no overlapping record from `events.csv`.

This verifies the anonymized temporal context used by the demo. It does not identify the physical command or prove that the command caused every channel response.

## Evaluation design

- Fit the Isolation Forest, scaler, and nonlinear autoencoder on 87 nominal samples from the event-609 replay window.
- Calibrate detector score distributions on 38 separate nominal samples from that window.
- Select ensemble weights on event 609 using event-level F1, then false-alert episodes and detection delay as tie-breakers.
- Hold event 618 out of model fitting, score calibration, and weight selection.
- Reset three-of-five persistence at each scenario boundary.

The selected candidate weights were `0.60 MAD / 0.00 Isolation Forest / 0.40 autoencoder`, with threshold `0.78` and three-of-five persistence.

## Results

| Evaluation | Detected | Event precision | Event recall | Event F1 | False-alert episodes | False alerts/hour | Detection delay |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Validation event 609 | Yes | 1.00 | 1.00 | 1.00 | 0 | 0.0000 | 54 s |
| Held-out event 618 | Yes | 0.33 | 1.00 | 0.50 | 2 | 1.6736 | 198 s |
| Paired total | 2/2 | 0.50 | 1.00 | 0.67 | 2 | 0.4938 | 126 s mean |

Held-out event-618 ablation:

| Method | Detected | Event F1 | False-alert episodes | Detection delay |
| --- | ---: | ---: | ---: | ---: |
| Rolling MAD | Yes | 0.67 | 1 | 198 s |
| Isolation Forest | No | 0.00 | 0 | — |
| Autoencoder | Yes | 0.22 | 7 | 0 s |
| Weighted ensemble | Yes | 0.50 | 2 | 198 s |

Event precision treats each detected labeled event as a true positive and each alert episode outside a labeled interval as a false positive. False alerts/hour uses the total paired replay duration. This is a FlightSentry project metric definition, not the ESA-ADB evaluation framework.

## Deployment decision

**RETAIN_BUNDLED_DEMO.** The source candidate proves the real data path and detects both events, but it underperforms the transparent MAD baseline on the single held-out event and has not passed browser inference parity. It remains under ignored `artifacts/training/source-v1/` for further calibration.

Promotion is explicit:

```powershell
python -m scripts.data_pipeline.train_ensemble `
  --promote-web `
  --web-model public\models\flightsentry-autoencoder.onnx `
  --web-config public\models\detector-config.json
```

Do not run the promotion command until the candidate beats the baseline, browser parity passes, and the paired replay remains correct.
