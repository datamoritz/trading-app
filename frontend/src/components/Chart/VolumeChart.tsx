import { useEffect, useRef } from 'react';
import {
  createChart,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type LineWidth,
} from 'lightweight-charts';
import { useReplayStore } from '@/stores/replayStore';
import { useTimezoneStore, TZ_IANA, type TZ } from '@/stores/timezoneStore';
import type { Candle, Timeframe } from '@/types/market';
import { aggregateCandles } from '@/utils/aggregateCandles';
import { computeRangeBars } from '@/utils/rangeBars';
import { VerticalLine } from '@/utils/verticalLine';
import { withWhitespace } from '@/utils/chartSeriesData';

const MA_PERIOD = 20;

function makeTzOptions(tz: TZ) {
  const ianaName = TZ_IANA[tz];
  const fmt = (ts: number) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: ianaName,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ts * 1000));

  const tickMarkFormatter = (time: number, markType: TickMarkType) => {
    const d = new Date(time * 1000);
    if (markType === TickMarkType.Year)
      return new Intl.DateTimeFormat('en-US', { timeZone: ianaName, year: 'numeric' }).format(d);
    if (markType === TickMarkType.Month)
      return new Intl.DateTimeFormat('en-US', { timeZone: ianaName, month: 'short', year: '2-digit' }).format(d);
    if (markType === TickMarkType.DayOfMonth)
      return new Intl.DateTimeFormat('en-US', { timeZone: ianaName, month: 'numeric', day: 'numeric' }).format(d);
    return fmt(time);
  };

  return { timeFormatter: fmt, tickMarkFormatter };
}

interface VolBar { time: Time; value: number; color: string }
interface MaBar  { time: Time; value: number }

function buildChartData(bars: Candle[]): { volBars: VolBar[]; maBars: MaBar[] } {
  const volBars: VolBar[] = bars.map((c) => ({
    time:  c.time as Time,
    value: c.volume,
    color: c.close >= c.open ? 'rgba(63,185,80,0.5)' : 'rgba(248,81,73,0.5)',
  }));

  const maBars: MaBar[] = [];
  for (let i = MA_PERIOD - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - MA_PERIOD + 1; j <= i; j++) sum += bars[j].volume;
    maBars.push({ time: bars[i].time as Time, value: sum / MA_PERIOD });
  }

  return { volBars, maBars };
}

interface Props {
  activeTimeframe: Timeframe;
  showIBEnd: boolean;
  onChartReady?: (chart: IChartApi, series: ISeriesApi<'Histogram'>) => void;
}

export function VolumeChart({ activeTimeframe, showIBEnd, onChartReady }: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const volSeriesRef    = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maSeriesRef     = useRef<ISeriesApi<'Line'> | null>(null);
  const ibEndLineRef    = useRef<VerticalLine | null>(null);
  const onChartReadyRef = useRef(onChartReady);
  onChartReadyRef.current = onChartReady;

  const { candles, currentIndex } = useReplayStore();
  const { tz } = useTimezoneStore();

  const prevCandlesRef   = useRef<typeof candles | null>(null);
  const prevTimeframeRef = useRef(activeTimeframe);
  const prevBarCountRef  = useRef(0);
  const prevIndexRef     = useRef(currentIndex);

  useEffect(() => {
    if (!containerRef.current) return;

    const { timeFormatter, tickMarkFormatter } = makeTzOptions(useTimezoneStore.getState().tz);
    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: { background: { color: '#0f1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
      rightPriceScale: { borderColor: '#21262d', minimumWidth: 70 },
      crosshair: { horzLine: { visible: false, labelVisible: false } },
      localization: { timeFormatter },
      timeScale: {
        borderColor: '#21262d',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter,
        shiftVisibleRangeOnNewBar: false,
      },
    });

    const volSeries = chart.addHistogramSeries({
      base: 0,
      priceFormat: { type: 'volume' },
      priceScaleId: 'right',
    });
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.15, bottom: 0 },
      autoScale: true,
    });

    const maSeries = chart.addLineSeries({
      color: '#f0b429',
      lineWidth: 1 as LineWidth,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current     = chart;
    volSeriesRef.current = volSeries;
    maSeriesRef.current  = maSeries;
    onChartReadyRef.current?.(chart, volSeries);

    const observer = new ResizeObserver(() => {
      if (containerRef.current)
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = volSeriesRef.current = maSeriesRef.current = null;
    };
  }, []);

  // ── Timezone ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const { timeFormatter, tickMarkFormatter } = makeTzOptions(tz);
    chart.applyOptions({ localization: { timeFormatter } });
    chart.timeScale().applyOptions({ tickMarkFormatter } as never);
  }, [tz]);

  // ── Volume + MA data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!volSeriesRef.current || candles.length === 0) return;

    const fullReload =
      prevCandlesRef.current !== candles || prevTimeframeRef.current !== activeTimeframe;
    prevCandlesRef.current   = candles;
    prevTimeframeRef.current = activeTimeframe;

    const slice    = candles.slice(0, currentIndex + 1);
    const fullBars = activeTimeframe === '22R'
      ? computeRangeBars(candles)
      : aggregateCandles(candles, activeTimeframe);
    const bars  = activeTimeframe === '22R'
      ? computeRangeBars(slice)
      : aggregateCandles(slice, activeTimeframe);

    const { volBars: actualVolBars, maBars: actualMaBars } = buildChartData(bars);
    const fullTimes = fullBars.map((bar) => bar.time as Time);
    const volBars = withWhitespace(actualVolBars, fullTimes);
    const maBars = withWhitespace(actualMaBars, fullTimes);

    const savedRange = chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;
    volSeriesRef.current.setData(volBars);
    maSeriesRef.current?.setData(maBars);

    if (savedRange) {
      const revealedCount = actualVolBars.length;
      const previousCount = prevBarCountRef.current;
      const replayAdvanced = !fullReload && currentIndex > prevIndexRef.current;
      const lastRevealedIndex = revealedCount - 1;
      const shouldFollowReplay =
        replayAdvanced &&
        revealedCount > previousCount &&
        lastRevealedIndex > savedRange.to;
      const range = shouldFollowReplay
        ? {
            from: savedRange.from + (lastRevealedIndex - savedRange.to),
            to: lastRevealedIndex,
          }
        : savedRange;
      requestAnimationFrame(() => {
        try { chartRef.current?.timeScale().setVisibleLogicalRange(range); } catch { /* chart may be mid-unmount */ }
      });
    }
    prevBarCountRef.current = actualVolBars.length;
    prevIndexRef.current = currentIndex;
  }, [currentIndex, candles, activeTimeframe]);

  // ── IB end vertical line ───────────────────────────────────────────────────
  useEffect(() => {
    const series = volSeriesRef.current;
    const chart  = chartRef.current;
    if (ibEndLineRef.current && series) {
      try { series.detachPrimitive(ibEndLineRef.current as never); } catch { /* chart may be mid-unmount */ }
      ibEndLineRef.current = null;
    }
    if (showIBEnd && candles.length > 0 && series && chart) {
      const line = new VerticalLine(chart, (candles[0].time + 3600) as Time, 'rgba(74,222,128,0.5)', 5);
      ibEndLineRef.current = line;
      series.attachPrimitive(line as never);
    }
  }, [showIBEnd, candles]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <span className="absolute top-2 left-2 text-[11px] text-gray-600 pointer-events-none select-none">
        Volume
      </span>
    </div>
  );
}
