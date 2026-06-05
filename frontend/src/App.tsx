import { useEffect, useRef, useState } from 'react';
import { SessionSelector } from '@/components/SessionSelector/SessionSelector';
import { ReplayControls } from '@/components/ReplayControls/ReplayControls';
import { ChartGrid } from '@/components/Chart/ChartGrid';
import { TradePanel } from '@/components/TradePanel/TradePanel';
import { TradeRibbon } from '@/components/TradePanel/TradeRibbon';
import { TradeLog } from '@/components/TradeLog/TradeLog';
import { useReplayStore } from '@/stores/replayStore';
import { useTradeStore } from '@/stores/tradeStore';
import { useTimezoneStore, TZ_ORDER } from '@/stores/timezoneStore';
import { cn } from '@/lib/utils';
import { findTradeExit } from '@/utils/tradeExecution';
import { MobileApp } from '@/components/Mobile/MobileApp';

function useReplayInterval() {
  const { isPlaying, speed, stepForward } = useReplayStore();
  const stepRef = useRef(stepForward);
  stepRef.current = stepForward;

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => stepRef.current(), 1000 / speed);
    return () => clearInterval(id);
  }, [isPlaying, speed]);
}

function useHotkeys() {
  const { togglePlay, stepForward, stepBack } = useReplayStore();
  const { openTrade } = useTradeStore();
  const { candles, currentIndex } = useReplayStore();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stepBack();
          break;
        case 'l':
        case 'L': {
          const candle = candles[currentIndex];
          if (!candle || openTrade) break;
          const price = candle.close;
          useTradeStore.getState().enterTrade({
            trade_id: crypto.randomUUID(),
            direction: 'long',
            entry_time: candle.time,
            entry_price: price,
            stop_price: price - 10,
            target_price: price + 20,
          });
          break;
        }
        case 's':
        case 'S': {
          const candle = candles[currentIndex];
          if (!candle || openTrade) break;
          const price = candle.close;
          useTradeStore.getState().enterTrade({
            trade_id: crypto.randomUUID(),
            direction: 'short',
            entry_time: candle.time,
            entry_price: price,
            stop_price: price + 10,
            target_price: price - 20,
          });
          break;
        }
        case 'f':
        case 'F': {
          const candle = candles[currentIndex];
          if (!candle || !openTrade) break;
          useTradeStore.getState().flatten(candle.time, candle.close);
          break;
        }
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay, stepForward, stepBack, candles, currentIndex, openTrade]);
}

function useTradeAutoExit() {
  const { candles, currentIndex } = useReplayStore();
  const { openTrade } = useTradeStore();

  useEffect(() => {
    if (!openTrade || candles.length === 0) return;
    if (openTrade.status === 'draft' || openTrade.status === 'pending') return;
    const exit = findTradeExit(openTrade, candles, currentIndex);
    if (!exit) return;
    useTradeStore.getState().closeTrade(exit.time, exit.price);
  }, [candles, currentIndex, openTrade]);
}

function DesktopApp() {
  useReplayInterval();
  useHotkeys();
  useTradeAutoExit();

  useEffect(() => {
    useReplayStore.getState().loadSessions();
  }, []);

  const { tz, setTz } = useTimezoneStore();
  const [footerExpanded, setFooterExpanded] = useState(true);

  return (
    <div className="h-screen w-screen flex flex-col bg-surface text-gray-200 overflow-hidden select-none">
      {/* Top bar */}
      <header className="h-12 flex items-center gap-4 px-4 border-b border-border bg-panel shrink-0">
        <span className="text-xs font-bold text-blue-400 tracking-wider mr-2">NQ TRAINER</span>
        <SessionSelector />
        <div className="w-px h-5 bg-border" />
        <ReplayControls />
        <button
          onClick={() => setTz(TZ_ORDER[(TZ_ORDER.indexOf(tz) + 1) % TZ_ORDER.length])}
          className="px-2 py-0.5 rounded text-xs border border-border text-gray-500 hover:text-gray-300 tabular-nums"
          title="Cycle timezone"
        >
          {tz}
        </button>
      </header>

      {/* Chart area */}
      <main className="flex-1 overflow-hidden min-h-0">
        <ChartGrid />
      </main>

      {/* Bottom panel — ribbon always visible; full panel slides in above it */}
      <footer
        className={cn(
          'border-t border-border flex flex-col shrink-0 transition-[height] duration-150',
          footerExpanded ? 'h-44' : 'h-8',
        )}
      >
        {/* Full panel — only rendered when expanded, sits above the ribbon */}
        {footerExpanded && (
          <div className="flex flex-1 overflow-hidden min-h-0">
            <TradePanel />
            <TradeLog />
          </div>
        )}
        {/* Ribbon — always visible at the very bottom */}
        <TradeRibbon expanded={footerExpanded} onToggle={() => setFooterExpanded((v) => !v)} />
      </footer>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith('/mobile') || (import.meta.env.PROD && !path.startsWith('/desktop'))) {
    return <MobileApp />;
  }

  return <DesktopApp />;
}
