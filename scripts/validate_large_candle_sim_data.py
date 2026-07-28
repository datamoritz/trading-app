#!/usr/bin/env python3
"""Validate published simulation ticks against every source signal candle."""

from __future__ import annotations

import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path

from build_large_candle_sim_data import load_events


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    setup_root = repo_root.parent / "data/NASDAQ/setups/large_candle_four_strategy"
    trades_path = setup_root / "trades.csv"
    published = setup_root / "published/v1"

    events, _ = load_events(trades_path)
    event_by_key = {
        (event["sessionId"], event["signalOffsetNs"]): event for event in events
    }

    with trades_path.open(newline="", encoding="utf-8") as handle:
        source_rows = list(csv.DictReader(handle))

    rows_by_event: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for row in source_rows:
        from build_large_candle_sim_data import opaque_id, parse_utc, session_start_utc

        signal = parse_utc(row["signal_timestamp_utc"])
        base = session_start_utc(row["session_date"])
        signal_offset_ns = int((signal - base).total_seconds() * 1_000_000_000)
        session_id = opaque_id("session", f"{row['session_date']}|{row['symbol']}")
        rows_by_event[(session_id, signal_offset_ns)].append(row)

    sessions_to_events: dict[str, list[tuple[int, list[dict]]]] = defaultdict(list)
    for (session_id, signal_offset_ns), rows in rows_by_event.items():
        if (session_id, signal_offset_ns) not in event_by_key:
            raise AssertionError(f"Manifest event missing: {session_id} {signal_offset_ns}")
        sessions_to_events[session_id].append((signal_offset_ns, rows))

    failures: list[str] = []
    checked = 0
    for session_id, grouped_events in sorted(sessions_to_events.items()):
        with gzip.open(
            published / "sessions" / f"{session_id}.json.gz",
            "rt",
            encoding="utf-8",
        ) as handle:
            package = json.load(handle)

        tick_size = package["tickSize"]
        ticks = package["ticks"]
        for signal_offset_ns, rows in grouped_events:
            candle_end = signal_offset_ns + 300 * 1_000_000_000
            candle_ticks = [
                tick for tick in ticks if signal_offset_ns <= tick[0] < candle_end
            ]
            if not candle_ticks:
                failures.append(f"{session_id}@{signal_offset_ns}: no signal ticks")
                continue

            prices = [tick[1] * tick_size for tick in candle_ticks]
            volume = sum(tick[2] for tick in candle_ticks)
            actual = {
                "signal_open": prices[0],
                "signal_high": max(prices),
                "signal_low": min(prices),
                "signal_close": prices[-1],
                "signal_volume": volume,
            }

            for row in rows:
                for key, actual_value in actual.items():
                    expected = float(row[key])
                    if abs(actual_value - expected) > 1e-9:
                        failures.append(
                            f"trade {row['trade_id']} {key}: "
                            f"expected {expected}, got {actual_value}"
                        )
                checked += 1

    if failures:
        print(f"Validation failed with {len(failures)} differences:")
        for failure in failures[:50]:
            print(f"  {failure}")
        raise SystemExit(1)

    print(
        f"Validated {checked} source rows across {len(event_by_key)} unique events: "
        "all signal OHLCV values match the exact published ticks."
    )


if __name__ == "__main__":
    main()
