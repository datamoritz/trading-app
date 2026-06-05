import type { Candle } from '@/types/market';
import type { Signal } from '@/types/signal';
import type { PriorDayStats } from '@/types/indicators';
import { computePriorDayStats } from './marketProfile';

const SETUP_NAMES = ['Wick Reversal', 'Break & Retest', 'Momentum', 'VWAP Bounce'];

function round25(n: number): number {
  return Math.round(n * 4) / 4;
}

export function generateMockSession(date: string): Candle[] {
  // 9:30 AM ET (EDT = UTC-4 in summer, EST = UTC-5 in winter).
  // NQ RTH runs 9:30–16:00 ET. For simplicity we use EDT year-round
  // (UTC-4), so session open = 13:30 UTC. Close = 13:30 + 389 min = 19:59 UTC.
  const startUnix = Date.UTC(
    parseInt(date.slice(0, 4)),
    parseInt(date.slice(5, 7)) - 1,
    parseInt(date.slice(8, 10)),
    13, 30, 0,
  ) / 1000;

  const candles: Candle[] = [];
  let price = 19000 + Math.random() * 2000; // 19000–21000

  for (let i = 0; i < 390; i++) {
    const open = round25(price);
    const moveMagnitude = Math.random() * 12;
    const moveDir = Math.random() > 0.48 ? 1 : -1; // slight bull bias
    const close = round25(open + moveDir * moveMagnitude);
    const wickUp = Math.random() * 6;
    const wickDown = Math.random() * 6;
    const high = round25(Math.max(open, close) + wickUp);
    const low = round25(Math.min(open, close) - wickDown);

    candles.push({
      time: startUnix + i * 60,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 4000 + 500),
    });

    price = close;
  }

  return candles;
}

export function generateMockSignals(candles: Candle[]): Signal[] {
  const count = 3 + Math.floor(Math.random() * 3);
  const indices = new Set<number>();

  while (indices.size < count) {
    const idx = Math.floor(Math.random() * (candles.length - 30)) + 10;
    indices.add(idx);
  }

  return Array.from(indices)
    .sort((a, b) => a - b)
    .map((idx) => {
      const candle = candles[idx];
      const direction: 'long' | 'short' = Math.random() > 0.5 ? 'long' : 'short';
      const stopDist = round25(8 + Math.random() * 12);
      const targetDist = round25(stopDist * (1.5 + Math.random()));

      return {
        timestamp: candle.time,
        direction,
        entry_price: candle.close,
        stop_price: round25(
          direction === 'long' ? candle.close - stopDist : candle.close + stopDist,
        ),
        target_price: round25(
          direction === 'long' ? candle.close + targetDist : candle.close - targetDist,
        ),
        setup_name: SETUP_NAMES[Math.floor(Math.random() * SETUP_NAMES.length)],
      };
    });
}

// Returns prior session stats (PDH/PDL/PDC + Value Area) for the given date.
// Generates the prior date's full mock session on-the-fly; result is deterministic.
export function getPriorDayStats(date: string): PriorDayStats | null {
  const dates = getMockSessionDates();
  const idx = dates.indexOf(date);
  if (idx <= 0) return null;
  const priorCandles = generateMockSession(dates[idx - 1]);
  return computePriorDayStats(priorCandles);
}

/** All weekdays from 2024-01-02 through 2024-08-30. */
export function getMockSessionDates(): string[] {
  const dates: string[] = [];
  const d    = new Date('2024-01-02');
  const stop = new Date('2024-08-30');
  while (d <= stop) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}
