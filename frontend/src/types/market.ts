export interface Candle {
  time: number;   // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume?: number;
  sellVolume?: number;
  delta?: number;
}

export type Timeframe = '1m' | '5m' | '1h' | '22R';
