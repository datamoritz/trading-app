import type { Candle } from '@/types/market';
import { computeVolumeProfile } from './volumeProfile';
import type { PriorDayStats, VolumeAreaStats } from '@/types/indicators';

// Initial Balance: high and low of the first 60 1-minute bars (first RTH hour).
export function computeIB(candles: Candle[]): { ibh: number; ibl: number } | null {
  const bars = candles.slice(0, 60);
  if (bars.length === 0) return null;
  return {
    ibh: Math.max(...bars.map((c) => c.high)),
    ibl: Math.min(...bars.map((c) => c.low)),
  };
}

// Value Area (70% of volume) around the POC. Uses the standard expand-from-POC algorithm.
export function computeVolumeAreaStats(vpMap: Map<number, number>): VolumeAreaStats | null {
  if (vpMap.size === 0) return null;

  const totalVol = [...vpMap.values()].reduce((a, b) => a + b, 0);
  if (totalVol === 0) return null;

  let pocKey = 0;
  let maxVol = 0;
  for (const [key, vol] of vpMap) {
    if (vol > maxVol) { maxVol = vol; pocKey = key; }
  }

  const keys = [...vpMap.keys()].sort((a, b) => a - b);
  const pocIdx = keys.indexOf(pocKey);

  const target = totalVol * 0.7;
  let vahIdx = pocIdx;
  let valIdx = pocIdx;
  let accumulated = maxVol;

  while (accumulated < target) {
    const upVol   = vahIdx + 1 < keys.length ? (vpMap.get(keys[vahIdx + 1]) ?? 0) : 0;
    const downVol = valIdx - 1 >= 0          ? (vpMap.get(keys[valIdx - 1]) ?? 0) : 0;
    if (upVol === 0 && downVol === 0) break;
    if (upVol >= downVol) { vahIdx++; accumulated += upVol; }
    else                  { valIdx--; accumulated += downVol; }
  }

  return {
    poc: pocKey / 4,
    vah: keys[vahIdx] / 4,
    val: keys[valIdx] / 4,
  };
}

// Derive PDH/PDL/PDC + prior day Value Area from a full prior session.
export function computePriorDayStats(candles: Candle[]): PriorDayStats {
  const high  = Math.max(...candles.map((c) => c.high));
  const low   = Math.min(...candles.map((c) => c.low));
  const close = candles[candles.length - 1].close;
  const vpMap = computeVolumeProfile(candles);
  const va    = computeVolumeAreaStats(vpMap);
  return {
    high, low, close,
    vah: va?.vah ?? close,
    val: va?.val ?? close,
    poc: va?.poc ?? close,
  };
}
