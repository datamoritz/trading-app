import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Eye,
  EyeOff,
  RotateCcw,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { MobileChartStack } from '@/components/Mobile/MobileChartStack';
import { useReplayStore } from '@/stores/replayStore';
import { useTradeStore } from '@/stores/tradeStore';
import { DEFAULT_INDICATORS, type IndicatorConfig } from '@/types/indicators';
import type { Timeframe } from '@/types/market';
import { findTradeExit } from '@/utils/tradeExecution';
import { cn } from '@/lib/utils';

const MOBILE_TIMEFRAMES: Timeframe[] = ['1m', '5m', '1h'];
const ACCOUNT_START = 50_000;
const TRAILING_DRAWDOWN = 2_500;
const TRAIL_STOP_EQUITY = 50_100;
const DOLLARS_PER_POINT = 20;
const IB_REVEAL_INDEX = 59;
const BIG_STEP = 5;

function fmt(n: number, digits = 2) {
  return Number.isFinite(n) ? n.toFixed(digits) : '--';
}

function rMultiple(resultPoints: number | undefined, entry: number, stop: number) {
  const risk = Math.abs(entry - stop);
  if (!resultPoints || risk === 0) return 0;
  return resultPoints / risk;
}

function indicatorLabel(key: keyof IndicatorConfig) {
  const labels: Record<keyof IndicatorConfig, string> = {
    showIBHL: 'IB',
    showSessionOpen: 'Open',
    showPriorClose: 'PDC',
    showPriorHL: 'PD H/L',
    showPriorVP: 'pVP',
    showCurrentVP: 'VA',
    showVWAP: 'VWAP',
  };
  return labels[key];
}

export function MobileApp() {
  const {
    availableDates,
    candles,
    currentIndex,
    error,
    isLoading,
    loadSession,
    loadSessions,
    sessionDate,
    stepBack,
    stepForward,
    setIndex,
  } = useReplayStore();
  const { openTrade, tradeLog, enterTrade, submitTrade, fillTrade, closeTrade, cancelTrade, clearLog } = useTradeStore();

  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [showVolume, setShowVolume] = useState(true);
  const [showDelta, setShowDelta] = useState(true);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorConfig>({
    ...DEFAULT_INDICATORS,
    showIBHL: true,
  });
  const [equityHigh, setEquityHigh] = useState(ACCOUNT_START);

  const currentCandle = candles[currentIndex];
  const realizedDollars = tradeLog.reduce(
    (sum, trade) => sum + (trade.result_points ?? 0) * DOLLARS_PER_POINT,
    0,
  );
  const unrealizedDollars = useMemo(() => {
    if (!openTrade || openTrade.status !== 'active' || !currentCandle) return 0;
    const points = openTrade.direction === 'long'
      ? currentCandle.close - openTrade.entry_price
      : openTrade.entry_price - currentCandle.close;
    return points * DOLLARS_PER_POINT;
  }, [currentCandle, openTrade]);
  const equity = ACCOUNT_START + realizedDollars + unrealizedDollars;

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    setEquityHigh((high) => Math.max(high, equity));
  }, [equity]);

  useEffect(() => {
    if (!indicators.showIBHL || candles.length === 0 || currentIndex !== 0) return;
    setIndex(Math.min(IB_REVEAL_INDEX, candles.length - 1));
  }, [candles, currentIndex, indicators.showIBHL, setIndex]);

  useEffect(() => {
    if (!openTrade || candles.length === 0) return;

    if (openTrade.status === 'pending') {
      const submittedIndex = candles.findIndex((candle) => candle.time === openTrade.submitted_time);
      const startIndex = submittedIndex >= 0 ? submittedIndex + 1 : 0;
      for (let i = startIndex; i <= currentIndex; i++) {
        const candle = candles[i];
        if (candle.low <= openTrade.entry_price && candle.high >= openTrade.entry_price) {
          fillTrade(candle.time);
          return;
        }
      }
      return;
    }

    if (openTrade.status === 'draft') return;

    const exit = findTradeExit(openTrade, candles, currentIndex);
    if (exit) closeTrade(exit.time, exit.price);
  }, [candles, closeTrade, currentIndex, fillTrade, openTrade]);

  const trailBase = Math.min(Math.max(equityHigh, ACCOUNT_START), TRAIL_STOP_EQUITY);
  const drawdownThreshold = trailBase - TRAILING_DRAWDOWN;
  const drawdownRoom = equity - drawdownThreshold;

  const lastTrade = tradeLog[tradeLog.length - 1];
  const lastR = lastTrade
    ? rMultiple(lastTrade.result_points, lastTrade.entry_price, lastTrade.stop_price)
    : 0;
  const totalR = tradeLog.reduce(
    (sum, trade) => sum + rMultiple(trade.result_points, trade.entry_price, trade.stop_price),
    0,
  );
  const score = Math.round(totalR * 100);
  const streak = tradeLog.reduceRight((count, trade) => {
    if ((trade.result_points ?? 0) <= 0) return count;
    return count + 1;
  }, 0);

  function resetReplay() {
    setIndex(indicators.showIBHL && candles.length > 0 ? Math.min(IB_REVEAL_INDEX, candles.length - 1) : 0);
    cancelTrade();
    clearLog();
    setEquityHigh(ACCOUNT_START);
  }

  function startTrade(direction: 'long' | 'short') {
    if (!currentCandle || openTrade) return;
    const entry = Math.round(currentCandle.close * 4) / 4;
    enterTrade({
      trade_id: crypto.randomUUID(),
      direction,
      status: 'draft',
      entry_time: currentCandle.time,
      entry_price: entry,
      stop_price: direction === 'long' ? entry - 10 : entry + 10,
      target_price: direction === 'long' ? entry + 20 : entry - 20,
    });
  }

  function toggleIndicator(key: keyof IndicatorConfig) {
    setIndicators((current) => ({ ...current, [key]: !current[key] }));
  }

  async function loadMobileSession(date: string) {
    await loadSession(date);
    cancelTrade();
    clearLog();
    setEquityHigh(ACCOUNT_START);
    if (indicators.showIBHL) {
      requestAnimationFrame(() => {
        const { candles: loadedCandles } = useReplayStore.getState();
        setIndex(Math.min(IB_REVEAL_INDEX, loadedCandles.length - 1));
      });
    }
  }

  function stepBigForward() {
    setIndex(Math.min(currentIndex + BIG_STEP, candles.length - 1));
  }

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface text-gray-200 select-none">
      <header className="shrink-0 border-b border-border bg-panel px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-blue-400">NQ TRAINER</span>
          <select
            value={sessionDate}
            onChange={(event) => loadMobileSession(event.target.value)}
            className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-gray-200"
          >
            {availableDates.map((date) => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetReplay}
            className="grid h-8 w-8 place-items-center rounded border border-border text-gray-400"
            aria-label="Reset replay"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1 overflow-x-auto">
          {MOBILE_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                'h-7 rounded border px-3 text-xs tabular-nums',
                timeframe === tf
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-border text-gray-400',
              )}
            >
              {tf}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowVolume((value) => !value)}
            className={cn('h-7 rounded border px-3 text-xs', showVolume ? 'border-blue-500 text-blue-300' : 'border-border text-gray-500')}
          >
            Vol
          </button>
          <button
            type="button"
            onClick={() => setShowDelta((value) => !value)}
            className={cn('h-7 rounded border px-3 text-xs', showDelta ? 'border-blue-500 text-blue-300' : 'border-border text-gray-500')}
          >
            Delta
          </button>
          <button
            type="button"
            onClick={() => setShowVolumeProfile((value) => !value)}
            className={cn('h-7 rounded border px-3 text-xs', showVolumeProfile ? 'border-blue-500 text-blue-300' : 'border-border text-gray-500')}
          >
            VP
          </button>
          <button
            type="button"
            onClick={() => setShowIndicators((value) => !value)}
            className="grid h-7 w-8 shrink-0 place-items-center rounded border border-border text-gray-400"
            aria-label="Toggle indicators"
          >
            {showIndicators ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            onClick={() => setShowSetup((value) => !value)}
            className={cn(
              'grid h-7 w-8 shrink-0 place-items-center rounded border text-gray-400',
              showSetup || indicators.showIBHL ? 'border-blue-500 text-blue-300' : 'border-border',
            )}
            aria-label="Setup menu"
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>

        {showIndicators && (
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {(Object.keys(indicators) as Array<keyof IndicatorConfig>).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleIndicator(key)}
                className={cn(
                  'h-7 shrink-0 rounded border px-2 text-[11px]',
                  indicators[key] ? 'border-blue-500 text-blue-300' : 'border-border text-gray-500',
                )}
              >
                {indicatorLabel(key)}
              </button>
            ))}
          </div>
        )}

        {showSetup && (
          <div className="mt-2 flex gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                toggleIndicator('showIBHL');
                requestAnimationFrame(() => {
                  const { candles: loadedCandles } = useReplayStore.getState();
                  const willShow = !indicators.showIBHL;
                  if (willShow && loadedCandles.length > 0) {
                    setIndex(Math.min(IB_REVEAL_INDEX, loadedCandles.length - 1));
                  }
                });
              }}
              className={cn(
                'h-7 shrink-0 rounded border px-2 text-[11px]',
                indicators.showIBHL ? 'border-blue-500 text-blue-300' : 'border-border text-gray-500',
              )}
            >
              IBH/IBL
            </button>
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1">
        <MobileChartStack
          timeframe={timeframe}
          indicators={indicators}
          showVolume={showVolume}
          showDelta={showDelta}
          showVolumeProfile={showVolumeProfile}
        />
      </main>

      <section className="shrink-0 border-t border-border bg-panel px-3 py-2">
        {error && <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300">{error}</div>}
        {isLoading && <div className="mb-2 text-xs text-gray-500">Loading session...</div>}

        {showStats && (
          <div className="mb-2 grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-600">Score</div>
              <div className="text-sm font-semibold tabular-nums text-gray-100">{score}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-600">Streak</div>
              <div className="text-sm font-semibold tabular-nums text-gray-100">{streak}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-600">Last R</div>
              <div className={cn('text-sm font-semibold tabular-nums', lastR >= 0 ? 'text-green-400' : 'text-red-400')}>
                {fmt(lastR, 2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-600">DD Room</div>
              <div className={cn('text-sm font-semibold tabular-nums', drawdownRoom >= 0 ? 'text-gray-100' : 'text-red-400')}>
                ${Math.round(drawdownRoom)}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {!openTrade && (
            <>
              <button
                type="button"
                onClick={() => setShowStats((value) => !value)}
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded border',
                  showStats ? 'border-blue-500 text-blue-300' : 'border-border text-gray-400',
                )}
                aria-label="Toggle stats"
              >
                <BarChart3 size={16} />
              </button>
              <button
                type="button"
                onClick={() => startTrade('long')}
                className="h-10 w-12 rounded border border-green-500/60 bg-green-500/10 text-sm font-semibold text-green-300"
              >
                L
              </button>
              <button
                type="button"
                onClick={() => startTrade('short')}
                className="h-10 w-12 rounded border border-red-500/60 bg-red-500/10 text-sm font-semibold text-red-300"
              >
                S
              </button>
            </>
          )}

          {openTrade && (
            <>
              <button
                type="button"
                onClick={() => setShowStats((value) => !value)}
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded border',
                  showStats ? 'border-blue-500 text-blue-300' : 'border-border text-gray-400',
                )}
                aria-label="Toggle stats"
              >
                <BarChart3 size={16} />
              </button>
              <div className="min-w-0 flex-1 text-xs text-gray-400">
                <div className="truncate">
                  {openTrade.direction.toUpperCase()} · {openTrade.status ?? 'active'} · E {fmt(openTrade.entry_price)}
                </div>
                <div className="truncate">
                  SL {fmt(openTrade.stop_price)} · TP {fmt(openTrade.target_price)}
                </div>
              </div>
              {openTrade.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => currentCandle && submitTrade(currentCandle.time)}
                  className="grid h-10 w-12 place-items-center rounded border border-blue-500/70 bg-blue-500/15 text-blue-300"
                  aria-label="Submit trade"
                >
                  <Send size={16} />
                </button>
              )}
              {openTrade.status !== 'active' && (
                <button
                  type="button"
                  onClick={cancelTrade}
                  className="grid h-10 w-12 place-items-center rounded border border-border text-gray-400"
                  aria-label="Cancel trade"
                >
                  <X size={17} />
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={stepBack}
            disabled={currentIndex <= 0}
            className="grid h-10 w-10 shrink-0 place-items-center rounded border border-border text-gray-300 disabled:opacity-40"
            aria-label="Go back one candle"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={stepForward}
            disabled={currentIndex >= candles.length - 1}
            className="grid h-10 w-12 shrink-0 place-items-center rounded border border-blue-500/70 bg-blue-600 text-white disabled:opacity-40"
            aria-label="Next candle"
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            onClick={stepBigForward}
            disabled={currentIndex >= candles.length - 1}
            className="grid h-10 w-12 shrink-0 place-items-center rounded border border-blue-500/70 bg-blue-600 text-white disabled:opacity-40"
            aria-label="Jump forward"
          >
            <ChevronsRight size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}
