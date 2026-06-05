import type { Time, WhitespaceData } from 'lightweight-charts';

type TimedPoint = { time: Time };

function timeKey(time: Time): number {
  if (typeof time === 'number') return time;
  if (typeof time === 'string') return Date.parse(time) / 1000;
  return Date.UTC(time.year, time.month - 1, time.day) / 1000;
}

export function withWhitespace<T extends TimedPoint>(
  actual: T[],
  fullTimes: Time[],
): Array<T | WhitespaceData> {
  const byTime = new Map<number, T | WhitespaceData>();

  for (const time of fullTimes) {
    byTime.set(timeKey(time), { time });
  }
  for (const point of actual) {
    byTime.set(timeKey(point.time), point);
  }

  return Array.from(byTime.entries())
    .sort(([a], [b]) => a - b)
    .map(([, point]) => point);
}
