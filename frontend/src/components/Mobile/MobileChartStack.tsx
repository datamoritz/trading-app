import { useCallback, useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, LogicalRange } from 'lightweight-charts';
import { MainChart } from '@/components/Chart/MainChart';
import { VolumeChart } from '@/components/Chart/VolumeChart';
import { DeltaChart } from '@/components/Chart/DeltaChart';
import { VolumeProfile } from '@/components/Chart/VolumeProfile';
import type { IndicatorConfig } from '@/types/indicators';
import type { Timeframe } from '@/types/market';

interface Props {
  timeframe: Timeframe;
  indicators: IndicatorConfig;
  showVolume: boolean;
  showDelta: boolean;
  showVolumeProfile: boolean;
}

export function MobileChartStack({
  timeframe,
  indicators,
  showVolume,
  showDelta,
  showVolumeProfile,
}: Props) {
  const mainChartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const deltaChartRef = useRef<IChartApi | null>(null);
  const deltaSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const syncingRef = useRef(false);
  const cleanupSyncRef = useRef<(() => void) | null>(null);
  const cleanupDeltaTimeSyncRef = useRef<(() => void) | null>(null);

  const [mainChart, setMainChart] = useState<IChartApi | null>(null);
  const [mainSeries, setMainSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);

  function applySync() {
    cleanupSyncRef.current?.();
    cleanupSyncRef.current = null;

    const charts = [mainChartRef.current, volumeChartRef.current].filter(
      Boolean,
    ) as IChartApi[];
    if (charts.length < 2) return;

    const handlers = charts.map((source, sourceIndex) => () => {
      if (syncingRef.current) return;
      const range = source.timeScale().getVisibleLogicalRange() as LogicalRange | null;
      if (!range) return;

      syncingRef.current = true;
      charts.forEach((target, targetIndex) => {
        if (targetIndex === sourceIndex) return;
        try { target.timeScale().setVisibleLogicalRange(range); } catch { /* chart may be mid-unmount */ }
      });
      syncingRef.current = false;
    });

    charts.forEach((chart, index) => {
      (chart.timeScale().subscribeVisibleLogicalRangeChange as (handler: () => void) => void)(handlers[index]);
    });

    cleanupSyncRef.current = () => {
      charts.forEach((chart, index) => {
        try {
          (chart.timeScale().unsubscribeVisibleLogicalRangeChange as (handler: () => void) => void)(handlers[index]);
        } catch {
          /* chart may be mid-unmount */
        }
      });
    };
  }

  function applyDeltaTimeSync() {
    cleanupDeltaTimeSyncRef.current?.();
    cleanupDeltaTimeSyncRef.current = null;

    const main = mainChartRef.current;
    const delta = deltaChartRef.current;
    if (!main || !delta) return;

    const syncDeltaToMainTime = () => {
      const range = main.timeScale().getVisibleRange();
      if (!range) return;
      try { delta.timeScale().setVisibleRange(range); } catch { /* chart may be mid-unmount */ }
    };

    main.timeScale().subscribeVisibleTimeRangeChange(syncDeltaToMainTime);
    cleanupDeltaTimeSyncRef.current = () => {
      try { main.timeScale().unsubscribeVisibleTimeRangeChange(syncDeltaToMainTime); } catch { /* chart may be mid-unmount */ }
    };
    requestAnimationFrame(syncDeltaToMainTime);
  }

  useEffect(() => {
    if (!showVolume) {
      volumeChartRef.current = null;
      volumeSeriesRef.current = null;
    }
    applySync();
  }, [showVolume]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showDelta) {
      deltaChartRef.current = null;
      deltaSeriesRef.current = null;
      cleanupDeltaTimeSyncRef.current?.();
      cleanupDeltaTimeSyncRef.current = null;
    }
    applySync();
    applyDeltaTimeSync();
  }, [showDelta]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMainChartReady = useCallback((chart: IChartApi, series: ISeriesApi<'Candlestick'>) => {
    mainChartRef.current = chart;
    mainSeriesRef.current = series;
    setMainChart(chart);
    setMainSeries(series);
    applySync();
    applyDeltaTimeSync();

    chart.subscribeCrosshairMove((param) => {
      const volumeChart = volumeChartRef.current;
      const volumeSeries = volumeSeriesRef.current;
      const deltaChart = deltaChartRef.current;
      const deltaSeries = deltaSeriesRef.current;

      if (param.time === undefined || param.point === undefined) {
        if (volumeChart && volumeSeries) {
          try { volumeChart.clearCrosshairPosition(); } catch { /* chart may be mid-unmount */ }
        }
        if (deltaChart && deltaSeries) {
          try { deltaChart.clearCrosshairPosition(); } catch { /* chart may be mid-unmount */ }
        }
        return;
      }

      if (volumeChart && volumeSeries) {
        try { volumeChart.setCrosshairPosition(0, param.time, volumeSeries); } catch { /* chart may be mid-unmount */ }
      }
      if (deltaChart && deltaSeries) {
        try { deltaChart.setCrosshairPosition(0, param.time, deltaSeries); } catch { /* chart may be mid-unmount */ }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVolumeChartReady = useCallback((chart: IChartApi, series: ISeriesApi<'Histogram'>) => {
    volumeChartRef.current = chart;
    volumeSeriesRef.current = series;
    applySync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeltaChartReady = useCallback((chart: IChartApi, series: ISeriesApi<'Candlestick'>) => {
    deltaChartRef.current = chart;
    deltaSeriesRef.current = series;
    applySync();
    applyDeltaTimeSync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0">
          <div className="min-w-0 flex-1">
            <MainChart
              activeTimeframe={timeframe}
              indicators={indicators}
              onChartReady={handleMainChartReady}
              tradeLineDragMode="all"
              tradeLineDragHitPx={18}
            />
          </div>
          {showVolumeProfile && (
            <VolumeProfile
              width={54}
              mainChart={mainChart}
              mainSeries={mainSeries}
              indicators={indicators}
            />
          )}
        </div>
      </div>

      {showVolume && (
        <div className="h-24 shrink-0 border-t border-border">
          <VolumeChart
            activeTimeframe={timeframe}
            showIBEnd={indicators.showIBHL}
            onChartReady={handleVolumeChartReady}
          />
        </div>
      )}

      {showDelta && (
        <div className="h-28 shrink-0 border-t border-border">
          <DeltaChart
            activeTimeframe="22R"
            isRangeMode
            onToggleRangeMode={() => {}}
            onChartReady={handleDeltaChartReady}
            showRangeToggle={false}
          />
        </div>
      )}
    </div>
  );
}
