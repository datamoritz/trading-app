import type { Candle, Timeframe } from '@/types/market';

const PERIOD_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '1h': 3600,
  '22R': 0, // range bars handled separately — this path is never reached
};

export function aggregateCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === '1m' || timeframe === '22R') return candles;

  const period = PERIOD_SECONDS[timeframe];
  const groups = new Map<number, Candle[]>();

  for (const candle of candles) {
    const key = Math.floor(candle.time / period) * period;
    const group = groups.get(key);
    if (group) {
      group.push(candle);
    } else {
      groups.set(key, [candle]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([periodStart, group]) => ({
      time: periodStart,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0),
      delta: group.reduce((sum, c) => sum + (c.delta ?? 0), 0),
    }));
}
