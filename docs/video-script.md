# Three-minute demo script

## 0:00-0:20 Problem

“Spacecraft telemetry is full of unusual behavior. The hard problem is not only detecting change. It is knowing whether that change is a fault or an expected operation. FlightSentry brings incident-response discipline to spacecraft operations.”

Show the mission console and the two mirrored cases.

## 0:20-2:00 Paired replay and operator workflow

Start **Run paired incident replay**.

“Both cases look similar. MAD, Isolation Forest, and an ONNX autoencoder independently detect the multichannel shift. FlightSentry waits for three of five windows, reducing single-sample noise.”

Pause the replay and select **Jump alert**.

“At T plus 52, both cases cross the same persistent alert boundary. I can scrub or step through the replay without changing the detector result, so an operator can inspect exactly what the system knew at any point.”

Resume the replay.

At context reveal:

“Event 609 overlaps a recorded priority-three telecommand and an operational event. Event 618 has no matching command or event context.”

At decision comparison:

“With telemetry alone, both alerts require investigation. When I enable trusted context, 609 becomes monitor while 618 stays investigate. FlightSentry shows every check behind that decision.”

Show the **Causal decision trace**.

“The paired telemetry has 98 percent normalized shape correlation, and all three detectors flag both cases. The paths diverge only when trusted evidence arrives: command and plan records pass every gate for 609, while 618 fails closed. This trace recalculates as I change the evidence.”

Remove the event 609 command record, then restore it.

“If I remove either trusted record, 609 immediately returns to investigate. That recalculation is deterministic and does not ask Granite. The model explains the evidence, but it does not control the decision.”

At incident briefs:

“Granite receives evidence IDs, not an open-ended prompt. It exposes uncertainty and suggests low-risk diagnostic checks. It cannot command the spacecraft.”

Show the **Subsystem impact analysis** for event 609.

“FlightSentry also calculates what each subsystem actually experienced: signed peak change, peak time, and measured recovery. It does not invent a cross-unit severity score or claim a root cause.”

In the event 609 runbook, mark checks 1 and 2 **Verified**. Mark check 3 **Concern**, enter `Attitude recovery needs an extended observation window`, then show the checkpoint.

“Granite's suggestions become tracked operator work, not disposable prose. Pending checks block signoff. This concern automatically removes monitor as a valid closeout and raises the minimum accountable outcome to investigate.”

Enter `Recovery confirmation pending` as the decision rationale and record the operator decision.

“The operator remains accountable. FlightSentry allows the recommendation or a higher-severity outcome, never an unsafe downgrade through a failed gate. The signed checkpoint is included in the versioned decision record.”

## 2:00-2:35 Technical proof

Open **Technical proof**.

“Detection runs numerically in the browser. The autoencoder is an ONNX artifact. Granite runs server-side through watsonx.ai. Unknown citations fail validation, ambiguous cases become investigate, and a validated reference brief keeps the demo available during an outage.”

Show the context-effectiveness metrics, calibration record, source evaluation, and attribution.

## 2:35-2:50 Impact

“The practical value is faster, more explainable triage for resource-constrained mission teams. FlightSentry prevented one unnecessary investigation without losing the real anomaly, shows exactly why, and preserves the human decision for review.”

## 2:50-3:00 IBM Bob evidence

Show the completed IBM Bob build log and one Bob session screenshot.

“IBM Bob was the primary development tool used to review, test, and iterate FlightSentry’s detector, safety, and accessibility workflows.”

Only use that final sentence after the build log contains real evidence.
