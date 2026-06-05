import type { Candle } from '@/types/market';

// Map keys are integer tick indices: Math.round(price * 4).
// This avoids floating-point accumulation errors across thousands of additions.
// To recover a price: key / 4 = NQ price in points.
export function computeVolumeProfile(candles: Candle[]): Map<number, number> {
  const vol = new Map<number, number>();

  const add = (key: number, amount: number) => {
    vol.set(key, (vol.get(key) ?? 0) + amount);
  };

  for (const { open, close, high, low, volume } of candles) {
    const bodyLowKey  = Math.round(Math.min(open, close) * 4);
    const bodyHighKey = Math.round(Math.max(open, close) * 4);
    const highKey     = Math.round(high * 4);
    const lowKey      = Math.round(low * 4);

    const nBody  = bodyHighKey - bodyLowKey;   // ticks in body
    const nUpper = highKey - bodyHighKey;      // ticks in upper wick
    const nLower = bodyLowKey - lowKey;        // ticks in lower wick
    const nWick  = nUpper + nLower;

    // Degenerate: entire candle is a single price level
    if (nBody === 0 && nWick === 0) {
      add(bodyLowKey, volume);
      continue;
    }

    let bodyVol: number;
    let wickVol: number;

    if (nBody === 0) {
      // Doji — no body, all volume goes to wicks
      bodyVol = 0;
      wickVol = volume;
    } else if (nWick === 0) {
      // No wicks — all volume goes to body
      bodyVol = volume;
      wickVol = 0;
    } else {
      bodyVol = volume * 0.65;
      wickVol = volume * 0.35;
    }

    // Body: uniform distribution across [bodyLow, bodyHigh)
    if (nBody > 0 && bodyVol > 0) {
      const perTick = bodyVol / nBody;
      for (let k = bodyLowKey; k < bodyHighKey; k++) {
        add(k, perTick);
      }
    }

    // Wicks: single uniform density across ALL wick ticks combined.
    // A 10-tick upper wick + 2-tick lower wick → upper gets 10/12 of wickVol.
    if (nWick > 0 && wickVol > 0) {
      const perTick = wickVol / nWick;
      for (let k = bodyHighKey; k < highKey; k++)  add(k, perTick); // upper wick
      for (let k = lowKey;      k < bodyLowKey; k++) add(k, perTick); // lower wick
    }
  }

  return vol;
}

export function priceFromKey(key: number): number {
  return key / 4;
}
