"""Download public sources; keep raw files untracked. TLS verification stays enabled."""

import argparse
import hashlib
import io
import json
import urllib.request
import zipfile
from pathlib import Path

DATASET = "KameronB/synthetic-it-callcenter-tickets"
FILE = "synthetic-it-call-center-tickets.csv"


def fetch_tickets() -> None:
    manifest = Path("data/tickets-provenance.json")
    if manifest.exists():
        metadata = json.loads(manifest.read_text())
    else:
        with urllib.request.urlopen(
            f"https://huggingface.co/api/datasets/{DATASET}", timeout=60
        ) as r:
            info = json.load(r)
        metadata = {"dataset": DATASET, "revision": info["sha"], "license": "apache-2.0"}
    url = f"https://huggingface.co/datasets/{DATASET}/resolve/{metadata['revision']}/{FILE}"
    with urllib.request.urlopen(url, timeout=120) as response:
        content = response.read()
    checksum = hashlib.sha256(content).hexdigest()
    if metadata.get("sha256") and checksum != metadata["sha256"]:
        raise ValueError("Ticket dataset checksum mismatch")
    raw = Path("data/raw/tickets.csv")
    raw.parent.mkdir(parents=True, exist_ok=True)
    raw.write_bytes(content)
    metadata.update(url=url, sha256=checksum, bytes=len(content))
    manifest.write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"Downloaded {len(content)} bytes; SHA256 {checksum}")


def fetch_uci() -> None:
    url = "https://archive.ics.uci.edu/static/public/498/incident+management+process+enriched+event+log.zip"
    with urllib.request.urlopen(url, timeout=120) as response:
        content = response.read()
    checksum = hashlib.sha256(content).hexdigest()
    manifest = Path("data/uci-provenance.json")
    if manifest.exists() and json.loads(manifest.read_text())["sha256"] != checksum:
        raise ValueError("UCI dataset checksum mismatch")
    raw = Path("data/raw")
    raw.mkdir(parents=True, exist_ok=True)
    (raw / "uci498.zip").write_bytes(content)
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        (raw / "uci498.csv").write_bytes(archive.read("incident_event_log.csv"))
    manifest.write_text(
        json.dumps(
            {
                "dataset": 498,
                "url": url,
                "sha256": checksum,
                "license": "CC BY 4.0",
                "doi": "10.24432/C57S4H",
            },
            indent=2,
        )
        + "\n"
    )
    print(f"Downloaded UCI 498, SHA256 {checksum}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=["tickets", "uci"])
    args = parser.parse_args()
    fetch_tickets() if args.source == "tickets" else fetch_uci()
