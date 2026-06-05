import type { Candle } from '@/types/market';

const TICK_SIZE   = 0.25;
const RANGE_TICKS = 22;
export const RANGE_PTS = RANGE_TICKS * TICK_SIZE; // 5.5 points

const snap = (p: number) => Math.round(p / TICK_SIZE) * TICK_SIZE;

interface S {
  open: number;
  time: number;     // desired open time from source 1m bar
  nextTime: number; // next available timestamp — guarantees strictly increasing output times
  high: number; low: number;
  vol: number;  delta: number;
}

function pushBar(s: S, closePx: number, out: Candle[]): void {
  const t = Math.max(s.time, s.nextTime);
  out.push({ time: t, open: s.open, high: s.high, low: s.low, close: closePx,
             volume: Math.round(s.vol), delta: Math.round(s.delta) });
  s.nextTime = t + 1;
}

function resetBar(s: S, openPx: number, sourceTime: number): void {
  s.open  = openPx;
  s.time  = Math.max(sourceTime, s.nextTime);
  s.high  = openPx;
  s.low   = openPx;
  s.vol   = 0;
  s.delta = 0;
}

// Process a monotone price sweep from `from` to `to`, splitting vol/delta proportionally.
// Closes range bars (high - low = RANGE_PTS) into `out` and resets state for the next bar.
function sweep(
  from: number, to: number,
  vol: number, delta: number,
  sourceTime: number,
  s: S, out: Candle[],
): void {
  if (Math.abs(to - from) < 1e-9) return;

  const dir       = to > from ? 1 : -1;
  const totalDist = Math.abs(to - from);
  const boundary  = snap(dir > 0 ? s.low + RANGE_PTS : s.high - RANGE_PTS);
  const distToBoundary = Math.abs(boundary - from);

  if (distToBoundary >= totalDist - 1e-9) {
    if (dir > 0) s.high = Math.max(s.high, to);
    else          s.low  = Math.min(s.low,  to);
    s.vol   += vol;
    s.delta += delta;
    return;
  }

  // Bar closes at boundary
  const frac = distToBoundary / totalDist;
  if (dir > 0) s.high = boundary;
  else          s.low  = boundary;
  s.vol   += vol * frac;
  s.delta += delta * frac;

  pushBar(s, boundary, out);
  resetBar(s, boundary, sourceTime);

  sweep(boundary, to, vol * (1 - frac), delta * (1 - frac), sourceTime, s, out);
}

/**
 * Build 22-tick (5.5 pt) range bars from 1-minute OHLCV candles.
 *
 * Each completed bar has high - low = exactly 5.5 pts.
 * The last entry is the in-progress bar (may be narrower).
 * Output timestamps are strictly increasing (required by LW Charts).
 *
 * Intra-bar path assumption:
 *   bullish (close >= open): open → high → low → close
 *   bearish (close  < open): open → low  → high → close
 */
export function computeRangeBars(candles1m: Candle[]): Candle[] {
  if (candles1m.length === 0) return [];

  const s: S = {
    open:     candles1m[0].open,
    time:     candles1m[0].time,
    nextTime: candles1m[0].time,
    high:     candles1m[0].open,
    low:      candles1m[0].open,
    vol:      0,
    delta:    0,
  };
  const out: Candle[] = [];

  for (const c of candles1m) {
    const barDelta  = c.delta ?? (c.close >= c.open ? c.volume : -c.volume);
    const isBullish = c.close >= c.open;
    const wp = isBullish
      ? [c.open, c.high, c.low, c.close]
      : [c.open, c.low,  c.high, c.close];

    let totalPath = 0;
    for (let i = 1; i < wp.length; i++) totalPath += Math.abs(wp[i] - wp[i - 1]);

    if (totalPath < 1e-9) {
      s.vol   += c.volume;
      s.delta += barDelta;
      continue;
    }

    // Advance the desired time for the current bar if a new 1m bar begins
    if (c.time > s.time) {
      s.time = Math.max(c.time, s.nextTime);
    }

    for (let i = 1; i < wp.length; i++) {
      const dist = Math.abs(wp[i] - wp[i - 1]);
      const frac = dist / totalPath;
      sweep(wp[i - 1], wp[i], c.volume * frac, barDelta * frac, c.time, s, out);
    }
  }

  // In-progress bar
  const last = candles1m[candles1m.length - 1];
  const t = Math.max(s.time, s.nextTime);
  out.push({ time: t, open: s.open, high: s.high, low: s.low, close: last.close,
             volume: Math.round(s.vol), delta: Math.round(s.delta) });

  return out;
}
