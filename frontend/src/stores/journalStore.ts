import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { JournalTrade } from '@/types/journal';

type NewJournalTrade = Omit<JournalTrade, 'id' | 'createdAt' | 'updatedAt'>;
type JournalTradeUpdate = Omit<JournalTrade, 'id' | 'createdAt' | 'updatedAt'>;

interface JournalState {
  activeDate: string;
  entries: JournalTrade[];
  setActiveDate: (date: string) => void;
  addTrade: (trade: NewJournalTrade) => JournalTrade;
  updateTrade: (id: string, trade: JournalTradeUpdate) => void;
  deleteTrade: (id: string) => void;
  restoreTrade: (trade: JournalTrade) => void;
  importTrades: (trades: JournalTrade[]) => void;
}

export function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      activeDate: localDateValue(),
      entries: [],

      setActiveDate(activeDate) {
        set({ activeDate });
      },

      addTrade(trade) {
        const now = Date.now();
        const entry: JournalTrade = {
          ...trade,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ entries: [...state.entries, entry] }));
        return entry;
      },

      updateTrade(id, trade) {
        set((state) => ({
          entries: state.entries.map((entry) => (
            entry.id === id
              ? { ...entry, ...trade, updatedAt: Date.now() }
              : entry
          )),
        }));
      },

      deleteTrade(id) {
        set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) }));
      },

      restoreTrade(trade) {
        set((state) => ({
          entries: state.entries.some((entry) => entry.id === trade.id)
            ? state.entries
            : [...state.entries, trade],
        }));
      },

      importTrades(trades) {
        set((state) => {
          const merged = new Map(state.entries.map((entry) => [entry.id, entry]));
          for (const trade of trades) merged.set(trade.id, trade);
          return { entries: Array.from(merged.values()) };
        });
      },
    }),
    {
      name: 'nq-trade-journal-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeDate: state.activeDate, entries: state.entries }),
    },
  ),
);
