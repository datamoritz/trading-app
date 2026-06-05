import type { Candle } from '@/types/market';
import type { VwapBar } from '@/types/indicators';

// VWAP anchored to the first bar in the slice (RTH open).
// Standard deviation bands use the volume-weighted variance formula:
//   variance = Σ(vol × tp²) / Σ(vol) − vwap²
// which is numerically stable as a running accumulator.
export function computeVwap(candles: Candle[]): VwapBar[] {
  const result: VwapBar[] = [];
  let cumTPV  = 0; // Σ vol × typical_price
  let cumTPV2 = 0; // Σ vol × typical_price²
  let cumVol  = 0;

  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV  += tp * c.volume;
    cumTPV2 += tp * tp * c.volume;
    cumVol  += c.volume;
    if (cumVol === 0) continue;

    const vwap     = cumTPV / cumVol;
    const variance = Math.max(0, cumTPV2 / cumVol - vwap * vwap);
    const sd       = Math.sqrt(variance);

    result.push({ time: c.time, vwap, sd1: sd, sd1_5: sd * 1.5, sd2: sd * 2, sd3: sd * 3 });
  }

  return result;
}
