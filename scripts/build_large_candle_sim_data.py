#!/usr/bin/env python3
"""Build compact, browser-ready NQ large-candle simulation packages.

The raw Databento trade archives stay local. The generated output contains only
the exact front-contract RTH ticks needed by the selected setup sessions.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import tempfile
import zipfile
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pyarrow as pa


CHICAGO = ZoneInfo("America/Chicago")
SCHEMA_VERSION = 1
WINDOW_SECONDS = 10 * 60


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    workspace_root = repo_root.parent
    setup_root = workspace_root / "data/NASDAQ/setups/large_candle_four_strategy"
    parser = argparse.ArgumentParser()
    parser.add_argument("--trades", type=Path, default=setup_root / "trades.csv")
    parser.add_argument(
        "--archive-2024",
        type=Path,
        default=workspace_root
        / "data/NASDAQ/Trades data/GLBX-20260424-ME6BAB6HCG.zip",
    )
    parser.add_argument(
        "--archive-2025",
        type=Path,
        default=workspace_root
        / "data/NASDAQ/Trades data/GLBX-20260424-HD6QVQL99K.zip",
    )
    parser.add_argument("--output", type=Path, default=setup_root / "published/v1")
    return parser.parse_args()


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def timestamp_ns(value: str) -> int:
    # ISO timestamps are always UTC and may carry nanosecond precision.
    date_part, clock_part = value.rstrip("Z").split("T", 1)
    hhmmss, _, fraction = clock_part.partition(".")
    dt = datetime.fromisoformat(f"{date_part}T{hhmmss}+00:00")
    fraction_ns = int((fraction + "000000000")[:9])
    return int(dt.timestamp()) * 1_000_000_000 + fraction_ns


def session_start_utc(session_date: str) -> datetime:
    local_date = datetime.strptime(session_date, "%Y-%m-%d").date()
    return datetime.combine(local_date, time(8, 30), tzinfo=CHICAGO).astimezone(timezone.utc)


def opaque_id(prefix: str, value: str, length: int = 16) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode()).hexdigest()[:length]}"


def load_events(path: Path) -> tuple[list[dict], dict[tuple[str, str], dict]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    by_key: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        by_key[(row["signal_timestamp_utc"], row["symbol"])].append(row)

    sessions: dict[tuple[str, str], dict] = {}
    events: list[dict] = []

    for (signal_text, symbol), grouped_rows in sorted(by_key.items()):
        representative = grouped_rows[0]
        session_date = representative["session_date"]
        signal = parse_utc(signal_text)
        start = session_start_utc(session_date)
        signal_offset_ns = int((signal - start).total_seconds() * 1_000_000_000)
        end_offset_ns = signal_offset_ns + WINDOW_SECONDS * 1_000_000_000
        session_key = (session_date, symbol)
        session_id = opaque_id("session", f"{session_date}|{symbol}")
        event_id = opaque_id("setup", f"{signal_text}|{symbol}")

        session = sessions.setdefault(
            session_key,
            {
                "id": session_id,
                "date": session_date,
                "symbol": symbol,
                "base_time": int(start.timestamp()),
                "max_end_offset_ns": end_offset_ns,
            },
        )
        session["max_end_offset_ns"] = max(session["max_end_offset_ns"], end_offset_ns)

        events.append(
            {
                "id": event_id,
                "sessionId": session_id,
                "signalOffsetNs": signal_offset_ns,
                "endOffsetNs": end_offset_ns,
            }
        )

    return events, sessions


def archive_for_date(args: argparse.Namespace, session_date: str) -> Path:
    return args.archive_2024 if session_date < "2025-01-28" else args.archive_2025


def write_session_package(
    archive: zipfile.ZipFile,
    member_name: str,
    session: dict,
    output_path: Path,
) -> dict:
    base_ns = session["base_time"] * 1_000_000_000
    max_ns = base_ns + session["max_end_offset_ns"]
    symbol = session["symbol"]
    ticks: list[list[int]] = []
    side_counts = {"B": 0, "A": 0, "N": 0}
    out_of_order = 0
    prior_event_ns: int | None = None

    compressed_member = archive.open(member_name)
    stream = pa.input_stream(compressed_member, compression="zstd")
    text_stream = io.TextIOWrapper(stream, encoding="utf-8", newline="")

    try:
        for row in csv.DictReader(text_stream):
            if row["symbol"] != symbol or row["action"] != "T":
                continue

            event_ns = timestamp_ns(row["ts_event"])
            if event_ns < base_ns:
                continue
            if event_ns >= max_ns:
                break

            if prior_event_ns is not None and event_ns < prior_event_ns:
                out_of_order += 1
            prior_event_ns = event_ns

            side = row["side"]
            side_code = 1 if side == "B" else -1 if side == "A" else 0
            side_counts[side if side in side_counts else "N"] += 1
            ticks.append(
                [
                    event_ns - base_ns,
                    round(float(row["price"]) * 4),
                    int(row["size"]),
                    side_code,
                ]
            )
    finally:
        text_stream.close()

    if not ticks:
        raise RuntimeError(f"No ticks found for {session['date']} {symbol}")

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionId": session["id"],
        "baseTime": session["base_time"],
        "tickSize": 0.25,
        "ticks": ticks,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb", dir=output_path.parent, delete=False, prefix=".tmp-"
    ) as raw_temp:
        temp_path = Path(raw_temp.name)
    try:
        with gzip.open(temp_path, "wt", encoding="utf-8", compresslevel=9) as handle:
            json.dump(payload, handle, separators=(",", ":"))
        os.replace(temp_path, output_path)
    finally:
        temp_path.unlink(missing_ok=True)

    return {
        "ticks": len(ticks),
        "firstOffsetNs": ticks[0][0],
        "lastOffsetNs": ticks[-1][0],
        "outOfOrderEventTimes": out_of_order,
        "sideCounts": side_counts,
        "compressedBytes": output_path.stat().st_size,
    }


def main() -> None:
    args = parse_args()
    events, sessions = load_events(args.trades)
    args.output.mkdir(parents=True, exist_ok=True)
    session_output = args.output / "sessions"
    session_output.mkdir(parents=True, exist_ok=True)

    archive_cache: dict[Path, zipfile.ZipFile] = {}
    session_stats: dict[str, dict] = {}
    ordered_sessions = sorted(sessions.values(), key=lambda item: item["date"])

    try:
        for index, session in enumerate(ordered_sessions, start=1):
            archive_path = archive_for_date(args, session["date"])
            archive = archive_cache.setdefault(archive_path, zipfile.ZipFile(archive_path))
            member_name = f"glbx-mdp3-{session['date'].replace('-', '')}.trades.csv.zst"
            if member_name not in archive.namelist():
                raise RuntimeError(f"Missing {member_name} in {archive_path}")

            output_path = session_output / f"{session['id']}.json.gz"
            stats = write_session_package(archive, member_name, session, output_path)
            session_stats[session["id"]] = stats
            print(
                f"[{index:03}/{len(ordered_sessions)}] {session['date']} "
                f"{session['symbol']}: {stats['ticks']:,} ticks, "
                f"{stats['compressedBytes'] / 1_048_576:.2f} MiB",
                flush=True,
            )
    finally:
        for archive in archive_cache.values():
            archive.close()

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "setup": "large-candle-four-strategy",
        "setupCount": len(events),
        "sessionCount": len(ordered_sessions),
        "windowSeconds": WINDOW_SECONDS,
        "events": events,
    }
    manifest_path = args.output / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, separators=(",", ":")),
        encoding="utf-8",
    )

    validation = {
        "schemaVersion": SCHEMA_VERSION,
        "setupRows": sum(1 for _ in csv.DictReader(args.trades.open(encoding="utf-8"))),
        "uniqueEvents": len(events),
        "sessions": session_stats,
        "totalTicks": sum(item["ticks"] for item in session_stats.values()),
        "compressedBytes": sum(item["compressedBytes"] for item in session_stats.values()),
    }
    (args.output / "validation.json").write_text(
        json.dumps(validation, indent=2),
        encoding="utf-8",
    )

    print(
        f"Built {len(events)} events across {len(ordered_sessions)} sessions; "
        f"{validation['totalTicks']:,} ticks, "
        f"{validation['compressedBytes'] / 1_048_576:.1f} MiB compressed.",
        flush=True,
    )


if __name__ == "__main__":
    main()
