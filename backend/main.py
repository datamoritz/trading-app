"""
NQ Trainer — FastAPI backend
Serves real 1-minute NQ front-contract OHLCV bars from the local parquet file.
Run:  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
NQ_PARQUET = (
    ROOT
    / "data/NASDAQ/normalized"
    / "databento_glbx_nq_fut_1m_front_contract_daily_2024-01-26_2025-12-30.parquet"
)

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="NQ Trainer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Data loading (eager, cached for the process lifetime) ──────────────────────
_rth_df: pd.DataFrame | None = None


def _load() -> pd.DataFrame:
    """Read parquet, filter to RTH (8:30–14:59 CT), attach helpers."""
    global _rth_df
    if _rth_df is not None:
        return _rth_df

    df = pd.read_parquet(NQ_PARQUET)

    minute_utc: pd.Series = pd.to_datetime(df["minute"], utc=True)

    # Convert to America/Chicago so DST is handled automatically:
    #   CST (winter, UTC-6): 8:30 CT = 14:30 UTC
    #   CDT (summer, UTC-5): 8:30 CT = 13:30 UTC
    minute_ct = minute_utc.dt.tz_convert("America/Chicago")

    # RTH: 8:30 AM – 2:59 PM CT = 390 one-minute bars
    rth = (
        ((minute_ct.dt.hour == 8) & (minute_ct.dt.minute >= 30))
        | ((minute_ct.dt.hour >= 9) & (minute_ct.dt.hour <= 13))
        | (minute_ct.dt.hour == 14)
    )

    df = df[rth].copy()
    minute_rth_utc = minute_utc[rth]
    minute_rth_ct  = minute_ct[rth]

    # Unix timestamp (seconds) — what lightweight-charts needs (UTC epoch)
    df["ts"] = (minute_rth_utc.astype("int64") // 10**9).values

    # Group sessions by CT calendar date so a winter day starting at 14:30 UTC
    # is labelled with its correct local date, not the next UTC day.
    df["date"] = minute_rth_ct.dt.strftime("%Y-%m-%d").values

    # Fill any NaN delta / volume columns with 0
    for col in ("buy_volume", "sell_volume", "delta"):
        if col in df.columns:
            df[col] = df[col].fillna(0.0)
        else:
            df[col] = 0.0

    df = df.reset_index(drop=True)
    _rth_df = df
    return _rth_df


# Pre-load at import time so the first request isn't slow
try:
    _load()
except Exception as exc:
    print(f"[WARNING] Could not pre-load parquet: {exc}")


# ── Volume-profile helpers (mirrors frontend volumeProfile.ts logic) ───────────

def _compute_vp(day_df: pd.DataFrame) -> dict[int, float]:
    """Body-weighted volume profile. Returns {tick_key: volume}."""
    vp: dict[int, float] = {}

    for row in day_df[["open", "high", "low", "close", "volume"]].itertuples(index=False):
        o, h, l, c, vol = row.open, row.high, row.low, row.close, row.volume
        if math.isnan(vol) or vol <= 0:
            continue

        body_lo = round(min(o, c) * 4)
        body_hi = round(max(o, c) * 4)
        hi_key  = round(h * 4)
        lo_key  = round(l * 4)
        n_body  = body_hi - body_lo
        n_wick  = (hi_key - body_hi) + (body_lo - lo_key)

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
            for k in range(body_lo, body_hi):
                vp[k] = vp.get(k, 0.0) + per

        n_total_wick = (hi_key - body_hi) + (body_lo - lo_key)
        if n_total_wick > 0 and wick_vol > 0:
            per = wick_vol / n_total_wick
            for k in range(body_hi, hi_key):
                vp[k] = vp.get(k, 0.0) + per
            for k in range(lo_key, body_lo):
                vp[k] = vp.get(k, 0.0) + per

    return vp


def _compute_va(vp: dict[int, float]) -> tuple[float, float, float]:
    """Return (vah, val, poc) from a tick-keyed VP map."""
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
        up   = vp.get(keys[vah_idx + 1], 0.0) if vah_idx + 1 < len(keys) else 0.0
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


@lru_cache(maxsize=512)
def _prior_day_stats(date: str) -> dict | None:
    """Cached prior-day stats for `date`. Returns None if no prior session."""
    df = _load()
    all_dates = sorted(df["date"].unique())
    try:
        idx = all_dates.index(date)
    except ValueError:
        return None
    if idx == 0:
        return None

    prior_date = all_dates[idx - 1]
    prior = df[df["date"] == prior_date]
    if prior.empty:
        return None

    high  = float(prior["high"].max())
    low   = float(prior["low"].min())
    close = float(prior["close"].iloc[-1])
    vp    = _compute_vp(prior)
    vah, val, poc = _compute_va(vp)
    return {"high": high, "low": low, "close": close, "vah": vah, "val": val, "poc": poc}


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/api/sessions")
def get_sessions() -> dict:
    """Return sorted list of dates that have ≥ 390 RTH bars."""
    df = _load()
    counts = df.groupby("date").size()
    full_days = sorted(counts[counts >= 390].index.tolist())
    return {"dates": full_days}


@app.get("/api/bars")
def get_bars(date: str = Query(..., description="YYYY-MM-DD")) -> list[dict]:
    """Return 390 RTH 1-minute bars for the given date."""
    df = _load()
    day = df[df["date"] == date]
    if day.empty:
        raise HTTPException(status_code=404, detail=f"No RTH data for {date}")

    cols = ["ts", "open", "high", "low", "close", "volume", "buy_volume", "sell_volume", "delta"]
    out = (
        day[cols]
        .rename(columns={"ts": "time", "buy_volume": "buyVolume", "sell_volume": "sellVolume"})
        .replace({np.nan: None})
        .to_dict(orient="records")
    )
    # Ensure numeric types are plain Python floats/ints (not numpy scalars)
    for bar in out:
        bar["time"] = int(bar["time"])
        for k in ("open", "high", "low", "close", "volume", "buyVolume", "sellVolume", "delta"):
            v = bar.get(k)
            bar[k] = float(v) if v is not None else 0.0
    return out


@app.get("/api/prior-day-stats")
def get_prior_day_stats(date: str = Query(..., description="YYYY-MM-DD")) -> dict | None:
    """Return prior session H/L/C + Value Area for the given date, or null."""
    return _prior_day_stats(date)
