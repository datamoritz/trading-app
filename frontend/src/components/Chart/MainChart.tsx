import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  LineStyle,
  CrosshairMode,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type Time,
  type LineWidth,
  type CandlestickData,
  type Logical,
  type MouseEventParams,
} from 'lightweight-charts';
import { useTimezoneStore, TZ_IANA, type TZ } from '@/stores/timezoneStore';
import { useReplayStore } from '@/stores/replayStore';
import { useTradeStore } from '@/stores/tradeStore';
import { aggregateCandles } from '@/utils/aggregateCandles';
import { computeRangeBars } from '@/utils/rangeBars';
import { computeIB, computeVolumeAreaStats } from '@/utils/marketProfile';
import { computeVolumeProfile } from '@/utils/volumeProfile';
import { computeVwap } from '@/utils/vwap';
import { VerticalLine } from '@/utils/verticalLine';
import { withWhitespace } from '@/utils/chartSeriesData';
import { MeasurementPrimitive, type MeasurePoint } from '@/utils/measurementPrimitive';
import type { Timeframe } from '@/types/market';
import type { IndicatorConfig } from '@/types/indicators';
import { Maximize2, Ruler } from 'lucide-react';

interface Props {
  activeTimeframe: Timeframe;
  indicators: IndicatorConfig;
  onChartReady?: (chart: IChartApi, series: ISeriesApi<'Candlestick'>) => void;
  tradeLineDragMode?: 'risk' | 'all';
  tradeLineDragHitPx?: number;
}

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

// Create or remove a price line based on `visible`. Tolerates destroyed series.
function syncPriceLine(
  ref: React.MutableRefObject<IPriceLine | null>,
  series: ISeriesApi<'Candlestick'> | null,
  visible: boolean,
  opts: {
    price: number;
    color: string;
    lineWidth: LineWidth;
    lineStyle: LineStyle;
    axisLabelVisible: boolean;
    title: string;
  },
) {
  if (ref.current) {
    try { series?.removePriceLine(ref.current); } catch { /* chart may be mid-unmount */ }
    ref.current = null;
  }
  if (visible && series && isFinite(opts.price)) {
    ref.current = series.createPriceLine(opts);
  }
}

export function MainChart({
  activeTimeframe,
  indicators,
  onChartReady,
  tradeLineDragMode = 'risk',
  tradeLineDragHitPx = 7,
}: Props) {
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [hasMeasurement, setHasMeasurement] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef  = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const onChartReadyRef = useRef(onChartReady);
  onChartReadyRef.current = onChartReady;

  // Trade price lines
  const entryLineRef  = useRef<IPriceLine | null>(null);
  const stopLineRef   = useRef<IPriceLine | null>(null);
  const targetLineRef = useRef<IPriceLine | null>(null);

  const ibEndLineRef = useRef<VerticalLine | null>(null);

  // Indicator price lines
  const ibhLineRef     = useRef<IPriceLine | null>(null);
  const iblLineRef     = useRef<IPriceLine | null>(null);
  const sessionOpenRef = useRef<IPriceLine | null>(null);
  const priorCloseRef  = useRef<IPriceLine | null>(null);
  const priorHighRef   = useRef<IPriceLine | null>(null);
  const priorLowRef    = useRef<IPriceLine | null>(null);
  const priorVahRef    = useRef<IPriceLine | null>(null);
  const priorValRef    = useRef<IPriceLine | null>(null);
  const priorPocRef    = useRef<IPriceLine | null>(null);
  const currentVahRef  = useRef<IPriceLine | null>(null);
  const currentValRef  = useRef<IPriceLine | null>(null);
  const currentPocRef  = useRef<IPriceLine | null>(null);

  // VWAP + σ band overlay series (created once in chart init, data set/cleared per render)
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);
  const u1Ref   = useRef<ISeriesApi<'Line'> | null>(null);
  const l1Ref   = useRef<ISeriesApi<'Line'> | null>(null);
  const u15Ref  = useRef<ISeriesApi<'Line'> | null>(null);
  const l15Ref  = useRef<ISeriesApi<'Line'> | null>(null);
  const u2Ref   = useRef<ISeriesApi<'Line'> | null>(null);
  const l2Ref   = useRef<ISeriesApi<'Line'> | null>(null);
  const u3Ref   = useRef<ISeriesApi<'Line'> | null>(null);
  const l3Ref   = useRef<ISeriesApi<'Line'> | null>(null);

  // Drag state for SL/TP — accessed in stable event handlers via refs
  const draggingRef  = useRef<'entry' | 'stop' | 'target' | null>(null);
  const openTradeRef = useRef(useTradeStore.getState().openTrade);
  const measuringRef = useRef(false);
  const measureStartRef = useRef<MeasurePoint | null>(null);
  const measurementRef = useRef<MeasurementPrimitive | null>(null);

  const { candles, signals, currentIndex, priorDayStats } = useReplayStore();
  const { openTrade } = useTradeStore();
  const { tz } = useTimezoneStore();

  // Viewport-jump prevention
  const prevCandlesRef   = useRef<typeof candles | null>(null);
  const prevTimeframeRef = useRef(activeTimeframe);
  const prevBarCountRef  = useRef(0);
  const prevIndexRef     = useRef(currentIndex);

  // Keep openTradeRef current so the drag handler always sees the latest trade
  openTradeRef.current = openTrade;

  useEffect(() => {
    measuringRef.current = isMeasuring;
  }, [isMeasuring]);

  function clearMeasurement() {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const primitive = measurementRef.current;
    if (primitive) {
      try { primitive.clear(); } catch { /* chart may be mid-unmount */ }
    }
    if (primitive && series) {
      requestAnimationFrame(() => {
        try { series.detachPrimitive(primitive as never); } catch { /* chart may be mid-unmount */ }
      });
    }
    if (chart && containerRef.current) {
      try { chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight); } catch { /* chart may be mid-unmount */ }
    }
    measurementRef.current = null;
    measureStartRef.current = null;
    measuringRef.current = false;
    setIsMeasuring(false);
    setHasMeasurement(false);
  }

  function toggleMeasureMode() {
    if (isMeasuring || measurementRef.current) {
      clearMeasurement();
      return;
    }
    measureStartRef.current = null;
    measuringRef.current = true;
    setIsMeasuring(true);
    setHasMeasurement(false);
  }

  function fitChartContent() {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    try {
      series.priceScale().applyOptions({ autoScale: true });
      chart.timeScale().fitContent();
    } catch {
      /* chart may be mid-unmount */
    }
  }

  // ── Chart + overlay series creation (runs once on mount) ──────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const { timeFormatter, tickMarkFormatter } = makeTzOptions(useTimezoneStore.getState().tz);
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: { background: { color: '#0f1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#21262d', minimumWidth: 70 },
      localization: { timeFormatter },
      timeScale: { borderColor: '#21262d', timeVisible: true, secondsVisible: false, tickMarkFormatter, shiftVisibleRangeOnNewBar: false },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#3fb950',
      downColor: '#f85149',
      borderVisible: false,
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    });

    // Shared options: no price label, no last-value marker, no crosshair dot
    const lineBase = {
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    } as const;

    vwapRef.current = chart.addLineSeries({ ...lineBase, color: '#60a5fa',                lineWidth: 1 as LineWidth });
    u1Ref.current   = chart.addLineSeries({ ...lineBase, color: 'rgba(96,165,250,0.55)',  lineWidth: 1 as LineWidth });
    l1Ref.current   = chart.addLineSeries({ ...lineBase, color: 'rgba(96,165,250,0.55)',  lineWidth: 1 as LineWidth });
    u15Ref.current  = chart.addLineSeries({ ...lineBase, color: 'rgba(96,165,250,0.40)',  lineWidth: 1 as LineWidth });
    l15Ref.current  = chart.addLineSeries({ ...lineBase, color: 'rgba(96,165,250,0.40)',  lineWidth: 1 as LineWidth });
    u2Ref.current   = chart.addLineSeries({ ...lineBase, color: 'rgba(96,165,250,0.28)',  lineWidth: 1 as LineWidth });
    l2Ref.current   = chart.addLineSeries({ ...lineBase, color: 'rgba(96,165,250,0.28)',  lineWidth: 1 as LineWidth });
    u3Ref.current   = chart.addLineSeries({ ...lineBase, color: 'rgba(96,165,250,0.15)',  lineWidth: 1 as LineWidth });
    l3Ref.current   = chart.addLineSeries({ ...lineBase, color: 'rgba(96,165,250,0.15)',  lineWidth: 1 as LineWidth });

    chartRef.current  = chart;
    seriesRef.current = series;
    onChartReadyRef.current?.(chart, series);

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = seriesRef.current = null;
      measurementRef.current = null;
      measureStartRef.current = null;
      vwapRef.current = u1Ref.current = l1Ref.current =
        u15Ref.current = l15Ref.current = u2Ref.current = l2Ref.current =
        u3Ref.current = l3Ref.current = null;
      ibhLineRef.current = iblLineRef.current = sessionOpenRef.current =
        priorCloseRef.current = priorHighRef.current = priorLowRef.current =
        priorVahRef.current = priorValRef.current = priorPocRef.current =
        currentVahRef.current = currentValRef.current = currentPocRef.current =
        entryLineRef.current = stopLineRef.current = targetLineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timezone ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const { timeFormatter, tickMarkFormatter } = makeTzOptions(tz);
    chart.applyOptions({ localization: { timeFormatter } });
    chart.timeScale().applyOptions({ tickMarkFormatter } as never);
  }, [tz]);

  // ── Candlestick data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const fullReload =
      prevCandlesRef.current !== candles || prevTimeframeRef.current !== activeTimeframe;
    prevCandlesRef.current   = candles;
    prevTimeframeRef.current = activeTimeframe;

    const slice      = candles.slice(0, currentIndex + 1);
    const fullBars   = activeTimeframe === '22R'
      ? computeRangeBars(candles)
      : aggregateCandles(candles, activeTimeframe);
    const visible = activeTimeframe === '22R'
      ? computeRangeBars(slice)
      : aggregateCandles(slice, activeTimeframe);
    const mappedActual = visible.map(
      (c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }),
    ) satisfies CandlestickData[];
    const mapped = withWhitespace(mappedActual, fullBars.map((bar) => bar.time as Time));

    const savedRange = chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;
    seriesRef.current.setData(mapped);

    if (savedRange) {
      const revealedCount = mappedActual.length;
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
    prevBarCountRef.current = mappedActual.length;
    prevIndexRef.current = currentIndex;
  }, [currentIndex, candles, activeTimeframe]);

  // Clear measurement on session/timeframe changes.
  useEffect(() => {
    clearMeasurement();
  }, [candles, activeTimeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Signal markers ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    const currentTime = candles[currentIndex]?.time ?? 0;
    seriesRef.current.setMarkers(
      signals
        .filter((s) => s.timestamp <= currentTime)
        .map((s) => ({
          time: s.timestamp as Time,
          position: s.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: s.direction === 'long' ? '#58a6ff' : '#f85149',
          shape: s.direction === 'long' ? 'arrowUp' : 'arrowDown',
          text: s.setup_name,
        })),
    );
  }, [currentIndex, signals, candles]);

  // ── Trade price lines ──────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (entryLineRef.current)  { try { series.removePriceLine(entryLineRef.current);  } catch { /* chart may be mid-unmount */ } entryLineRef.current  = null; }
    if (stopLineRef.current)   { try { series.removePriceLine(stopLineRef.current);   } catch { /* chart may be mid-unmount */ } stopLineRef.current   = null; }
    if (targetLineRef.current) { try { series.removePriceLine(targetLineRef.current); } catch { /* chart may be mid-unmount */ } targetLineRef.current = null; }
    if (!openTrade) return;
    entryLineRef.current = series.createPriceLine({
      price: openTrade.entry_price, color: '#58a6ff', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Solid, axisLabelVisible: true,
      title: `Entry ${openTrade.direction.toUpperCase()}`,
    });
    stopLineRef.current = series.createPriceLine({
      price: openTrade.stop_price, color: '#f85149', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Stop',
    });
    targetLineRef.current = series.createPriceLine({
      price: openTrade.target_price, color: '#3fb950', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Target',
    });
  }, [openTrade]);

  // ── IBH / IBL ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    const ib = indicators.showIBHL ? computeIB(candles) : null;
    syncPriceLine(ibhLineRef, series, !!ib, {
      price: ib?.ibh ?? 0, color: '#4ade80', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'IBH',
    });
    syncPriceLine(iblLineRef, series, !!ib, {
      price: ib?.ibl ?? 0, color: '#4ade80', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'IBL',
    });
  }, [candles, indicators.showIBHL]);

  // ── IB end vertical line (1h after session open) ───────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    const chart  = chartRef.current;
    if (ibEndLineRef.current && series) {
      try { series.detachPrimitive(ibEndLineRef.current as never); } catch { /* chart may be mid-unmount */ }
      ibEndLineRef.current = null;
    }
    if (indicators.showIBHL && candles.length > 0 && series && chart) {
      const line = new VerticalLine(chart, (candles[0].time + 3600) as Time, 'rgba(74,222,128,0.5)', 5);
      ibEndLineRef.current = line;
      series.attachPrimitive(line as never);
    }
  }, [indicators.showIBHL, candles]);

  // ── Session Open ───────────────────────────────────────────────────────────
  useEffect(() => {
    syncPriceLine(sessionOpenRef, seriesRef.current, indicators.showSessionOpen && candles.length > 0, {
      price: candles[0]?.open ?? 0, color: '#fbbf24', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'Open',
    });
  }, [candles, indicators.showSessionOpen]);

  // ── Prior Day Close ────────────────────────────────────────────────────────
  useEffect(() => {
    syncPriceLine(priorCloseRef, seriesRef.current, indicators.showPriorClose && !!priorDayStats, {
      price: priorDayStats?.close ?? 0, color: '#f97316', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'PDC',
    });
  }, [priorDayStats, indicators.showPriorClose]);

  // ── Prior Day H / L ────────────────────────────────────────────────────────
  useEffect(() => {
    const show = indicators.showPriorHL && !!priorDayStats;
    syncPriceLine(priorHighRef, seriesRef.current, show, {
      price: priorDayStats?.high ?? 0, color: '#f87171', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'PDH',
    });
    syncPriceLine(priorLowRef, seriesRef.current, show, {
      price: priorDayStats?.low ?? 0, color: '#f87171', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'PDL',
    });
  }, [priorDayStats, indicators.showPriorHL]);

  // ── Prior Day VAH / VAL / POC ──────────────────────────────────────────────
  useEffect(() => {
    const show = indicators.showPriorVP && !!priorDayStats;
    syncPriceLine(priorVahRef, seriesRef.current, show, {
      price: priorDayStats?.vah ?? 0, color: '#34d399', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'pVAH',
    });
    syncPriceLine(priorValRef, seriesRef.current, show, {
      price: priorDayStats?.val ?? 0, color: '#f87171', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'pVAL',
    });
    syncPriceLine(priorPocRef, seriesRef.current, show, {
      price: priorDayStats?.poc ?? 0, color: '#a78bfa', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'pPOC',
    });
  }, [priorDayStats, indicators.showPriorVP]);

  // ── Current Day VAH / VAL / POC (updates each replay step) ────────────────
  useEffect(() => {
    const visible = candles.slice(0, currentIndex + 1);
    let va = null;
    if (indicators.showCurrentVP && visible.length > 0) {
      va = computeVolumeAreaStats(computeVolumeProfile(visible));
    }
    syncPriceLine(currentVahRef, seriesRef.current, !!va, {
      price: va?.vah ?? 0, color: '#86efac', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'VAH',
    });
    syncPriceLine(currentValRef, seriesRef.current, !!va, {
      price: va?.val ?? 0, color: '#fca5a5', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'VAL',
    });
    syncPriceLine(currentPocRef, seriesRef.current, !!va, {
      price: va?.poc ?? 0, color: '#fde68a', lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'POC',
    });
  }, [candles, currentIndex, indicators.showCurrentVP]);

  // ── VWAP + σ bands ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!vwapRef.current) return;

    if (!indicators.showVWAP) {
      vwapRef.current.setData([]);
      u1Ref.current?.setData([]);  l1Ref.current?.setData([]);
      u15Ref.current?.setData([]); l15Ref.current?.setData([]);
      u2Ref.current?.setData([]);  l2Ref.current?.setData([]);
      u3Ref.current?.setData([]);  l3Ref.current?.setData([]);
      return;
    }

    const bars = computeVwap(candles.slice(0, currentIndex + 1));
    vwapRef.current.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap })));
    u1Ref.current?.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap + b.sd1 })));
    l1Ref.current?.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap - b.sd1 })));
    u15Ref.current?.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap + b.sd1_5 })));
    l15Ref.current?.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap - b.sd1_5 })));
    u2Ref.current?.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap + b.sd2 })));
    l2Ref.current?.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap - b.sd2 })));
    u3Ref.current?.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap + b.sd3 })));
    l3Ref.current?.setData(bars.map((b) => ({ time: b.time as Time, value: b.vwap - b.sd3 })));
  }, [candles, currentIndex, indicators.showVWAP]);

  // ── Trade line drag ────────────────────────────────────────────────────────
  // pointerdown with {capture:true} fires before the LW Charts canvas listener,
  // so e.stopPropagation() prevents the chart from starting a pan operation.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chartEl = el;

    function hitTest(clientY: number): 'entry' | 'stop' | 'target' | null {
      const series = seriesRef.current;
      const trade  = openTradeRef.current;
      if (!series || !trade) return null;
      const y = clientY - chartEl.getBoundingClientRect().top;
      type P = Parameters<typeof series.priceToCoordinate>[0];
      const entryY  = series.priceToCoordinate(trade.entry_price as P) as unknown as number | null;
      const stopY   = series.priceToCoordinate(trade.stop_price   as P) as unknown as number | null;
      const targetY = series.priceToCoordinate(trade.target_price as P) as unknown as number | null;
      if (tradeLineDragMode === 'all' && entryY !== null && Math.abs(y - entryY) <= tradeLineDragHitPx) return 'entry';
      if (stopY   !== null && Math.abs(y - stopY)   <= tradeLineDragHitPx) return 'stop';
      if (targetY !== null && Math.abs(y - targetY) <= tradeLineDragHitPx) return 'target';
      return null;
    }

    function onPointerDown(e: PointerEvent) {
      const hit = hitTest(e.clientY);
      if (!hit) return;
      e.stopPropagation(); // block chart pan
      e.preventDefault();
      draggingRef.current = hit;
      chartEl.style.cursor = 'ns-resize';
      try { chartEl.setPointerCapture(e.pointerId); } catch { /* pointer may not be capturable */ }
    }

    function onPointerMove(e: PointerEvent) {
      if (draggingRef.current) {
        const series = seriesRef.current;
        if (!series) return;
        e.preventDefault();
        const y   = e.clientY - chartEl.getBoundingClientRect().top;
        type C = Parameters<typeof series.coordinateToPrice>[0];
        const raw = series.coordinateToPrice(y as C);
        if (raw === null) return;
        const price = Math.round((raw as unknown as number) * 4) / 4; // snap to 0.25 pt tick
        if (draggingRef.current === 'entry') {
          useTradeStore.getState().updateEntryPrice(price);
        } else if (draggingRef.current === 'stop') {
          useTradeStore.getState().updateStopPrice(price);
        } else {
          useTradeStore.getState().updateTargetPrice(price);
        }
      } else {
        chartEl.style.cursor = hitTest(e.clientY) ? 'ns-resize' : '';
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (draggingRef.current) {
        draggingRef.current = null;
        chartEl.style.cursor = '';
        try { chartEl.releasePointerCapture(e.pointerId); } catch { /* pointer may not be captured */ }
      }
    }

    chartEl.addEventListener('pointerdown', onPointerDown, { capture: true });
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    return () => {
      chartEl.removeEventListener('pointerdown', onPointerDown, { capture: true });
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  }, [tradeLineDragHitPx, tradeLineDragMode]);

  // ── Measurement clicks ─────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    function pointFromClick(param: MouseEventParams<Time>): MeasurePoint | null {
      if (!param.point) return null;
      const rawPrice = series!.coordinateToPrice(param.point.y as never);
      const rawLogical =
        param.logical ?? chart!.timeScale().coordinateToLogical(param.point.x);
      if (rawPrice === null || rawLogical === null || rawLogical === undefined) return null;
      return {
        logical: rawLogical as Logical,
        price: rawPrice as unknown as number,
      };
    }

    function onClick(param: MouseEventParams<Time>) {
      if (!measuringRef.current) return;
      const point = pointFromClick(param);
      if (!point) return;

      const start = measureStartRef.current;
      if (!start) {
        measureStartRef.current = point;
        const primitive = new MeasurementPrimitive(chart!, series!, point, null);
        measurementRef.current = primitive;
        series!.attachPrimitive(primitive as never);
        setHasMeasurement(true);
        return;
      }

      measurementRef.current?.update(start, point);
      measureStartRef.current = null;
      measuringRef.current = false;
      setIsMeasuring(false);
      setHasMeasurement(true);
    }

    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <button
        type="button"
        onClick={fitChartContent}
        className="absolute right-[76px] top-3 z-10 grid h-6 w-6 place-items-center rounded border border-white/10 bg-[#131720]/75 text-gray-500 opacity-45 shadow-sm backdrop-blur-sm transition hover:border-blue-400/50 hover:text-blue-300 hover:opacity-100"
        title="Fit chart"
        aria-label="Fit chart"
      >
        <Maximize2 size={13} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onClick={toggleMeasureMode}
        className={[
          'absolute right-[108px] top-3 z-10 grid h-6 w-6 place-items-center rounded border bg-[#131720]/75 shadow-sm backdrop-blur-sm transition hover:border-blue-400/50 hover:text-blue-300 hover:opacity-100',
          isMeasuring || hasMeasurement
            ? 'border-blue-400/40 text-blue-300 opacity-90'
            : 'border-white/10 text-gray-500 opacity-45',
        ].join(' ')}
        title={isMeasuring || hasMeasurement ? 'Clear measurement' : 'Measure'}
        aria-label={isMeasuring || hasMeasurement ? 'Clear measurement' : 'Measure'}
      >
        <Ruler size={13} strokeWidth={1.8} />
      </button>
      <span className="absolute top-2 left-2 text-[11px] text-gray-600 pointer-events-none select-none">
        NQ · {activeTimeframe} · Candles
      </span>
    </div>
  );
}
