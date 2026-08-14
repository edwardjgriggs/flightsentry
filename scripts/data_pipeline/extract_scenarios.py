"""Extract attributed event windows 609 and 618 from ESA Mission 2."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

import pandas as pd


EVENTS = {609: "RARE_NOMINAL", 618: "ANOMALY"}
SOURCE = "https://doi.org/10.5281/zenodo.12528696"
LICENSE = "CC BY 3.0 IGO"
PAPER_CHANNEL_PRIORITY = ("channel_18", "channel_20")


def find_column(frame: pd.DataFrame, *candidates: str) -> str:
    def normalize(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", value.lower())

    normalized = {normalize(str(column)): column for column in frame.columns}
    for candidate in candidates:
        key = normalize(candidate)
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


def normalized_event_id(value: object) -> int | None:
    match = re.search(r"(\d+)$", str(value))
    return int(match.group(1)) if match else None


def event_rows(labels: pd.DataFrame, event_id: int) -> pd.DataFrame:
    id_column = find_column(labels, "id", "anomaly_id", "event_id")
    rows = labels[labels[id_column].map(normalized_event_id) == event_id]
    if rows.empty:
        raise ValueError(f"Event {event_id} was not found in labels.csv")
    return rows


def resolve_mission_dir(path: Path) -> Path:
    """Accept either the extracted container or the nested dataset directory."""
    path = path.resolve()
    if (path / "labels.csv").exists():
        return path
    candidates = [child for child in path.iterdir() if (child / "labels.csv").exists()]
    if len(candidates) == 1:
        return candidates[0]
    raise FileNotFoundError(
        f"Could not locate labels.csv in {path} or one immediate child directory."
    )


def select_shared_channels(
    labels: pd.DataFrame, event_ids: tuple[int, ...], max_channels: int
) -> list[str]:
    if max_channels < 1:
        raise ValueError("max_channels must be positive")
    channel_sets: list[set[str]] = []
    for event_id in event_ids:
        rows = event_rows(labels, event_id)
        channel_column = find_column(rows, "channel", "channel_name")
        channel_sets.append(set(rows[channel_column].astype(str)))
    shared = set.intersection(*channel_sets)
    if not shared:
        raise ValueError(f"Events {event_ids} have no shared telemetry channels")

    def channel_key(name: str) -> tuple[int, str]:
        match = re.search(r"(\d+)$", name)
        return (int(match.group(1)) if match else sys.maxsize, name)

    prioritized = [name for name in PAPER_CHANNEL_PRIORITY if name in shared]
    remainder = sorted(shared.difference(prioritized), key=channel_key)
    return (prioritized + remainder)[:max_channels]


def event_interval(labels: pd.DataFrame, event_id: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    rows = event_rows(labels, event_id)
    start_column = find_column(rows, "start", "start_time", "start_timestamp")
    end_column = find_column(rows, "end", "end_time", "end_timestamp")
    return (
        pd.to_datetime(rows[start_column], utc=True).min(),
        pd.to_datetime(rows[end_column], utc=True).max(),
    )


def scenario_windows(
    labels: pd.DataFrame, event_ids: tuple[int, ...], padding: pd.Timedelta
) -> dict[int, tuple[pd.Timestamp, pd.Timestamp]]:
    """Build padded, non-overlapping windows for adjacent paired events."""
    intervals = {event_id: event_interval(labels, event_id) for event_id in event_ids}
    ordered = sorted(event_ids, key=lambda event_id: intervals[event_id][0])
    windows = {
        event_id: [intervals[event_id][0] - padding, intervals[event_id][1] + padding]
        for event_id in ordered
    }
    for previous_id, next_id in zip(ordered, ordered[1:]):
        previous_end = intervals[previous_id][1]
        next_start = intervals[next_id][0]
        if previous_end >= next_start:
            raise ValueError(
                f"Target event intervals overlap: {previous_id} ends after {next_id} starts"
            )
        midpoint = previous_end + (next_start - previous_end) / 2
        windows[previous_id][1] = min(windows[previous_id][1], midpoint)
        windows[next_id][0] = max(windows[next_id][0], midpoint)
    return {event_id: (bounds[0], bounds[1]) for event_id, bounds in windows.items()}


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


def operational_context(
    mission_dir: Path, start: pd.Timestamp, end: pd.Timestamp
) -> dict[str, list[dict[str, Any]]]:
    telecommands: list[dict[str, Any]] = []
    catalog = pd.read_csv(mission_dir / "telecommands.csv")
    name_column = find_column(catalog, "telecommand", "name")
    priority_column = find_column(catalog, "priority")
    for _, row in catalog[pd.to_numeric(catalog[priority_column], errors="coerce") >= 3].iterrows():
        name = str(row[name_column])
        candidates = list((mission_dir / "telecommands").glob(f"{name}.*"))
        if not candidates:
            continue
        values = read_channel(candidates[0]).loc[start:end]
        timestamps = [timestamp.isoformat() for timestamp in values.index[values.notna()]]
        if timestamps:
            telecommands.append(
                {"id": name, "priority": int(row[priority_column]), "timestamps": timestamps}
            )

    operational_events: list[dict[str, str]] = []
    events_path = mission_dir / "events.csv"
    if events_path.exists():
        events = pd.read_csv(events_path)
        name_column = find_column(events, "event", "name")
        start_column = find_column(events, "start_time", "start")
        end_column = find_column(events, "end_time", "end")
        event_starts = pd.to_datetime(events[start_column], utc=True)
        event_ends = pd.to_datetime(events[end_column], utc=True)
        for index in events.index[(event_starts <= end) & (event_ends >= start)]:
            operational_events.append(
                {
                    "id": str(events.loc[index, name_column]),
                    "start": event_starts[index].isoformat(),
                    "end": event_ends[index].isoformat(),
                }
            )
    return {"telecommands": telecommands, "operationalEvents": operational_events}


def extract_event(
    mission_dir: Path,
    labels: pd.DataFrame,
    event_id: int,
    output_dir: Path,
    selected_names: list[str],
    window: tuple[pd.Timestamp, pd.Timestamp],
) -> Path:
    rows = event_rows(labels, event_id)
    start_column = find_column(rows, "start", "start_time", "start_timestamp")
    end_column = find_column(rows, "end", "end_time", "end_timestamp")
    start = pd.to_datetime(rows[start_column], utc=True).min()
    end = pd.to_datetime(rows[end_column], utc=True).max()
    window_start, window_end = window
    metadata = channel_metadata(mission_dir)
    series: list[pd.Series] = []
    for name in selected_names:
        candidates = list((mission_dir / "channels").glob(f"{name}.*"))
        if not candidates:
            raise FileNotFoundError(f"No telemetry file found for channel {name}")
        values = read_channel(candidates[0]).loc[window_start:window_end]
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
            "start": window_start.isoformat(),
            "eventStart": start.isoformat(),
            "eventEnd": end.isoformat(),
            "end": window_end.isoformat(),
        },
        "perChannelIntervals": [
            {
                "channelId": str(row[find_column(rows, "channel", "channel_name")]),
                "start": pd.to_datetime(row[start_column], utc=True).isoformat(),
                "end": pd.to_datetime(row[end_column], utc=True).isoformat(),
            }
            for _, row in rows.iterrows()
        ],
        "channels": [
            {"id": name, "metadata": metadata.get(name, {})} for name in selected_names
        ],
        "operationalContext": operational_context(mission_dir, start, end),
        "telemetry": samples,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / f"esa-m2-{event_id}.json"
    destination.write_text(json.dumps(payload, indent=2, default=str) + "\n", "utf-8")
    print(f"Wrote {destination} ({len(samples)} samples, {len(selected_names)} channels)")
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mission_dir", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("data/work/scenarios"))
    parser.add_argument("--padding-minutes", type=int, default=30)
    parser.add_argument("--max-channels", type=int, default=4)
    parser.add_argument(
        "--publish-dir",
        type=Path,
        help="Optional directory for attributed scenario packs safe to publish with the project.",
    )
    args = parser.parse_args()
    mission_dir = resolve_mission_dir(args.mission_dir)
    labels = pd.read_csv(mission_dir / "labels.csv")
    event_ids = tuple(EVENTS)
    selected_names = select_shared_channels(labels, event_ids, args.max_channels)
    windows = scenario_windows(labels, event_ids, pd.Timedelta(minutes=args.padding_minutes))
    print(f"Using shared channels: {', '.join(selected_names)}")
    for event_id in event_ids:
        destination = extract_event(
            mission_dir,
            labels,
            event_id,
            args.output_dir.resolve(),
            selected_names,
            windows[event_id],
        )
        if args.publish_dir:
            publish_dir = args.publish_dir.resolve()
            publish_dir.mkdir(parents=True, exist_ok=True)
            published = publish_dir / destination.name
            shutil.copy2(destination, published)
            print(f"Published attributed extract to {published}")


if __name__ == "__main__":
    main()
