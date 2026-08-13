from __future__ import annotations

import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.data_pipeline.download_esa_mission2 import _safe_destination, md5sum, safe_extract


class DownloadSafetyTests(unittest.TestCase):
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
