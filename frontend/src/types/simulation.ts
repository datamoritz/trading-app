import type { Candle } from './market';

export type SimulationSpeed = 1 | 2 | 5 | 10;

export interface SimulationEvent {
  id: string;
  sessionId: string;
  signalOffsetNs: number;
  endOffsetNs: number;
}

export interface SimulationManifest {
  schemaVersion: number;
  setup: string;
  setupCount: number;
  sessionCount: number;
  windowSeconds: number;
  events: SimulationEvent[];
}

export type CompactTick = [
  offsetNs: number,
  priceTicks: number,
  size: number,
  side: -1 | 0 | 1,
];

export interface SimulationSession {
  schemaVersion: number;
  sessionId: string;
  baseTime: number;
  tickSize: number;
  ticks: CompactTick[];
}

export interface SimulationFrame {
  candles: Candle[];
  rangeBars: Candle[];
  cvdBars: Candle[];
  rangeCvdBars: Candle[];
  latestTickTime: number;
  latestPrice: number;
}
