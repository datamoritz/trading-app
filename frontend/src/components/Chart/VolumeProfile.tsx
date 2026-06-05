import { useCallback, useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useReplayStore } from '@/stores/replayStore';
import { computeVolumeProfile } from '@/utils/volumeProfile';
import { computeVolumeAreaStats } from '@/utils/marketProfile';
import type { IndicatorConfig } from '@/types/indicators';
import type { VolumeAreaStats } from '@/types/indicators';

interface Props {
  width: number;
  mainChart: IChartApi | null;
  mainSeries: ISeriesApi<'Candlestick'> | null;
  indicators: IndicatorConfig;
}

type CrosshairParam = { point?: { x: number; y: number } };
type CrosshairHandler = (param: CrosshairParam) => void;

export function VolumeProfile({ width, mainChart, mainSeries, indicators }: Props) {
  const bodyRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const bodyHRef        = useRef(0);
  const rafRef          = useRef(0);
  const crosshairYRef   = useRef<number | null>(null);
  const vpMapRef        = useRef<Map<number, number> | null>(null);
  const currentPriceRef = useRef<number | null>(null);
  const mainSeriesRef   = useRef(mainSeries);
  const widthRef        = useRef(width);
  mainSeriesRef.current = mainSeries;
  widthRef.current      = width;

  // Keep latest indicator + store values in refs for use inside stable callbacks
  const indicatorsRef   = useRef(indicators);
  indicatorsRef.current = indicators;

  const { candles, currentIndex, priorDayStats } = useReplayStore();
  const priorDayStatsRef = useRef(priorDayStats);
  priorDayStatsRef.current = priorDayStats;

  // Current-session VA stats (recomputed when candles/index change)
  const currentVARef = useRef<VolumeAreaStats | null>(null);

  // ── Drawing ────────────────────────────────────────────────────────────────
  const drawRef = useRef(() => {});
  drawRef.current = function draw() {
    const canvas  = canvasRef.current;
    const series  = mainSeriesRef.current;
    const vpMap   = vpMapRef.current;
    const bodyH   = bodyHRef.current;
    const drawW   = Math.max(0, widthRef.current - 4);
    const ind     = indicatorsRef.current;
    const prior   = priorDayStatsRef.current;
    const currentVA = currentVARef.current;

    if (!canvas || !series || !vpMap || bodyH === 0 || drawW === 0) return;

    const dpr = window.devicePixelRatio ?? 1;
    const cw  = Math.round(drawW * dpr);
    const ch  = Math.round(bodyH * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width  = cw;
      canvas.height = ch;
      canvas.style.width  = `${drawW}px`;
      canvas.style.height = `${bodyH}px`;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawW, bodyH);

    const maxVol = Math.max(...vpMap.values());
    if (maxVol === 0) return;

    // Helper: convert price → canvas y coordinate via the main series price scale
    const toY = (price: number): number | null => {
      const y = series.priceToCoordinate(price as Parameters<typeof series.priceToCoordinate>[0]);
      return y === null ? null : y as unknown as number;
    };

    // ── VP bars ──────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(59, 130, 246, 0.60)';
    for (const [key, vol] of vpMap) {
      const price = key / 4;
      const yNum  = toY(price);
      if (yNum === null || yNum < 0 || yNum > bodyH) continue;

      const yNext = toY(price + 0.25);
      const bh    = yNext !== null ? Math.max(1, Math.abs(yNext - yNum)) : 1;
      const bw    = (vol / maxVol) * drawW;
      if (bw < 0.3) continue;
      ctx.fillRect(0, yNum, bw, bh);
    }

    // ── Horizontal level helper ───────────────────────────────────────────────
    function drawHLine(price: number, color: string, dash: number[]) {
      const y = toY(price);
      if (y === null || y < 0 || y > bodyH) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(drawW, y);
      ctx.stroke();
      ctx.restore();
    }

    // ── Current day VA ────────────────────────────────────────────────────────
    if (ind.showCurrentVP && currentVA) {
      drawHLine(currentVA.vah, '#86efac', []);
      drawHLine(currentVA.val, '#fca5a5', []);
      drawHLine(currentVA.poc, '#fde68a', [4, 2]);
    }

    // ── Prior day VA ──────────────────────────────────────────────────────────
    if (ind.showPriorVP && prior) {
      drawHLine(prior.vah, '#34d399',  [4, 3]);
      drawHLine(prior.val, '#f87171',  [4, 3]);
      drawHLine(prior.poc, '#a78bfa',  [4, 3]);
    }

    // ── Current price line ────────────────────────────────────────────────────
    const cp = currentPriceRef.current;
    if (cp !== null) {
      const py = toY(cp);
      if (py !== null) {
        ctx.save();
        ctx.strokeStyle = '#f85149';
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(drawW, py);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Crosshair line ────────────────────────────────────────────────────────
    const cy = crosshairYRef.current;
    if (cy !== null && cy >= 0 && cy <= bodyH) {
      ctx.save();
      ctx.strokeStyle = 'rgba(139, 148, 158, 0.55)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(drawW, cy);
      ctx.stroke();
      ctx.restore();
    }
  };

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  // ── Track body height via ResizeObserver ───────────────────────────────────
  useEffect(() => {
    if (!bodyRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      bodyHRef.current = Math.floor(e.contentRect.height);
      scheduleRedraw();
    });
    ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, [scheduleRedraw]);

  // ── Recompute VP map + VA stats when replay advances ──────────────────────
  useEffect(() => {
    const visible = candles.slice(0, currentIndex + 1);
    vpMapRef.current        = visible.length === 0 ? null : computeVolumeProfile(visible);
    currentPriceRef.current = candles[currentIndex]?.close ?? null;
    currentVARef.current    = vpMapRef.current ? computeVolumeAreaStats(vpMapRef.current) : null;
    scheduleRedraw();
  }, [candles, currentIndex, scheduleRedraw]);

  // ── Redraw when any display-affecting props change ─────────────────────────
  useEffect(() => { scheduleRedraw(); }, [width, indicators, priorDayStats, scheduleRedraw]);

  // ── Subscribe to main chart events ────────────────────────────────────────
  useEffect(() => {
    if (!mainChart || !mainSeries) return;
    scheduleRedraw();

    const onCrosshair: CrosshairHandler = (param) => {
      crosshairYRef.current = param.point?.y ?? null;
      scheduleRedraw();
    };
    const onTimeRange = () => scheduleRedraw();

    (mainChart.subscribeCrosshairMove as (h: CrosshairHandler) => void)(onCrosshair);
    (mainChart.timeScale().subscribeVisibleTimeRangeChange as (h: () => void) => void)(onTimeRange);

    const pollId = setInterval(scheduleRedraw, 50);

    return () => {
      (mainChart.unsubscribeCrosshairMove as (h: CrosshairHandler) => void)(onCrosshair);
      (mainChart.timeScale().unsubscribeVisibleTimeRangeChange as (h: () => void) => void)(onTimeRange);
      clearInterval(pollId);
    };
  }, [mainChart, mainSeries, scheduleRedraw]);

  // ── Cleanup rAF on unmount ─────────────────────────────────────────────────
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div
      ref={bodyRef}
      className="bg-panel border-l border-border shrink-0 relative overflow-hidden"
      style={{ width }}
    >
      <canvas ref={canvasRef} className="absolute top-0 left-0" />
    </div>
  );
}
