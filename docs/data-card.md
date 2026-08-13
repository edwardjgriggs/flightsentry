# Data card

## Source

- Dataset: European Space Agency Anomaly Dataset
- Record: https://doi.org/10.5281/zenodo.12528696
- License: CC BY 3.0 IGO
- Target archive: `ESA-Mission2.zip`
- Published checksum: `0b7505b7f0731ca037ee889ca2a520ce` (MD5)

## Project use

FlightSentry focuses on Mission 2 event 609, a commanded rare nominal event, and event 618, a non-commanded anomaly. The ESA paper notes their similar telemetry behavior and different command context.

The browser replay ships with a deterministic, four-channel demonstration fixture modeled on that contrast. It is not raw ESA telemetry. The repository also publishes two small, attributed Mission 2 extracts under `public/data/source-evaluation/` so reviewers can inspect the source evidence without downloading the archive.

## Processing

1. Download from the Zenodo record and verify checksum.
2. Validate every ZIP destination before extraction.
3. Read `labels.csv`, channel metadata, and affected channel files.
4. Select four shared channels, prioritizing channels 18 and 20 highlighted in the paper.
5. Extract padded, non-overlapping windows around adjacent events 618 and 609.
6. Preserve source timestamps, per-channel intervals, attribution, classification, and anonymized metadata.
7. Correlate priority-3 telecommands and overlapping records from `events.csv`.
8. Keep the raw archive and working data outside Git; publish only attributed extracts and hashes.

## Verified paired context

| Event | Source category | Priority-3 telecommand | Overlapping event record |
| --- | --- | --- | --- |
| 609 | Rare Event | `telecommand_6` at onset | `event_14` |
| 618 | Anomaly | None | None |

This establishes temporal context, not physical causation. The dataset identifiers are anonymized, so FlightSentry does not assign unsupported command or subsystem names.

The bundled interactive replay separately asserts that its command-history and mission-plan slices are complete. That assertion makes missing context meaningful inside the challenge fixture. It is not derived from the ESA archive and is labeled `REPLAY ASSERTION` in the interface and exports.

## Limitations

- The bundled fixture cannot support claims about operational accuracy.
- A two-event replay is a product demonstration, not a statistically meaningful benchmark.
- Channel identifiers and mission context may be anonymized or incomplete.
- Event correlation does not establish physical causation.
- Command acknowledgement, subsystem mapping, and live-feed completeness are not available in the anonymized source.
