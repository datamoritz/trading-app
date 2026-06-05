import type { Candle } from '@/types/market';
import type { Signal } from '@/types/signal';
import type { Trade } from '@/types/trade';
import type { PriorDayStats } from '@/types/indicators';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
const MARKET_DATA_BASE =
  import.meta.env.VITE_MARKET_DATA_BASE_URL
  ?? (import.meta.env.PROD ? 'https://trading-data.moritzknodler.com/NQ' : undefined);

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

/** Return sorted list of dates that have real RTH data. */
export async function fetchSessions(): Promise<string[]> {
  if (MARKET_DATA_BASE) {
    const data = await get<{ dates: string[] }>(`${MARKET_DATA_BASE}/sessions.json`);
    return data.dates;
  }
  const data = await get<{ dates: string[] }>(`${BASE}/sessions`);
  return data.dates;
}

/** Return 390 RTH 1-minute bars for the given date. */
export async function fetchBars(date: string): Promise<Candle[]> {
  if (MARKET_DATA_BASE) {
    return get<Candle[]>(`${MARKET_DATA_BASE}/bars/${date}.json`);
  }
  return get<Candle[]>(`${BASE}/bars?date=${date}`);
}

/** Return prior-session stats (H/L/C + Value Area), or null for the first date. */
export async function fetchPriorDayStats(date: string): Promise<PriorDayStats | null> {
  if (MARKET_DATA_BASE) {
    return get<PriorDayStats | null>(`${MARKET_DATA_BASE}/prior-day-stats/${date}.json`);
  }
  return get<PriorDayStats | null>(`${BASE}/prior-day-stats?date=${date}`);
}

/** Fetch wick-setup signals for a session (not yet wired on backend). */
export async function fetchSignals(_date: string): Promise<Signal[]> {
  const res = await fetch(`${BASE}/signals?date=${_date}`);
  if (!res.ok) throw new Error(`fetchSignals ${res.status}`);
  return res.json() as Promise<Signal[]>;
}

/** Persist a completed trade to the backend. */
export async function saveTrade(_trade: Trade): Promise<void> {
  await fetch(`${BASE}/trades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(_trade),
  });
}
