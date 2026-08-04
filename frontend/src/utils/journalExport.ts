import {
  JOURNAL_SETUP_OPTIONS,
  type JournalBackup,
  type JournalDirection,
  type JournalSetup,
  type JournalTrade,
} from '@/types/journal';

function downloadFile(contents: string, filename: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeSpreadsheetValue(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | boolean): string {
  const raw = safeSpreadsheetValue(
    typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value),
  );
  return `"${raw.replaceAll('"', '""')}"`;
}

export function exportJournalCsv(entries: JournalTrade[]): void {
  const header = [
    'Date',
    'Time',
    'Direction',
    'P/L Points',
    'Prior candle at key level',
    'Prior candle touched key level',
    'Prior candle closed past key level',
    'Key level',
    'Setup',
    'Comments',
  ];
  const rows = entries
    .slice()
    .sort((a, b) => `${a.tradeDate} ${a.time}`.localeCompare(`${b.tradeDate} ${b.time}`))
    .map((entry) => [
      entry.tradeDate,
      entry.time,
      entry.direction.toUpperCase(),
      entry.pnlPoints,
      entry.priorCandleAtKeyLevel,
      entry.priorCandleTouchedKeyLevel,
      entry.priorCandleClosedPastKeyLevel,
      entry.keyLevel,
      entry.setup,
      entry.comments,
    ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  downloadFile(csv, 'nq-trade-journal.csv', 'text/csv;charset=utf-8');
}

export function exportJournalBackup(entries: JournalTrade[]): void {
  const backup: JournalBackup = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
  downloadFile(
    JSON.stringify(backup, null, 2),
    `nq-trade-journal-backup-${new Date().toISOString().slice(0, 10)}.json`,
    'application/json',
  );
}

function isDirection(value: unknown): value is JournalDirection {
  return value === 'long' || value === 'short';
}

function isSetup(value: unknown): value is JournalSetup {
  return typeof value === 'string' && JOURNAL_SETUP_OPTIONS.includes(value as JournalSetup);
}

function isJournalTrade(value: unknown): value is JournalTrade {
  if (!value || typeof value !== 'object') return false;
  const trade = value as Record<string, unknown>;
  return (
    typeof trade.id === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(String(trade.tradeDate))
    && /^\d{2}:\d{2}$/.test(String(trade.time))
    && isDirection(trade.direction)
    && typeof trade.pnlPoints === 'number'
    && Number.isFinite(trade.pnlPoints)
    && typeof trade.priorCandleAtKeyLevel === 'boolean'
    && typeof trade.priorCandleTouchedKeyLevel === 'boolean'
    && typeof trade.priorCandleClosedPastKeyLevel === 'boolean'
    && typeof trade.keyLevel === 'string'
    && isSetup(trade.setup)
    && typeof trade.comments === 'string'
    && typeof trade.createdAt === 'number'
    && typeof trade.updatedAt === 'number'
  );
}

export function parseJournalBackup(contents: string): JournalTrade[] {
  const parsed: unknown = JSON.parse(contents);
  if (!parsed || typeof parsed !== 'object') throw new Error('Backup file is not valid.');
  const backup = parsed as Record<string, unknown>;
  if (backup.schemaVersion !== 1 || !Array.isArray(backup.entries)) {
    throw new Error('This is not an NQ Trade Journal backup.');
  }
  if (!backup.entries.every(isJournalTrade)) {
    throw new Error('The backup contains an invalid trade entry.');
  }
  return backup.entries;
}
