from __future__ import annotations

import unittest

import pandas as pd

from scripts.data_pipeline.extract_scenarios import (
    event_rows,
    find_column,
    scenario_windows,
    select_shared_channels,
)


class ExtractScenarioTests(unittest.TestCase):
    def test_find_column_accepts_official_esa_names(self) -> None:
        frame = pd.DataFrame(columns=["ID", "Channel", "StartTime", "EndTime"])
        self.assertEqual(find_column(frame, "event_id", "id"), "ID")
        self.assertEqual(find_column(frame, "channel_name", "channel"), "Channel")
        self.assertEqual(find_column(frame, "start_time"), "StartTime")
        self.assertEqual(find_column(frame, "end_timestamp", "end_time"), "EndTime")

    def test_find_column_rejects_missing_field(self) -> None:
        frame = pd.DataFrame(columns=["ID", "Channel"])
        with self.assertRaisesRegex(KeyError, "Expected one of"):
            find_column(frame, "StartTime")

    def test_event_rows_accepts_prefixed_official_ids(self) -> None:
        frame = pd.DataFrame(
            {
                "ID": ["id_609", "id_618"],
                "Channel": ["channel_18", "channel_20"],
            }
        )
        self.assertEqual(event_rows(frame, 609).iloc[0]["Channel"], "channel_18")

    def test_shared_channels_prioritize_paper_channels(self) -> None:
        frame = pd.DataFrame(
            {
                "ID": ["id_609"] * 4 + ["id_618"] * 4,
                "Channel": [
                    "channel_9",
                    "channel_18",
                    "channel_20",
                    "channel_13",
                    "channel_9",
                    "channel_18",
                    "channel_20",
                    "channel_14",
                ],
            }
        )
        self.assertEqual(
            select_shared_channels(frame, (609, 618), 3),
            ["channel_18", "channel_20", "channel_9"],
        )

    def test_shared_channels_handle_names_without_numeric_suffix(self) -> None:
        # Regression: channel_key referenced sys.maxsize without importing sys,
        # which raised NameError for any shared channel name not ending in digits.
        frame = pd.DataFrame(
            {
                "ID": ["id_609"] * 3 + ["id_618"] * 3,
                "Channel": [
                    "bus_voltage",
                    "channel_18",
                    "channel_2",
                    "bus_voltage",
                    "channel_18",
                    "channel_2",
                ],
            }
        )
        self.assertEqual(
            select_shared_channels(frame, (609, 618), 3),
            ["channel_18", "channel_2", "bus_voltage"],
        )

    def test_adjacent_event_windows_do_not_overlap(self) -> None:
        frame = pd.DataFrame(
            {
                "ID": ["id_618", "id_609"],
                "Channel": ["channel_18", "channel_18"],
                "StartTime": ["2000-01-01T00:10:00Z", "2000-01-01T00:21:00Z"],
                "EndTime": ["2000-01-01T00:20:00Z", "2000-01-01T00:30:00Z"],
            }
        )
        windows = scenario_windows(frame, (609, 618), pd.Timedelta(minutes=30))
        self.assertEqual(windows[618][1], windows[609][0])
        self.assertEqual(windows[618][1], pd.Timestamp("2000-01-01T00:20:30Z"))


if __name__ == "__main__":
    unittest.main()
