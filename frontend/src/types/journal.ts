export type JournalDirection = 'long' | 'short';
export type TakeRating = 'yes' | 'maybe' | 'high-risk';

export const JOURNAL_SETUP_OPTIONS = [
  'Large green → short',
  'Large green → long',
  'Large red → short',
  'Large red → long',
  'Wick test',
  'IBH/IBL retest',
  'Reject at key level',
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
  takeRating?: TakeRating;
  comments: string;
  createdAt: number;
  updatedAt: number;
}

export interface JournalBackup {
  schemaVersion: 2;
  exportedAt: string;
  entries: JournalTrade[];
}
