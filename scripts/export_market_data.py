#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pandas as pd


RTH_START_HOUR = 8
RTH_START_MINUTE = 30
RTH_END_HOUR = 14


def compute_vp(day_df: pd.DataFrame) -> dict[int, float]:
    vp: dict[int, float] = {}
    for row in day_df[["open", "high", "low", "close", "volume"]].itertuples(index=False):
        o, h, l, c, vol = row.open, row.high, row.low, row.close, row.volume
        if math.isnan(vol) or vol <= 0:
            continue

        body_lo = round(min(o, c) * 4)
        body_hi = round(max(o, c) * 4)
        hi_key = round(h * 4)
        lo_key = round(l * 4)
        n_body = body_hi - body_lo
        n_wick = (hi_key - body_hi) + (body_lo - lo_key)

        if n_body == 0 and n_wick == 0:
            vp[body_lo] = vp.get(body_lo, 0.0) + vol
            continue

        if n_body == 0:
            body_vol, wick_vol = 0.0, vol
        elif n_wick == 0:
            body_vol, wick_vol = vol, 0.0
        else:
            body_vol, wick_vol = vol * 0.65, vol * 0.35

        if n_body > 0 and body_vol > 0:
            per = body_vol / n_body
            for key in range(body_lo, body_hi):
                vp[key] = vp.get(key, 0.0) + per

        n_total_wick = (hi_key - body_hi) + (body_lo - lo_key)
        if n_total_wick > 0 and wick_vol > 0:
            per = wick_vol / n_total_wick
            for key in range(body_hi, hi_key):
                vp[key] = vp.get(key, 0.0) + per
            for key in range(lo_key, body_lo):
                vp[key] = vp.get(key, 0.0) + per

    return vp


def compute_va(vp: dict[int, float]) -> tuple[float, float, float]:
    if not vp:
        return 0.0, 0.0, 0.0

    total = sum(vp.values())
    poc_key = max(vp, key=vp.__getitem__)
    keys = sorted(vp)
    poc_idx = keys.index(poc_key)

    target = total * 0.70
    vah_idx = poc_idx
    val_idx = poc_idx
    acc = vp[poc_key]

    while acc < target:
        up = vp.get(keys[vah_idx + 1], 0.0) if vah_idx + 1 < len(keys) else 0.0
        down = vp.get(keys[val_idx - 1], 0.0) if val_idx - 1 >= 0 else 0.0
        if up == 0.0 and down == 0.0:
            break
        if up >= down:
            vah_idx += 1
            acc += up
        else:
            val_idx -= 1
            acc += down

    return keys[vah_idx] / 4, keys[val_idx] / 4, poc_key / 4


def load_rth(parquet_path: Path) -> pd.DataFrame:
    df = pd.read_parquet(parquet_path)
    minute_utc = pd.to_datetime(df["minute"], utc=True)
    minute_ct = minute_utc.dt.tz_convert("America/Chicago")
    rth = (
        ((minute_ct.dt.hour == RTH_START_HOUR) & (minute_ct.dt.minute >= RTH_START_MINUTE))
        | ((minute_ct.dt.hour >= 9) & (minute_ct.dt.hour <= 13))
        | (minute_ct.dt.hour == RTH_END_HOUR)
    )

    df = df[rth].copy()
    minute_rth_utc = minute_utc[rth]
    minute_rth_ct = minute_ct[rth]
    df["ts"] = (minute_rth_utc.astype("int64") // 10**9).values
    df["date"] = minute_rth_ct.dt.strftime("%Y-%m-%d").values

    for column in ("buy_volume", "sell_volume", "delta"):
        if column in df.columns:
            df[column] = df[column].fillna(0.0)
        else:
            df[column] = 0.0

    return df.reset_index(drop=True)


def day_bars(day: pd.DataFrame) -> list[dict[str, float | int]]:
    cols = ["ts", "open", "high", "low", "close", "volume", "buy_volume", "sell_volume", "delta"]
    records = (
        day[cols]
        .rename(columns={"ts": "time", "buy_volume": "buyVolume", "sell_volume": "sellVolume"})
        .to_dict(orient="records")
    )
    out: list[dict[str, float | int]] = []
    for record in records:
        out.append({
            "time": int(record["time"]),
            "open": float(record["open"]),
            "high": float(record["high"]),
            "low": float(record["low"]),
            "close": float(record["close"]),
            "volume": float(record["volume"]),
            "buyVolume": float(record.get("buyVolume") or 0),
            "sellVolume": float(record.get("sellVolume") or 0),
            "delta": float(record.get("delta") or 0),
        })
    return out


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Export NQ trainer data as per-day JSON.")
    parser.add_argument("--parquet", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    df = load_rth(args.parquet)
    counts = df.groupby("date").size()
    dates = sorted(counts[counts >= 390].index.tolist())

    write_json(args.out / "sessions.json", {"dates": dates})

    for index, date in enumerate(dates):
        day = df[df["date"] == date]
        write_json(args.out / "bars" / f"{date}.json", day_bars(day))

        if index == 0:
            write_json(args.out / "prior-day-stats" / f"{date}.json", None)
            continue

        prior = df[df["date"] == dates[index - 1]]
        vp = compute_vp(prior)
        vah, val, poc = compute_va(vp)
        write_json(args.out / "prior-day-stats" / f"{date}.json", {
            "high": float(prior["high"].max()),
            "low": float(prior["low"].min()),
            "close": float(prior["close"].iloc[-1]),
            "vah": vah,
            "val": val,
            "poc": poc,
        })

    print(f"Exported {len(dates)} sessions to {args.out}")


if __name__ == "__main__":
    main()
