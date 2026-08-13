"""Download, verify, and optionally extract the ESA Mission 2 archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
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


def download(url: str, destination: Path) -> None:
    partial = destination.with_suffix(destination.suffix + ".partial")
    request = urllib.request.Request(url, headers={"User-Agent": "FlightSentry/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as out:
        total = int(response.headers.get("Content-Length", "0"))
        copied = 0
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
            copied += len(chunk)
            if total:
                print(f"\rDownloaded {copied / total:6.1%}", end="", flush=True)
    print()
    partial.replace(destination)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("data/raw"))
    parser.add_argument("--extract", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / ARCHIVE_NAME

    if archive.exists() and not args.force:
        print(f"Using existing {archive}")
    else:
        if archive.exists():
            archive.unlink()
        download(resolve_download_url(), archive)

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
