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
import { LaunchModeChooser } from '@/components/Simulation/LaunchModeChooser';
import { SimulationControls } from '@/components/Simulation/SimulationControls';
import { SimulationOverlay } from '@/components/Simulation/SimulationOverlay';
import { useSimulationStore } from '@/stores/simulationStore';
import { useSimulationPlayback } from '@/hooks/useSimulationPlayback';

function useReplayInterval(active: boolean) {
  const { isPlaying, speed, stepForward } = useReplayStore();
  const stepRef = useRef(stepForward);
  stepRef.current = stepForward;

  useEffect(() => {
    if (!active || !isPlaying) return;
    const id = setInterval(() => stepRef.current(), 1000 / speed);
    return () => clearInterval(id);
  }, [active, isPlaying, speed]);
}

function useHotkeys(simulationMode: boolean) {
  const { togglePlay, stepForward, stepBack } = useReplayStore();
  const { openTrade } = useTradeStore();
  const {
    candles,
    currentIndex,
    isTickSimulation,
    latestPrice,
    latestTickTime,
  } = useReplayStore();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (simulationMode) useSimulationStore.getState().togglePlay();
          else togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (!simulationMode) stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (!simulationMode) stepBack();
          break;
        case 'l':
        case 'L': {
          const candle = candles[currentIndex];
          if (!candle || openTrade) break;
          const price = isTickSimulation ? latestPrice : candle.close;
          const time = isTickSimulation ? latestTickTime : candle.time;
          useTradeStore.getState().enterTrade({
            trade_id: crypto.randomUUID(),
            direction: 'long',
            entry_time: time,
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
          const price = isTickSimulation ? latestPrice : candle.close;
          const time = isTickSimulation ? latestTickTime : candle.time;
          useTradeStore.getState().enterTrade({
            trade_id: crypto.randomUUID(),
            direction: 'short',
            entry_time: time,
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
          useTradeStore.getState().flatten(
            isTickSimulation ? latestTickTime : candle.time,
            isTickSimulation ? latestPrice : candle.close,
          );
          break;
        }
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    simulationMode,
    togglePlay,
    stepForward,
    stepBack,
    candles,
    currentIndex,
    isTickSimulation,
    latestPrice,
    latestTickTime,
    openTrade,
  ]);
}

function useTradeAutoExit(active: boolean) {
  const { candles, currentIndex } = useReplayStore();
  const { openTrade } = useTradeStore();

  useEffect(() => {
    if (!active || !openTrade || candles.length === 0) return;
    if (openTrade.status === 'draft' || openTrade.status === 'pending') return;
    const exit = findTradeExit(openTrade, candles, currentIndex);
    if (!exit) return;
    useTradeStore.getState().closeTrade(exit.time, exit.price);
  }, [active, candles, currentIndex, openTrade]);
}

function DesktopApp({ simulationMode, onExit }: { simulationMode: boolean; onExit: () => void }) {
  useReplayInterval(!simulationMode);
  useHotkeys(simulationMode);
  useTradeAutoExit(!simulationMode);

  useEffect(() => {
    if (!simulationMode) useReplayStore.getState().loadSessions();
  }, [simulationMode]);

  const { tz, setTz } = useTimezoneStore();
  const [footerExpanded, setFooterExpanded] = useState(true);

  return (
    <div className="h-screen w-screen flex flex-col bg-surface text-gray-200 overflow-hidden select-none">
      {/* Top bar */}
      <header className="h-12 flex items-center gap-4 px-4 border-b border-border bg-panel shrink-0">
        <span className="text-xs font-bold text-blue-400 tracking-wider mr-2">NQ TRAINER</span>
        {simulationMode ? (
          <span className="rounded border border-blue-500/50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-300">
            Blind setup
          </span>
        ) : (
          <SessionSelector />
        )}
        <div className="w-px h-5 bg-border" />
        {simulationMode ? <SimulationControls /> : <ReplayControls />}
        <button
          type="button"
          onClick={onExit}
          className="rounded border border-border px-2 py-1 text-[11px] text-gray-500 hover:text-gray-200"
        >
          Modes
        </button>
        <button
          onClick={() => setTz(TZ_ORDER[(TZ_ORDER.indexOf(tz) + 1) % TZ_ORDER.length])}
          className="px-2 py-0.5 rounded text-xs border border-border text-gray-500 hover:text-gray-300 tabular-nums"
          title="Cycle timezone"
        >
          {tz}
        </button>
      </header>

      {/* Chart area */}
      <main className="relative flex-1 overflow-hidden min-h-0">
        <ChartGrid />
        {simulationMode && <SimulationOverlay />}
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
  const [mode, setMode] = useState<'standard' | 'simulation' | null>(null);
  const path = window.location.pathname;
  const isMobile = path.startsWith('/mobile') || (import.meta.env.PROD && !path.startsWith('/desktop'));
  useSimulationPlayback(mode === 'simulation');

  useEffect(() => {
    if (mode === 'simulation') void useSimulationStore.getState().start();
  }, [mode]);

  function exitToModes() {
    useSimulationStore.getState().reset();
    setMode(null);
  }

  function chooseMode(nextMode: 'standard' | 'simulation') {
    if (nextMode === 'simulation') {
      useReplayStore.setState({ isTickSimulation: true });
    }
    setMode(nextMode);
  }

  if (!mode) return <LaunchModeChooser onChoose={chooseMode} />;

  if (isMobile) {
    return (
      <MobileApp
        simulationMode={mode === 'simulation'}
        onExit={exitToModes}
      />
    );
  }

  return <DesktopApp simulationMode={mode === 'simulation'} onExit={exitToModes} />;
}
