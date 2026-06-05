import { create } from 'zustand';
import type { Candle } from '@/types/market';
import type { Signal } from '@/types/signal';
import type { PriorDayStats } from '@/types/indicators';
import { fetchSessions, fetchBars, fetchPriorDayStats } from '@/api/client';
import { generateMockSignals } from '@/utils/mockData';

export type ReplaySpeed = 1 | 2 | 5 | 10;

interface ReplayState {
  sessionDate: string;
  availableDates: string[];
  candles: Candle[];
  signals: Signal[];
  priorDayStats: PriorDayStats | null;
  currentIndex: number;
  isPlaying: boolean;
  speed: ReplaySpeed;
  isLoading: boolean;
  error: string | null;

  loadSessions: () => Promise<void>;
  loadSession: (date: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  stepBack: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setIndex: (index: number) => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  sessionDate: '',
  availableDates: [],
  candles: [],
  signals: [],
  priorDayStats: null,
  currentIndex: 0,
  isPlaying: false,
  speed: 1,
  isLoading: false,
  error: null,

  async loadSessions() {
    set({ isLoading: true, error: null });
    try {
      const dates = await fetchSessions();
      set({ availableDates: dates, isLoading: false });
      // Auto-load the most recent session if none is loaded yet
      if (dates.length > 0 && !get().sessionDate) {
        await get().loadSession(dates[dates.length - 1]);
      }
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  async loadSession(date: string) {
    set({ isLoading: true, isPlaying: false, error: null });
    try {
      const [candles, priorDayStats] = await Promise.all([
        fetchBars(date),
        fetchPriorDayStats(date),
      ]);
      const signals = generateMockSignals(candles);
      set({ sessionDate: date, candles, signals, priorDayStats, currentIndex: 0, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: `Failed to load ${date}: ${e}` });
    }
  },

  play()  { set({ isPlaying: true }); },
  pause() { set({ isPlaying: false }); },
  togglePlay() { set((s) => ({ isPlaying: !s.isPlaying })); },

  stepForward() {
    const { currentIndex, candles } = get();
    if (currentIndex < candles.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    } else {
      set({ isPlaying: false });
    }
  },

  stepBack() {
    const { currentIndex } = get();
    if (currentIndex > 0) set({ currentIndex: currentIndex - 1 });
  },

  setSpeed(speed) { set({ speed }); },

  setIndex(index) {
    const { candles } = get();
    set({ currentIndex: Math.max(0, Math.min(index, candles.length - 1)) });
  },
}));
