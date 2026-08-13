# Data card

## Source

- Dataset: European Space Agency Anomaly Dataset
- Record: https://doi.org/10.5281/zenodo.12528696
- License: CC BY 3.0 IGO
- Target archive: `ESA-Mission2.zip`
- Published checksum: `0b7505b7f0731ca037ee889ca2a520ce` (MD5)

## Project use

FlightSentry focuses on Mission 2 event 609, a commanded rare nominal event, and event 618, a non-commanded anomaly. The ESA paper notes their similar telemetry behavior and different command context.

The repository ships with a deterministic, four-channel demonstration fixture modeled on that contrast. It is not raw ESA telemetry. This keeps the public prototype small and reviewable while the pipeline supplies a reproducible path to source-derived scenario packs.

## Processing

1. Download from the Zenodo record and verify checksum.
2. Validate every ZIP destination before extraction.
3. Read `labels.csv`, channel metadata, and affected channel files.
4. Extract padded windows around events 609 and 618.
5. Preserve source timestamps, attribution, event classification, and channel metadata.
6. Keep raw archives and working data outside Git.

## Limitations

- The bundled fixture cannot support claims about operational accuracy.
- A two-event replay is a product demonstration, not a statistically meaningful benchmark.
- Channel identifiers and mission context may be anonymized or incomplete.
- Event correlation does not establish physical causation.
