import { create } from 'zustand';

interface ChartLayoutState {
  chartIds: string[];
  addChart: () => void;
  removeChart: (id: string) => void;
}

export const useChartLayoutStore = create<ChartLayoutState>((set, get) => ({
  chartIds: [crypto.randomUUID()],

  addChart() {
    const { chartIds } = get();
    if (chartIds.length >= 4) return;
    set({ chartIds: [...chartIds, crypto.randomUUID()] });
  },

  removeChart(id) {
    const { chartIds } = get();
    if (chartIds.length <= 1) return;
    set({ chartIds: chartIds.filter((cid) => cid !== id) });
  },
}));
