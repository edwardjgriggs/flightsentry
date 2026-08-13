# Three-minute demo script

## 0:00–0:20 — Problem

“Spacecraft telemetry is full of unusual behavior. The hard problem is not only detecting change—it is knowing whether that change is a fault or an expected operation. FlightSentry brings incident-response discipline to spacecraft operations.”

Show the mission console and the two mirrored cases.

## 0:20–1:40 — Paired replay

Start **Run paired incident replay**.

“Both cases look similar. MAD, Isolation Forest, and an ONNX autoencoder independently detect the multichannel shift. FlightSentry waits for three of five windows, reducing single-sample noise.”

At context reveal:

“Event 609 overlaps a recorded priority-three telecommand and an operational event. Event 618 has no matching command or event context.”

At decision comparison:

“With telemetry alone, both alerts require investigation. When I enable trusted context, 609 becomes monitor while 618 stays investigate. FlightSentry shows every check behind that decision.”

Remove the event 609 command record, then restore it.

“If I remove either trusted record, 609 immediately returns to investigate. That recalculation is deterministic and does not ask Granite. The model explains the evidence, but it does not control the decision.”

At incident briefs:

“Granite receives evidence IDs, not an open-ended prompt. It exposes uncertainty and suggests low-risk diagnostic checks. It cannot command the spacecraft.”

Reveal expert annotations.

## 1:40–2:25 — Technical proof

Open **Technical proof**.

“Detection runs numerically in the browser. The autoencoder is an ONNX artifact. Granite runs server-side through watsonx.ai. Unknown citations fail validation, ambiguous cases become investigate, and a validated reference brief keeps the demo available during an outage.”

Show the context-effectiveness metrics, calibration record, source evaluation, and attribution.

## 2:25–2:50 — Impact

“The practical value is faster, more explainable triage for resource-constrained mission teams. FlightSentry prevented one unnecessary investigation without losing the real anomaly, and every decision can be exported for review.”

## 2:50–3:00 — IBM Bob evidence

Show the completed IBM Bob build log and one Bob session screenshot.

“IBM Bob was the primary development tool used to review, test, and iterate FlightSentry’s detector, safety, and accessibility workflows.”

Only use that final sentence after the build log contains real evidence.
