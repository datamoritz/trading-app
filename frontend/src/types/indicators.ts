export interface IndicatorConfig {
  showIBHL: boolean;       // Initial Balance High + Low (first 60 min of RTH)
  showSessionOpen: boolean; // RTH session opening price line
  showPriorClose: boolean;  // Prior day closing price
  showPriorHL: boolean;     // Prior day high + low
  showPriorVP: boolean;     // Prior day VAH / VAL / POC
  showCurrentVP: boolean;   // Current day VAH / VAL / POC (live as replay advances)
  showVWAP: boolean;        // VWAP anchored to RTH open + all ±σ bands
}

export const DEFAULT_INDICATORS: IndicatorConfig = {
  showIBHL: false,
  showSessionOpen: false,
  showPriorClose: false,
  showPriorHL: false,
  showPriorVP: false,
  showCurrentVP: false,
  showVWAP: false,
};

export interface PriorDayStats {
  high: number;
  low: number;
  close: number;
  vah: number;
  val: number;
  poc: number;
}

export interface VolumeAreaStats {
  vah: number;
  val: number;
  poc: number;
}

export interface VwapBar {
  time: number;
  vwap: number;
  sd1: number;   // 1σ offset from VWAP
  sd1_5: number; // 1.5σ offset
  sd2: number;
  sd3: number;
}
