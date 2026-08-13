"""Download, verify, and optionally extract the ESA Mission 2 archive."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import shutil
import sys
import threading
import urllib.request
import zipfile
from pathlib import Path


RECORD_API = "https://zenodo.org/api/records/12528696"
ARCHIVE_NAME = "ESA-Mission2.zip"
EXPECTED_MD5 = "0b7505b7f0731ca037ee889ca2a520ce"


def md5sum(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_archive(path: Path) -> None:
    actual = md5sum(path)
    if actual.lower() != EXPECTED_MD5:
        raise ValueError(
            f"Checksum mismatch for {path.name}: expected {EXPECTED_MD5}, got {actual}."
        )


def _safe_destination(root: Path, member_name: str) -> Path:
    root = root.resolve()
    destination = (root / member_name).resolve()
    try:
        destination.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Archive member escapes extraction root: {member_name}") from error
    return destination


def safe_extract(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            _safe_destination(destination, member.filename)
        bundle.extractall(destination)


def resolve_download_url() -> str:
    with urllib.request.urlopen(RECORD_API, timeout=30) as response:
        record = json.load(response)
    for file_record in record.get("files", []):
        if file_record.get("key") == ARCHIVE_NAME:
            links = file_record.get("links", {})
            url = links.get("content") or links.get("self")
            if url:
                return str(url)
    raise RuntimeError(f"{ARCHIVE_NAME} was not found in Zenodo record 12528696.")


def _byte_ranges(total_size: int, workers: int) -> list[tuple[int, int]]:
    if total_size < 1:
        raise ValueError("total_size must be positive")
    if workers < 1:
        raise ValueError("workers must be positive")
    worker_count = min(total_size, workers)
    return [
        (
            index * total_size // worker_count,
            ((index + 1) * total_size // worker_count) - 1,
        )
        for index in range(worker_count)
    ]


def download(url: str, destination: Path, total_size: int, workers: int = 4) -> None:
    """Download a large archive using resumable HTTP byte ranges."""
    ranges = _byte_ranges(total_size, workers)
    progress_lock = threading.Lock()
    part_paths = [
        destination.with_suffix(destination.suffix + f".part{index:02d}")
        for index in range(len(ranges))
    ]
    progress = [0] * len(ranges)

    def fetch_part(index: int) -> None:
        start, end = ranges[index]
        part_path = part_paths[index]
        expected_size = end - start + 1
        existing_size = part_path.stat().st_size if part_path.exists() else 0
        if existing_size > expected_size:
            part_path.unlink()
            existing_size = 0
        progress[index] = existing_size
        if existing_size == expected_size:
            return

        request_start = start + existing_size
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "FlightSentry/1.0",
                "Range": f"bytes={request_start}-{end}",
            },
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            if response.status != 206:
                raise RuntimeError(
                    f"Server did not honor byte range {request_start}-{end}: HTTP {response.status}"
                )
            mode = "ab" if existing_size else "wb"
            with part_path.open(mode) as out:
                while chunk := response.read(4 * 1024 * 1024):
                    out.write(chunk)
                    with progress_lock:
                        progress[index] += len(chunk)
                        downloaded = sum(progress)
                        print(
                            f"\rDownloaded {downloaded / total_size:6.1%}",
                            end="",
                            flush=True,
                        )

        if part_path.stat().st_size != expected_size:
            raise RuntimeError(
                f"Incomplete range {start}-{end}: expected {expected_size} bytes, "
                f"got {part_path.stat().st_size}."
            )

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(ranges)) as executor:
        futures = [executor.submit(fetch_part, index) for index in range(len(ranges))]
        for future in concurrent.futures.as_completed(futures):
            future.result()
    print()

    partial = destination.with_suffix(destination.suffix + ".partial")
    with partial.open("wb") as out:
        for part_path in part_paths:
            with part_path.open("rb") as part:
                shutil.copyfileobj(part, out, length=4 * 1024 * 1024)
    if partial.stat().st_size != total_size:
        raise RuntimeError(
            f"Combined archive has {partial.stat().st_size} bytes; expected {total_size}."
        )
    partial.replace(destination)
    for part_path in part_paths:
        part_path.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--extract", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Parallel resumable download ranges (default: 4).",
    )
    args = parser.parse_args()

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / ARCHIVE_NAME

    if archive.exists() and not args.force:
        print(f"Using existing {archive}")
    else:
        if archive.exists():
            archive.unlink()
        download(resolve_download_url(), archive, 4_098_539_912, args.workers)

    verify_archive(archive)
    print(f"Verified MD5 {EXPECTED_MD5}")
    if args.extract:
        target = output_dir / "ESA-Mission2"
        if target.exists() and any(target.iterdir()):
            print(f"Extraction target already populated: {target}")
            sys.exit(0)
        safe_extract(archive, target)
        print(f"Extracted to {target}")


if __name__ == "__main__":
    main()
