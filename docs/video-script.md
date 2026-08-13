# Three-minute demo script

## 0:00–0:20 — Problem

“Spacecraft telemetry is full of unusual behavior. The hard problem is not only detecting change—it is knowing whether that change is a fault or an expected operation. FlightSentry brings incident-response discipline to spacecraft operations.”

Show the mission console and the two mirrored cases.

## 0:20–1:40 — Paired replay

Start **Run paired incident replay**.

“Both cases look similar. MAD, Isolation Forest, and an ONNX autoencoder independently detect the multichannel shift. FlightSentry waits for three of five windows, reducing single-sample noise.”

At context reveal:

“Event 609 overlaps an accepted telecommand and planned calibration. Event 618 has no trusted operational explanation.”

At incident briefs:

“Granite receives evidence IDs, not an open-ended prompt. It recommends monitoring 609 and escalating 618, exposes uncertainty, and suggests diagnostic checks. It cannot command the spacecraft.”

Reveal expert annotations.

## 1:40–2:25 — Technical proof

Open **Technical proof**.

“Detection runs numerically in the browser. The autoencoder is an ONNX artifact. Granite runs server-side through watsonx.ai. Unknown citations fail validation, ambiguous cases become investigate, and a validated reference brief keeps the demo available during an outage.”

Show the calibration record, ablation table, and attribution.

## 2:25–2:50 — Impact

“The practical value is faster, more explainable triage for resource-constrained mission teams. The same pattern applies to satellites, rovers, and remote autonomous systems where context changes the meaning of an alert.”

## 2:50–3:00 — IBM Bob evidence

Show the completed IBM Bob build log and one Bob session screenshot.

“IBM Bob was the primary development tool used to review, test, and iterate FlightSentry’s detector, safety, and accessibility workflows.”

Only use that final sentence after the build log contains real evidence.
