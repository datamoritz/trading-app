import { create } from 'zustand';
import type { Trade } from '@/types/trade';

interface TradeState {
  openTrade: Trade | null;
  tradeLog: Trade[];

  enterTrade: (trade: Trade) => void;
  submitTrade: (submitTime: number) => void;
  fillTrade: (fillTime: number) => void;
  closeTrade: (exitTime: number, exitPrice: number) => void;
  flatten: (exitTime: number, exitPrice: number) => void;
  cancelTrade: () => void;
  updateEntryPrice: (price: number) => void;
  updateStopPrice: (price: number) => void;
  updateTargetPrice: (price: number) => void;
  clearLog: () => void;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  openTrade: null,
  tradeLog: [],

  enterTrade(trade) {
    if (get().openTrade) return;
    set({ openTrade: trade });
  },

  submitTrade(submitTime) {
    const { openTrade } = get();
    if (!openTrade || openTrade.status !== 'draft') return;
    set({ openTrade: { ...openTrade, status: 'pending', submitted_time: submitTime } });
  },

  fillTrade(fillTime) {
    const { openTrade } = get();
    if (!openTrade || openTrade.status !== 'pending') return;
    set({ openTrade: { ...openTrade, status: 'active', filled_time: fillTime, entry_time: fillTime } });
  },

  closeTrade(exitTime, exitPrice) {
    const { openTrade, tradeLog } = get();
    if (!openTrade) return;
    const result_points =
      openTrade.direction === 'long'
        ? exitPrice - openTrade.entry_price
        : openTrade.entry_price - exitPrice;
    const closed: Trade = { ...openTrade, status: 'active', exit_time: exitTime, exit_price: exitPrice, result_points };
    set({ openTrade: null, tradeLog: [...tradeLog, closed] });
  },

  flatten(exitTime, exitPrice) {
    get().closeTrade(exitTime, exitPrice);
  },

  // Remove the open trade without logging it (pending order cancelled / misclick).
  cancelTrade() {
    set({ openTrade: null });
  },

  updateEntryPrice(price) {
    const { openTrade } = get();
    if (!openTrade) return;
    set({ openTrade: { ...openTrade, entry_price: price } });
  },

  updateStopPrice(price) {
    const { openTrade } = get();
    if (!openTrade) return;
    set({ openTrade: { ...openTrade, stop_price: price } });
  },

  updateTargetPrice(price) {
    const { openTrade } = get();
    if (!openTrade) return;
    set({ openTrade: { ...openTrade, target_price: price } });
  },

  clearLog() {
    set({ tradeLog: [] });
  },
}));
