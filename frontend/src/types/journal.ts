export type JournalDirection = 'long' | 'short';

export const JOURNAL_SETUP_OPTIONS = [
  'Large green → short',
  'Large green → long',
  'Large red → short',
  'Large red → long',
  'Wick test',
  'IBH/IBL retest',
  'Other',
] as const;

export type JournalSetup = (typeof JOURNAL_SETUP_OPTIONS)[number];

export interface JournalTrade {
  id: string;
  tradeDate: string;
  time: string;
  direction: JournalDirection;
  pnlPoints: number;
  priorCandleAtKeyLevel: boolean;
  priorCandleTouchedKeyLevel: boolean;
  priorCandleClosedPastKeyLevel: boolean;
  keyLevel: string;
  setup: JournalSetup;
  comments: string;
  createdAt: number;
  updatedAt: number;
}

export interface JournalBackup {
  schemaVersion: 1;
  exportedAt: string;
  entries: JournalTrade[];
}
