import { useEffect, useRef } from 'react';
import {
  createChart,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type CandlestickData,
} from 'lightweight-charts';
import { useReplayStore } from '@/stores/replayStore';
import { useTimezoneStore, TZ_IANA, type TZ } from '@/stores/timezoneStore';
import type { Candle, Timeframe } from '@/types/market';
import { computeRangeBars } from '@/utils/rangeBars';
import { withWhitespace } from '@/utils/chartSeriesData';
import { cn } from '@/lib/utils';

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

const PERIOD_SECONDS: Record<string, number> = { '1m': 60, '5m': 300, '1h': 3600 };

interface CvdBar { time: Time; open: number; high: number; low: number; close: number }

function computeCVDBars(candles1m: Candle[], timeframe: Timeframe): CvdBar[] {
  // Range bars: each output bar from computeRangeBars is already one period
  if (timeframe === '22R') {
    const bars = computeRangeBars(candles1m);
    let prevCum = 0;
    return bars.map((c) => {
      const open  = prevCum;
      const close = prevCum + (c.delta ?? 0);
      prevCum = close;
      return { time: c.time as Time, open, high: Math.max(open, close), low: Math.min(open, close), close };
    });
  }

  // Time-based grouping
  const period = PERIOD_SECONDS[timeframe];
  const groups = new Map<number, Candle[]>();

  for (const c of candles1m) {
    const key = Math.floor(c.time / period) * period;
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }

  let prevCum = 0;
  const result: CvdBar[] = [];

  for (const [periodTime, group] of Array.from(groups.entries()).sort(([a], [b]) => a - b)) {
    const open = prevCum;
    let high = open, low = open, running = open;

    for (const c of group) {
      running += c.delta ?? (c.close >= c.open ? c.volume : -c.volume);
      if (running > high) high = running;
      if (running < low)  low  = running;
    }

    result.push({ time: periodTime as Time, open, high, low, close: running });
    prevCum = running;
  }

  return result;
}

interface Props {
  activeTimeframe: Timeframe;
  isRangeMode: boolean;
  onToggleRangeMode: () => void;
  onChartReady?: (chart: IChartApi, series: ISeriesApi<'Candlestick'>) => void;
  showRangeToggle?: boolean;
}

export function DeltaChart({
  activeTimeframe,
  isRangeMode,
  onToggleRangeMode,
  onChartReady,
  showRangeToggle = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
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
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: { background: { color: '#0f1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
      rightPriceScale: { borderColor: '#21262d', minimumWidth: 70 },
      crosshair: { horzLine: { visible: false, labelVisible: false } },
      localization: { timeFormatter },
      timeScale: { borderColor: '#21262d', timeVisible: true, secondsVisible: false, tickMarkFormatter, shiftVisibleRangeOnNewBar: false },
    });

    const series = chart.addCandlestickSeries({
      upColor:       '#3fb950',
      downColor:     '#f85149',
      wickUpColor:   '#3fb950',
      wickDownColor: '#f85149',
      borderVisible: false,
    });

    chartRef.current  = chart;
    seriesRef.current = series;
    onChartReadyRef.current?.(chart, series);

    const observer = new ResizeObserver(() => {
      if (containerRef.current)
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = seriesRef.current = null;
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

  // ── CVD data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const fullReload =
      prevCandlesRef.current !== candles || prevTimeframeRef.current !== activeTimeframe;
    prevCandlesRef.current   = candles;
    prevTimeframeRef.current = activeTimeframe;

    const fullBars = computeCVDBars(candles, activeTimeframe);
    const actualBars = computeCVDBars(candles.slice(0, currentIndex + 1), activeTimeframe);
    const fullTimes = isRangeMode
      ? candles.map((bar) => bar.time as Time)
      : fullBars.map((bar) => bar.time);
    const bars = withWhitespace(
      actualBars satisfies CandlestickData[],
      fullTimes,
    );

    const chart = chartRef.current;
    const savedLogicalRange = !isRangeMode ? chart?.timeScale().getVisibleLogicalRange() ?? null : null;
    const savedTimeRange = isRangeMode ? chart?.timeScale().getVisibleRange() ?? null : null;
    seriesRef.current.setData(bars);

    if (isRangeMode) {
      if (savedTimeRange) {
        requestAnimationFrame(() => {
          try { chartRef.current?.timeScale().setVisibleRange(savedTimeRange); } catch { /* chart may be mid-unmount */ }
        });
      }
    } else if (savedLogicalRange) {
      const revealedCount = actualBars.length;
      const previousCount = prevBarCountRef.current;
      const replayAdvanced = !fullReload && currentIndex > prevIndexRef.current;
      const lastRevealedIndex = revealedCount - 1;
      const shouldFollowReplay =
        replayAdvanced &&
        revealedCount > previousCount &&
        lastRevealedIndex > savedLogicalRange.to;
      const range = shouldFollowReplay
        ? {
            from: savedLogicalRange.from + (lastRevealedIndex - savedLogicalRange.to),
            to: lastRevealedIndex,
          }
        : savedLogicalRange;
      requestAnimationFrame(() => {
        try { chartRef.current?.timeScale().setVisibleLogicalRange(range); } catch { /* chart may be mid-unmount */ }
      });
    }
    prevBarCountRef.current = actualBars.length;
    prevIndexRef.current = currentIndex;
  }, [currentIndex, candles, activeTimeframe, isRangeMode]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {showRangeToggle && (
        <button
          type="button"
          onClick={onToggleRangeMode}
          className={cn(
            'absolute right-[76px] top-2 z-10 rounded border bg-[#131720]/75 px-1.5 py-0.5 text-[11px] leading-none opacity-55 shadow-sm backdrop-blur-sm transition hover:border-blue-400/50 hover:text-blue-300 hover:opacity-100',
            isRangeMode
              ? 'border-blue-400/60 text-blue-300 opacity-90'
              : 'border-white/10 text-gray-500',
          )}
          title="Toggle 22R delta"
        >
          22R
        </button>
      )}
      <span className="absolute top-2 left-2 text-[11px] text-gray-600 pointer-events-none select-none">
        CVD{isRangeMode ? ' · 22R' : ''}
      </span>
    </div>
  );
}
