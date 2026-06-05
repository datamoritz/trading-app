import { useEffect, useRef, useState, useCallback } from 'react';
import type { IChartApi, ISeriesApi, LogicalRange } from 'lightweight-charts';
import { MainChart } from './MainChart';
import { VolumeProfile } from './VolumeProfile';
import { DeltaChart } from './DeltaChart';
import { VolumeChart } from './VolumeChart';
import { IndicatorMenu } from './IndicatorMenu';
import type { Timeframe } from '@/types/market';
import type { IndicatorConfig } from '@/types/indicators';
import { DEFAULT_INDICATORS } from '@/types/indicators';
import { cn } from '@/lib/utils';
import { useReplayStore } from '@/stores/replayStore';

type MainTimeframe = Exclude<Timeframe, '22R'>;

const TIMEFRAMES: MainTimeframe[] = ['1m', '5m', '1h'];

const DELTA_H_MIN  = 60;
const DELTA_H_MAX  = 500;
const VOLUME_H_MIN = 40;
const VOLUME_H_MAX = 300;
const VP_W_MIN     = 80;
const VP_W_MAX     = 320;

interface Props {
  chartId: string;
  onRemove?: () => void;   // undefined → only chart in grid, no × button
  onAddChart?: () => void; // undefined → already at max 4 charts
}

export function ChartContainer({ onRemove, onAddChart }: Props) {
  // Per-chart state (previously in chartStore, now local)
  const [activeTimeframe, setTimeframe] = useState<MainTimeframe>('1m');
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [showDelta, setShowDelta] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const [deltaRangeMode, setDeltaRangeMode] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorConfig>(DEFAULT_INDICATORS);

  const [deltaHeight, setDeltaHeight]   = useState(150);
  const [volumeHeight, setVolumeHeight] = useState(100);
  const [vpWidth, setVpWidth]           = useState(120);
  const { currentIndex } = useReplayStore();

  // Sync refs
  const mainChartRef    = useRef<IChartApi | null>(null);
  const deltaChartRef   = useRef<IChartApi | null>(null);
  const volumeChartRef  = useRef<IChartApi | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const deltaSeriesRef  = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const syncingRef      = useRef(false);
  const cleanupSyncRef  = useRef<(() => void) | null>(null);
  const cleanupDeltaTimeSyncRef = useRef<(() => void) | null>(null);

  // State copies passed as props so VolumeProfile re-renders when chart is ready
  const [mainChart,  setMainChart]  = useState<IChartApi | null>(null);
  const [mainSeries, setMainSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);

  function toggleIndicator(key: keyof IndicatorConfig) {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleDeltaRangeMode() {
    setDeltaRangeMode((prev) => {
      if (!prev) {
        cleanupSyncRef.current?.();
        cleanupSyncRef.current = null;
      } else {
        cleanupDeltaTimeSyncRef.current?.();
        cleanupDeltaTimeSyncRef.current = null;
      }
      return !prev;
    });
  }

  function applySync(charts: IChartApi[]) {
    cleanupSyncRef.current?.();
    cleanupSyncRef.current = null;
    if (charts.length < 2) return;

    const handlers: Array<() => void> = charts.map((source, si) => () => {
      if (syncingRef.current) return;
      const range = source.timeScale().getVisibleLogicalRange() as LogicalRange | null;
      if (!range) return;
      syncingRef.current = true;
      charts.forEach((target, ti) => {
        if (ti !== si) try { target.timeScale().setVisibleLogicalRange(range); } catch { /* chart may be mid-unmount */ }
      });
      syncingRef.current = false;
    });

    charts.forEach((chart, i) => {
      (chart.timeScale().subscribeVisibleLogicalRangeChange as (h: () => void) => void)(handlers[i]);
    });

    cleanupSyncRef.current = () => {
      charts.forEach((chart, i) => {
        try { (chart.timeScale().unsubscribeVisibleLogicalRangeChange as (h: () => void) => void)(handlers[i]); } catch { /* chart may be mid-unmount */ }
      });
    };
  }

  function applyDeltaTimeSync() {
    cleanupDeltaTimeSyncRef.current?.();
    cleanupDeltaTimeSyncRef.current = null;

    if (!deltaRangeMode) return;
    const main = mainChartRef.current;
    const delta = deltaChartRef.current;
    if (!main || !delta) return;

    const syncDeltaToMainTime = syncDeltaRangeToMain;

    main.timeScale().subscribeVisibleTimeRangeChange(syncDeltaToMainTime);
    cleanupDeltaTimeSyncRef.current = () => {
      try { main.timeScale().unsubscribeVisibleTimeRangeChange(syncDeltaToMainTime); } catch { /* chart may be mid-unmount */ }
    };
    requestAnimationFrame(syncDeltaToMainTime);
  }

  function syncDeltaRangeToMain() {
    if (!deltaRangeMode) return;
    const main = mainChartRef.current;
    const delta = deltaChartRef.current;
    if (!main || !delta) return;
    const range = main.timeScale().getVisibleRange();
    if (!range) return;
    try { delta.timeScale().setVisibleRange(range); } catch { /* chart may be mid-unmount */ }
  }

  function recheckSync() {
    const charts: IChartApi[] = [];
    if (mainChartRef.current)   charts.push(mainChartRef.current);
    if (volumeChartRef.current) charts.push(volumeChartRef.current);
    if (!deltaRangeMode && deltaChartRef.current) charts.push(deltaChartRef.current);
    applySync(charts);
    applyDeltaTimeSync();

    // After wiring subscriptions, align all charts to main's current range.
    // rAF ensures this runs after child data effects (setData calls) complete.
    const main = mainChartRef.current;
    if (main && charts.length >= 2) {
      requestAnimationFrame(() => {
        const range = main.timeScale().getVisibleLogicalRange();
        if (range) {
          charts.forEach((chart) => {
            if (chart !== main) try { chart.timeScale().setVisibleLogicalRange(range); } catch { /* chart may be mid-unmount */ }
          });
        }
      });
    }
  }

  useEffect(() => {
    if (showVolume) return;
    volumeChartRef.current = null;
    volumeSeriesRef.current = null;
    recheckSync();
  }, [showVolume]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showDelta) return;
    deltaChartRef.current = null;
    deltaSeriesRef.current = null;
    cleanupDeltaTimeSyncRef.current?.();
    cleanupDeltaTimeSyncRef.current = null;
    recheckSync();
  }, [showDelta]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    recheckSync();
  }, [deltaRangeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(syncDeltaRangeToMain));
  }, [currentIndex, activeTimeframe, deltaRangeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMainChartReady = useCallback(
    (chart: IChartApi, series: ISeriesApi<'Candlestick'>) => {
      mainChartRef.current = chart;
      setMainChart(chart);
      setMainSeries(series);
      recheckSync();

      chart.subscribeCrosshairMove((param) => {
        const volChart  = volumeChartRef.current;
        const volSeries = volumeSeriesRef.current;
        const deltaChart = deltaChartRef.current;
        const deltaSeries = deltaSeriesRef.current;
        if (param.time === undefined || param.point === undefined) {
          if (volChart && volSeries) {
            try { volChart.clearCrosshairPosition(); } catch { /* chart may be mid-unmount */ }
          }
          if (deltaChart && deltaSeries) {
            try { deltaChart.clearCrosshairPosition(); } catch { /* chart may be mid-unmount */ }
          }
        } else {
          if (volChart && volSeries) {
            try { volChart.setCrosshairPosition(0, param.time, volSeries); } catch { /* chart may be mid-unmount */ }
          }
          if (deltaChart && deltaSeries) {
            try { deltaChart.setCrosshairPosition(0, param.time, deltaSeries); } catch { /* chart may be mid-unmount */ }
          }
        }
      });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleVolumeChartReady = useCallback((chart: IChartApi, series: ISeriesApi<'Histogram'>) => {
    volumeChartRef.current  = chart;
    volumeSeriesRef.current = series;
    recheckSync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeltaChartReady = useCallback((chart: IChartApi, series: ISeriesApi<'Candlestick'>) => {
    deltaChartRef.current = chart;
    deltaSeriesRef.current = series;
    recheckSync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startDeltaResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = deltaHeight;
    const onMove = (ev: MouseEvent) =>
      setDeltaHeight(Math.max(DELTA_H_MIN, Math.min(DELTA_H_MAX, startH + startY - ev.clientY)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startVolumeResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = volumeHeight;
    const onMove = (ev: MouseEvent) =>
      setVolumeHeight(Math.max(VOLUME_H_MIN, Math.min(VOLUME_H_MAX, startH + startY - ev.clientY)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startVpResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = vpWidth;
    const onMove = (ev: MouseEvent) =>
      setVpWidth(Math.max(VP_W_MIN, Math.min(VP_W_MAX, startW + startX - ev.clientX)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 h-full">

      {/* ── Toolbar ── */}
      <div className="h-8 flex items-center gap-2 px-2 border-b border-border bg-panel shrink-0">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              'px-2 py-0.5 rounded text-xs border',
              tf === activeTimeframe
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'border-border text-gray-400 hover:text-gray-200',
            )}
          >
            {tf}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowVolumeProfile((v) => !v)}
          className={cn('px-2 py-0.5 rounded text-xs border',
            showVolumeProfile ? 'border-blue-500 text-blue-400' : 'border-border text-gray-500')}
        >VP</button>
        <button
          onClick={() => setShowVolume((v) => !v)}
          className={cn('px-2 py-0.5 rounded text-xs border',
            showVolume ? 'border-blue-500 text-blue-400' : 'border-border text-gray-500')}
        >Vol</button>
        <button
          onClick={() => setShowDelta((v) => !v)}
          className={cn('px-2 py-0.5 rounded text-xs border',
            showDelta ? 'border-blue-500 text-blue-400' : 'border-border text-gray-500')}
        >Δ</button>
        <IndicatorMenu indicators={indicators} onToggle={toggleIndicator} />
        {onAddChart && (
          <button
            onClick={onAddChart}
            className="px-2 py-0.5 rounded text-xs border border-border text-gray-500 hover:text-gray-200 hover:border-gray-400"
            title="Add chart"
          >+</button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="px-2 py-0.5 rounded text-xs border border-border text-gray-500 hover:text-red-400 hover:border-red-500"
            title="Remove chart"
          >×</button>
        )}
      </div>

      {/* ── Main chart row: [candlestick chart] [VP handle] [VP] ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        <div className="flex-1 overflow-hidden min-h-0">
          <MainChart
            activeTimeframe={activeTimeframe}
            indicators={indicators}
            onChartReady={handleMainChartReady}
          />
        </div>

        {showVolumeProfile && (
          <>
            <div
              className="relative w-2 shrink-0 cursor-col-resize bg-panel group"
              onMouseDown={startVpResize}
            >
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border group-hover:bg-blue-500 transition-colors" />
            </div>
            <VolumeProfile
              width={vpWidth}
              mainChart={mainChart}
              mainSeries={mainSeries}
              indicators={indicators}
            />
          </>
        )}
      </div>

      {/* ── Volume resize handle ── */}
      {showVolume && (
        <div className="flex shrink-0">
          <div
            className="relative flex-1 h-2 cursor-row-resize bg-panel group"
            onMouseDown={startVolumeResize}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border group-hover:bg-blue-500 transition-colors" />
          </div>
          {showVolumeProfile && <div className="shrink-0 bg-surface" style={{ width: vpWidth + 8 }} />}
        </div>
      )}

      {/* ── Volume chart ── */}
      {showVolume && (
        <div className="flex shrink-0 overflow-hidden" style={{ height: volumeHeight }}>
          <div className="flex-1 overflow-hidden min-w-0">
            <VolumeChart activeTimeframe={activeTimeframe} showIBEnd={indicators.showIBHL} onChartReady={handleVolumeChartReady} />
          </div>
          {showVolumeProfile && <div className="shrink-0 bg-surface" style={{ width: vpWidth + 8 }} />}
        </div>
      )}

      {/* ── Delta resize handle ── */}
      {showDelta && (
        <div className="flex shrink-0">
          <div
            className="relative flex-1 h-2 cursor-row-resize bg-panel group"
            onMouseDown={startDeltaResize}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border group-hover:bg-blue-500 transition-colors" />
          </div>
          {showVolumeProfile && <div className="shrink-0 bg-surface" style={{ width: vpWidth + 8 }} />}
        </div>
      )}

      {/* ── Delta chart ── */}
      {showDelta && (
        <div className="flex shrink-0 overflow-hidden" style={{ height: deltaHeight }}>
          <div className="flex-1 overflow-hidden min-w-0">
            <DeltaChart
              activeTimeframe={deltaRangeMode ? '22R' : activeTimeframe}
              isRangeMode={deltaRangeMode}
              onToggleRangeMode={toggleDeltaRangeMode}
              onChartReady={handleDeltaChartReady}
            />
          </div>
          {showVolumeProfile && <div className="shrink-0 bg-surface" style={{ width: vpWidth + 8 }} />}
        </div>
      )}

    </div>
  );
}
