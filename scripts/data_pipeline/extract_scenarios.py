"""Extract attributed event windows 609 and 618 from ESA Mission 2."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd


EVENTS = {609: "RARE_NOMINAL", 618: "ANOMALY"}
SOURCE = "https://doi.org/10.5281/zenodo.12528696"
LICENSE = "CC BY 3.0 IGO"


def find_column(frame: pd.DataFrame, *candidates: str) -> str:
    normalized = {column.lower().replace(" ", "_"): column for column in frame.columns}
    for candidate in candidates:
        key = candidate.lower().replace(" ", "_")
        if key in normalized:
            return normalized[key]
    raise KeyError(f"Expected one of {candidates}; found {list(frame.columns)}")


def read_channel(path: Path) -> pd.Series:
    value = pd.read_pickle(path)
    if isinstance(value, pd.Series):
        series = value
    elif isinstance(value, pd.DataFrame) and value.shape[1] == 1:
        series = value.iloc[:, 0]
    else:
        raise ValueError(f"Expected a one-column time series in {path}")
    series.index = pd.to_datetime(series.index, utc=True)
    return pd.to_numeric(series, errors="coerce").sort_index()


def event_rows(labels: pd.DataFrame, event_id: int) -> pd.DataFrame:
    id_column = find_column(labels, "id", "anomaly_id", "event_id")
    rows = labels[pd.to_numeric(labels[id_column], errors="coerce") == event_id]
    if rows.empty:
        raise ValueError(f"Event {event_id} was not found in labels.csv")
    return rows


def channel_metadata(mission_dir: Path) -> dict[str, dict[str, Any]]:
    path = mission_dir / "channels.csv"
    if not path.exists():
        return {}
    frame = pd.read_csv(path)
    name_column = find_column(frame, "channel", "channel_name", "name")
    return {
        str(row[name_column]): {
            str(column): None if pd.isna(row[column]) else row[column]
            for column in frame.columns
        }
        for _, row in frame.iterrows()
    }


def extract_event(
    mission_dir: Path,
    labels: pd.DataFrame,
    event_id: int,
    output_dir: Path,
    padding: pd.Timedelta,
    max_channels: int,
) -> None:
    rows = event_rows(labels, event_id)
    channel_column = find_column(rows, "channel", "channel_name")
    start_column = find_column(rows, "start", "start_time", "start_timestamp")
    end_column = find_column(rows, "end", "end_time", "end_timestamp")
    start = pd.to_datetime(rows[start_column], utc=True).min()
    end = pd.to_datetime(rows[end_column], utc=True).max()
    selected_names = list(dict.fromkeys(rows[channel_column].astype(str)))[:max_channels]
    metadata = channel_metadata(mission_dir)
    series: list[pd.Series] = []
    for name in selected_names:
        candidates = list((mission_dir / "channels").glob(f"{name}.*"))
        if not candidates:
            raise FileNotFoundError(f"No telemetry file found for channel {name}")
        values = read_channel(candidates[0]).loc[start - padding : end + padding]
        series.append(values.rename(name))

    telemetry = pd.concat(series, axis=1).sort_index().interpolate(limit_direction="both")
    telemetry = telemetry.dropna(how="any")
    if telemetry.empty:
        raise ValueError(f"Event {event_id} produced no aligned telemetry samples")
    origin = telemetry.index[0]
    samples = [
        {
            "timestamp": int((timestamp - origin).total_seconds()),
            "sourceTimestamp": timestamp.isoformat(),
            "values": {name: float(value) for name, value in row.items()},
            "eventActive": bool(start <= timestamp <= end),
        }
        for timestamp, row in telemetry.iterrows()
    ]
    payload = {
        "schemaVersion": 1,
        "eventId": event_id,
        "classification": EVENTS[event_id],
        "source": SOURCE,
        "license": LICENSE,
        "attribution": "European Space Agency Anomaly Dataset",
        "extractedWindow": {
            "start": (start - padding).isoformat(),
            "eventStart": start.isoformat(),
            "eventEnd": end.isoformat(),
            "end": (end + padding).isoformat(),
        },
        "channels": [
            {"id": name, "metadata": metadata.get(name, {})} for name in selected_names
        ],
        "telemetry": samples,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / f"esa-m2-{event_id}.json"
    destination.write_text(json.dumps(payload, indent=2, default=str) + "\n", "utf-8")
    print(f"Wrote {destination} ({len(samples)} samples, {len(selected_names)} channels)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mission_dir", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("data/work/scenarios"))
    parser.add_argument("--padding-minutes", type=int, default=30)
    parser.add_argument("--max-channels", type=int, default=4)
    args = parser.parse_args()
    mission_dir = args.mission_dir.resolve()
    labels = pd.read_csv(mission_dir / "labels.csv")
    for event_id in EVENTS:
        extract_event(
            mission_dir,
            labels,
            event_id,
            args.output_dir.resolve(),
            pd.Timedelta(minutes=args.padding_minutes),
            args.max_channels,
        )


if __name__ == "__main__":
    main()
