import type { Candle } from '@/types/market';
import type { Trade } from '@/types/trade';

export interface TradeExit {
  time: number;
  price: number;
}

function crossed(from: number, to: number, level: number) {
  return level >= Math.min(from, to) && level <= Math.max(from, to);
}

function progress(from: number, to: number, level: number) {
  if (Math.abs(to - from) < 1e-9) return 0;
  return Math.abs((level - from) / (to - from));
}

export function findTradeExitInCandle(trade: Trade, candle: Candle): TradeExit | null {
  const path = candle.close >= candle.open
    ? [candle.open, candle.high, candle.low, candle.close]
    : [candle.open, candle.low, candle.high, candle.close];

  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const hits: Array<{ price: number; progress: number }> = [];

    if (trade.direction === 'long') {
      if (crossed(from, to, trade.stop_price)) {
        hits.push({ price: trade.stop_price, progress: progress(from, to, trade.stop_price) });
      }
      if (crossed(from, to, trade.target_price)) {
        hits.push({ price: trade.target_price, progress: progress(from, to, trade.target_price) });
      }
    } else {
      if (crossed(from, to, trade.stop_price)) {
        hits.push({ price: trade.stop_price, progress: progress(from, to, trade.stop_price) });
      }
      if (crossed(from, to, trade.target_price)) {
        hits.push({ price: trade.target_price, progress: progress(from, to, trade.target_price) });
      }
    }

    if (hits.length > 0) {
      hits.sort((a, b) => a.progress - b.progress);
      return { time: candle.time, price: hits[0].price };
    }
  }

  return null;
}

export function findTradeExit(
  trade: Trade,
  candles: Candle[],
  currentIndex: number,
): TradeExit | null {
  const entryIndex = candles.findIndex((c) => c.time === trade.entry_time);
  if (entryIndex < 0) return null;

  const endIndex = Math.min(currentIndex, candles.length - 1);
  for (let i = entryIndex + 1; i <= endIndex; i++) {
    const exit = findTradeExitInCandle(trade, candles[i]);
    if (exit) return exit;
  }

  return null;
}
