import { create } from 'zustand';
import { fetchSimulationManifest, fetchSimulationSession } from '@/api/client';
import type {
  SimulationEvent,
  SimulationManifest,
  SimulationSpeed,
} from '@/types/simulation';
import { TickReplayEngine } from '@/utils/tickReplay';
import { useReplayStore } from './replayStore';
import { useTradeStore } from './tradeStore';

export type SimulationPhase = 'idle' | 'loading' | 'ready' | 'playing' | 'complete' | 'error';

interface SimulationState {
  phase: SimulationPhase;
  speed: SimulationSpeed;
  progress: number;
  completedCount: number;
  totalCount: number;
  error: string | null;

  start: () => Promise<void>;
  next: () => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  advance: (realMilliseconds: number) => void;
  reset: () => void;
}

let manifest: SimulationManifest | null = null;
let engine: TickReplayEngine | null = null;
const usedEventIds = new Set<string>();

function chooseRandomEvent(events: SimulationEvent[]): SimulationEvent {
  if (usedEventIds.size >= events.length) usedEventIds.clear();
  const available = events.filter((event) => !usedEventIds.has(event.id));
  const event = available[Math.floor(Math.random() * available.length)];
  usedEventIds.add(event.id);
  return event;
}

function processTradeTick(time: number, price: number): void {
  const trade = useTradeStore.getState().openTrade;
  if (!trade || trade.status === 'draft') return;

  if (trade.status === 'pending') {
    const touched = trade.direction === 'long'
      ? price <= trade.entry_price
      : price >= trade.entry_price;
    if (touched) useTradeStore.getState().fillTrade(time);
    return;
  }

  const stopHit = trade.direction === 'long'
    ? price <= trade.stop_price
    : price >= trade.stop_price;
  const targetHit = trade.direction === 'long'
    ? price >= trade.target_price
    : price <= trade.target_price;

  if (stopHit) {
    useTradeStore.getState().closeTrade(time, trade.stop_price);
  } else if (targetHit) {
    useTradeStore.getState().closeTrade(time, trade.target_price);
  }
}

async function loadRandomSetup(set: (value: Partial<SimulationState>) => void): Promise<void> {
  set({ phase: 'loading', error: null, progress: 0 });
  useTradeStore.getState().cancelTrade();
  useTradeStore.getState().clearLog();

  try {
    manifest ??= await fetchSimulationManifest();
    const event = chooseRandomEvent(manifest.events);
    const session = await fetchSimulationSession(event.sessionId);
    if (session.sessionId !== event.sessionId) {
      throw new Error('Simulation session identity does not match the manifest');
    }

    engine = new TickReplayEngine(session, event);
    useReplayStore.getState().loadSimulationFrame(engine.frame());
    set({
      phase: 'ready',
      progress: 0,
      completedCount: usedEventIds.size,
      totalCount: manifest.events.length,
    });
  } catch (error) {
    engine = null;
    set({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  phase: 'idle',
  speed: 1,
  progress: 0,
  completedCount: 0,
  totalCount: 0,
  error: null,

  async start() {
    if (get().phase !== 'idle' && get().phase !== 'error') return;
    await loadRandomSetup(set);
  },

  async next() {
    await loadRandomSetup(set);
  },

  play() {
    if (get().phase === 'ready') set({ phase: 'playing' });
  },

  pause() {
    if (get().phase === 'playing') set({ phase: 'ready' });
  },

  togglePlay() {
    const phase = get().phase;
    if (phase === 'playing') set({ phase: 'ready' });
    else if (phase === 'ready') set({ phase: 'playing' });
  },

  setSpeed(speed) {
    set({ speed });
  },

  advance(realMilliseconds) {
    if (get().phase !== 'playing' || !engine) return;
    const processed = engine.advanceBy(realMilliseconds, get().speed, processTradeTick);
    if (processed > 0) {
      useReplayStore.getState().updateSimulationFrame(engine.frame());
    }
    const progress = engine.progress;
    if (engine.complete) {
      const replay = useReplayStore.getState();
      const trade = useTradeStore.getState().openTrade;
      if (trade?.status === 'active' && replay.latestPrice) {
        useTradeStore.getState().flatten(replay.latestTickTime, replay.latestPrice);
      }
      set({ phase: 'complete', progress: 1 });
    } else {
      set({ progress });
    }
  },

  reset() {
    engine = null;
    useTradeStore.getState().cancelTrade();
    useTradeStore.getState().clearLog();
    useReplayStore.getState().leaveSimulation();
    set({ phase: 'idle', progress: 0, error: null });
  },
}));
