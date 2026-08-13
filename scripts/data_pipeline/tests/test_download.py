from __future__ import annotations

import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.data_pipeline.download_esa_mission2 import (
    _byte_ranges,
    _safe_destination,
    md5sum,
    safe_extract,
)


class DownloadSafetyTests(unittest.TestCase):
    def test_byte_ranges_cover_file_exactly(self) -> None:
        ranges = _byte_ranges(17, 4)
        self.assertEqual(ranges[0][0], 0)
        self.assertEqual(ranges[-1][1], 16)
        self.assertEqual(sum(end - start + 1 for start, end in ranges), 17)
        self.assertTrue(
            all(previous[1] + 1 == current[0] for previous, current in zip(ranges, ranges[1:]))
        )

    def test_byte_ranges_reject_invalid_inputs(self) -> None:
        with self.assertRaisesRegex(ValueError, "total_size"):
            _byte_ranges(0, 4)
        with self.assertRaisesRegex(ValueError, "workers"):
            _byte_ranges(10, 0)

    def test_md5sum_matches_known_content(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.bin"
            path.write_bytes(b"FlightSentry")
            expected = hashlib.md5(b"FlightSentry", usedforsecurity=False).hexdigest()
            self.assertEqual(md5sum(path), expected)

    def test_safe_destination_rejects_parent_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "escapes extraction root"):
                _safe_destination(Path(directory), "../outside.txt")

    def test_safe_extract_accepts_nested_member(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "safe.zip"
            destination = root / "out"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("mission/channels.csv", "channel,unit\n1,V\n")
            safe_extract(archive, destination)
            self.assertTrue((destination / "mission" / "channels.csv").exists())


if __name__ == "__main__":
    unittest.main()
