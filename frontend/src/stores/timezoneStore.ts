import { create } from 'zustand';

export type TZ = 'ET' | 'CT' | 'MT' | 'UTC';

export const TZ_ORDER: TZ[] = ['ET', 'CT', 'MT', 'UTC'];

export const TZ_IANA: Record<TZ, string> = {
  ET: 'America/New_York',
  CT: 'America/Chicago',
  MT: 'America/Denver',
  UTC: 'UTC',
};

interface TimezoneState {
  tz: TZ;
  setTz: (tz: TZ) => void;
}

export const useTimezoneStore = create<TimezoneState>((set) => ({
  tz: 'ET',
  setTz: (tz) => set({ tz }),
}));
