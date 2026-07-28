import type { Candle } from '@/types/market';
import type {
  CompactTick,
  SimulationEvent,
  SimulationFrame,
  SimulationSession,
} from '@/types/simulation';

const RANGE_POINTS = 22 * 0.25;
const NANOSECONDS_PER_SECOND = 1_000_000_000;

interface MutableRangeBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  delta: number;
  cvdOpen: number;
  cvdHigh: number;
  cvdLow: number;
  cvdClose: number;
}

function cloneCandle(candle: Candle): Candle {
  return { ...candle };
}

export class TickReplayEngine {
  readonly event: SimulationEvent;
  readonly session: SimulationSession;

  private tickIndex = 0;
  private virtualOffsetNs: number;
  private cumulativeDelta = 0;
  private lastRangeTime = 0;
  private rangeBar: MutableRangeBar | null = null;
  private latestTickTime = 0;
  private latestPrice = 0;

  private readonly candles: Candle[] = [];
  private readonly cvdBars: Candle[] = [];
  private readonly rangeBars: Candle[] = [];
  private readonly rangeCvdBars: Candle[] = [];

  constructor(session: SimulationSession, event: SimulationEvent) {
    this.session = session;
    this.event = event;
    this.virtualOffsetNs = event.signalOffsetNs;

    while (
      this.tickIndex < session.ticks.length
      && session.ticks[this.tickIndex][0] < event.signalOffsetNs
    ) {
      this.applyTick(session.ticks[this.tickIndex]);
      this.tickIndex += 1;
    }
  }

  get progress(): number {
    const elapsed = this.virtualOffsetNs - this.event.signalOffsetNs;
    const duration = this.event.endOffsetNs - this.event.signalOffsetNs;
    return Math.max(0, Math.min(1, elapsed / duration));
  }

  get complete(): boolean {
    return this.virtualOffsetNs >= this.event.endOffsetNs;
  }

  get currentOffsetNs(): number {
    return this.virtualOffsetNs;
  }

  get nextTick(): CompactTick | null {
    return this.tickIndex < this.session.ticks.length
      ? this.session.ticks[this.tickIndex]
      : null;
  }

  advanceBy(realMilliseconds: number, speed: number, onTick?: (time: number, price: number) => void): number {
    if (this.complete) return 0;

    const advanceNs = realMilliseconds * speed * 1_000_000;
    this.virtualOffsetNs = Math.min(
      this.event.endOffsetNs,
      this.virtualOffsetNs + advanceNs,
    );

    let processed = 0;
    while (this.tickIndex < this.session.ticks.length) {
      const tick = this.session.ticks[this.tickIndex];
      if (tick[0] >= this.event.endOffsetNs || tick[0] > this.virtualOffsetNs) break;
      this.applyTick(tick);
      this.tickIndex += 1;
      processed += 1;
      onTick?.(this.latestTickTime, this.latestPrice);
    }
    return processed;
  }

  frame(): SimulationFrame {
    return {
      candles: this.candles.map(cloneCandle),
      cvdBars: this.cvdBars.map(cloneCandle),
      rangeBars: [
        ...this.rangeBars.map(cloneCandle),
        ...(this.rangeBar ? [this.toPriceRangeCandle(this.rangeBar)] : []),
      ],
      rangeCvdBars: [
        ...this.rangeCvdBars.map(cloneCandle),
        ...(this.rangeBar ? [this.toCvdRangeCandle(this.rangeBar)] : []),
      ],
      latestTickTime: this.latestTickTime,
      latestPrice: this.latestPrice,
    };
  }

  private applyTick(tick: CompactTick): void {
    const [offsetNs, priceTicks, size, side] = tick;
    const price = priceTicks * this.session.tickSize;
    const delta = size * side;
    const epochSeconds = this.session.baseTime + offsetNs / NANOSECONDS_PER_SECOND;
    const chartTime = Math.floor(epochSeconds);
    const nextCumulativeDelta = this.cumulativeDelta + delta;

    this.latestTickTime = epochSeconds;
    this.latestPrice = price;
    this.updateMinuteBars(chartTime, price, size, delta, nextCumulativeDelta);
    this.updateRangeBars(chartTime, price, size, delta, nextCumulativeDelta);
    this.cumulativeDelta = nextCumulativeDelta;
  }

  private updateMinuteBars(
    time: number,
    price: number,
    size: number,
    delta: number,
    nextCumulativeDelta: number,
  ): void {
    const minute = Math.floor(time / 60) * 60;
    let priceBar = this.candles[this.candles.length - 1];
    let cvdBar = this.cvdBars[this.cvdBars.length - 1];

    if (!priceBar || priceBar.time !== minute) {
      priceBar = {
        time: minute,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
        delta: 0,
      };
      this.candles.push(priceBar);

      cvdBar = {
        time: minute,
        open: this.cumulativeDelta,
        high: this.cumulativeDelta,
        low: this.cumulativeDelta,
        close: this.cumulativeDelta,
        volume: 0,
        delta: 0,
      };
      this.cvdBars.push(cvdBar);
    }

    priceBar.high = Math.max(priceBar.high, price);
    priceBar.low = Math.min(priceBar.low, price);
    priceBar.close = price;
    priceBar.volume += size;
    priceBar.delta = (priceBar.delta ?? 0) + delta;
    if (delta > 0) priceBar.buyVolume = (priceBar.buyVolume ?? 0) + size;
    if (delta < 0) priceBar.sellVolume = (priceBar.sellVolume ?? 0) + size;

    cvdBar.high = Math.max(cvdBar.high, nextCumulativeDelta);
    cvdBar.low = Math.min(cvdBar.low, nextCumulativeDelta);
    cvdBar.close = nextCumulativeDelta;
    cvdBar.volume += size;
    cvdBar.delta = (cvdBar.delta ?? 0) + delta;
  }

  private updateRangeBars(
    time: number,
    price: number,
    size: number,
    delta: number,
    nextCumulativeDelta: number,
  ): void {
    if (!this.rangeBar) {
      this.rangeBar = this.newRangeBar(time, price);
    }

    this.moveRangePrice(time, price);
    if (!this.rangeBar) return;

    this.rangeBar.volume += size;
    this.rangeBar.delta += delta;
    this.rangeBar.cvdHigh = Math.max(this.rangeBar.cvdHigh, nextCumulativeDelta);
    this.rangeBar.cvdLow = Math.min(this.rangeBar.cvdLow, nextCumulativeDelta);
    this.rangeBar.cvdClose = nextCumulativeDelta;
  }

  private moveRangePrice(time: number, price: number): void {
    if (!this.rangeBar) return;
    this.rangeBar.high = Math.max(this.rangeBar.high, price);
    this.rangeBar.low = Math.min(this.rangeBar.low, price);
    this.rangeBar.close = price;

    while (this.rangeBar.high - this.rangeBar.low >= RANGE_POINTS - 1e-9) {
      const closesUp = price >= this.rangeBar.low + RANGE_POINTS - 1e-9;
      const close = closesUp
        ? this.rangeBar.low + RANGE_POINTS
        : this.rangeBar.high - RANGE_POINTS;

      this.rangeBar.close = close;
      if (closesUp) this.rangeBar.high = close;
      else this.rangeBar.low = close;
      this.commitRangeBar();

      this.rangeBar = this.newRangeBar(time, close);
      this.rangeBar.high = Math.max(close, price);
      this.rangeBar.low = Math.min(close, price);
      this.rangeBar.close = price;
    }
  }

  private newRangeBar(time: number, price: number): MutableRangeBar {
    const displayTime = Math.max(time, this.lastRangeTime + 1);
    this.lastRangeTime = displayTime;
    return {
      time: displayTime,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
      delta: 0,
      cvdOpen: this.cumulativeDelta,
      cvdHigh: this.cumulativeDelta,
      cvdLow: this.cumulativeDelta,
      cvdClose: this.cumulativeDelta,
    };
  }

  private commitRangeBar(): void {
    if (!this.rangeBar) return;
    this.rangeBars.push(this.toPriceRangeCandle(this.rangeBar));
    this.rangeCvdBars.push(this.toCvdRangeCandle(this.rangeBar));
  }

  private toPriceRangeCandle(bar: MutableRangeBar): Candle {
    return {
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      delta: bar.delta,
    };
  }

  private toCvdRangeCandle(bar: MutableRangeBar): Candle {
    return {
      time: bar.time,
      open: bar.cvdOpen,
      high: bar.cvdHigh,
      low: bar.cvdLow,
      close: bar.cvdClose,
      volume: bar.volume,
      delta: bar.delta,
    };
  }
}
