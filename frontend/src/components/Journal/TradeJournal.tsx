import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Edit3,
  HardDrive,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useJournalStore } from '@/stores/journalStore';
import {
  JOURNAL_SETUP_OPTIONS,
  type JournalDirection,
  type JournalSetup,
  type JournalTrade,
} from '@/types/journal';
import {
  exportJournalBackup,
  exportJournalCsv,
  parseJournalBackup,
} from '@/utils/journalExport';

interface Props {
  onExit: () => void;
}

interface JournalForm {
  time: string;
  direction: JournalDirection | null;
  pnlPoints: string;
  priorCandleAtKeyLevel: boolean;
  priorCandleTouchedKeyLevel: boolean;
  priorCandleClosedPastKeyLevel: boolean;
  keyLevel: string;
  setup: JournalSetup;
  comments: string;
}

function currentMinute(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function browserStorageAvailable(): boolean {
  try {
    const testKey = 'nq-trade-journal-storage-check';
    localStorage.setItem(testKey, 'ok');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function emptyForm(): JournalForm {
  return {
    time: currentMinute(),
    direction: null,
    pnlPoints: '',
    priorCandleAtKeyLevel: false,
    priorCandleTouchedKeyLevel: false,
    priorCandleClosedPastKeyLevel: false,
    keyLevel: '',
    setup: 'Other',
    comments: '',
  };
}

function formatPoints(points: number): string {
  return `${points > 0 ? '+' : ''}${points.toFixed(2).replace(/\.00$/, '')}`;
}

function displayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function YesNoCheck({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface/70 px-3 py-2.5 text-xs text-gray-300 transition hover:border-gray-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        className={cn(
          'grid h-5 w-5 shrink-0 place-items-center rounded border transition',
          checked
            ? 'border-blue-500 bg-blue-600 text-white'
            : 'border-gray-600 bg-panel text-transparent',
        )}
      >
        <Check size={14} strokeWidth={3} />
      </span>
      <span className="flex-1">{label}</span>
      <span className={checked ? 'text-blue-300' : 'text-gray-600'}>{checked ? 'YES' : 'NO'}</span>
    </label>
  );
}

export function TradeJournal({ onExit }: Props) {
  const {
    activeDate,
    entries,
    setActiveDate,
    addTrade,
    updateTrade,
    deleteTrade,
    restoreTrade,
    importTrades,
  } = useJournalStore();
  const importInputRef = useRef<HTMLInputElement>(null);
  const formSectionRef = useRef<HTMLElement>(null);
  const [storageAvailable] = useState(browserStorageAvailable);
  const [form, setForm] = useState<JournalForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    storageAvailable ? null : 'Local browser storage is unavailable. Enable site storage before logging trades.',
  );
  const [notice, setNotice] = useState(
    storageAvailable
      ? 'Changes save automatically in this browser.'
      : 'Local saving is unavailable in this browser.',
  );
  const [lastDeleted, setLastDeleted] = useState<JournalTrade | null>(null);

  const dayEntries = useMemo(
    () => entries
      .filter((entry) => entry.tradeDate === activeDate)
      .sort((a, b) => b.time.localeCompare(a.time) || b.createdAt - a.createdAt),
    [activeDate, entries],
  );
  const journalDates = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.tradeDate))).sort().reverse(),
    [entries],
  );
  const netPoints = dayEntries.reduce((total, entry) => total + entry.pnlPoints, 0);
  const wins = dayEntries.filter((entry) => entry.pnlPoints > 0).length;
  const losses = dayEntries.filter((entry) => entry.pnlPoints < 0).length;

  function updateForm<K extends keyof JournalForm>(key: K, value: JournalForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function resetEntryForm() {
    setForm(emptyForm());
    setEditingId(null);
    setError(null);
  }

  function submitTrade(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!storageAvailable) {
      setError('Local browser storage is unavailable. Enable site storage before logging trades.');
      return;
    }
    if (!form.direction) {
      setError('Choose LONG or SHORT.');
      return;
    }
    const points = Number(form.pnlPoints.replace(',', '.'));
    if (!Number.isFinite(points)) {
      setError('Enter the profit or loss in points.');
      return;
    }
    const trade = {
      tradeDate: activeDate,
      time: form.time,
      direction: form.direction,
      pnlPoints: points,
      priorCandleAtKeyLevel: form.priorCandleAtKeyLevel,
      priorCandleTouchedKeyLevel: form.priorCandleTouchedKeyLevel,
      priorCandleClosedPastKeyLevel: form.priorCandleClosedPastKeyLevel,
      keyLevel: form.keyLevel.trim(),
      setup: form.setup,
      comments: form.comments.trim(),
    };
    if (editingId) {
      updateTrade(editingId, trade);
      setNotice('Trade updated and saved locally.');
    } else {
      addTrade(trade);
      setNotice('Trade saved locally. Ready for the next one.');
    }
    setLastDeleted(null);
    resetEntryForm();
  }

  function startEditing(entry: JournalTrade) {
    setEditingId(entry.id);
    setForm({
      time: entry.time,
      direction: entry.direction,
      pnlPoints: String(entry.pnlPoints),
      priorCandleAtKeyLevel: entry.priorCandleAtKeyLevel,
      priorCandleTouchedKeyLevel: entry.priorCandleTouchedKeyLevel,
      priorCandleClosedPastKeyLevel: entry.priorCandleClosedPastKeyLevel,
      keyLevel: entry.keyLevel,
      setup: entry.setup,
      comments: entry.comments,
    });
    setError(null);
    requestAnimationFrame(() => formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function duplicateTrade(entry: JournalTrade) {
    addTrade({
      tradeDate: entry.tradeDate,
      time: entry.time,
      direction: entry.direction,
      pnlPoints: entry.pnlPoints,
      priorCandleAtKeyLevel: entry.priorCandleAtKeyLevel,
      priorCandleTouchedKeyLevel: entry.priorCandleTouchedKeyLevel,
      priorCandleClosedPastKeyLevel: entry.priorCandleClosedPastKeyLevel,
      keyLevel: entry.keyLevel,
      setup: entry.setup,
      comments: entry.comments,
    });
    setNotice('Trade duplicated and saved locally.');
  }

  function removeTrade(entry: JournalTrade) {
    deleteTrade(entry.id);
    if (editingId === entry.id) resetEntryForm();
    setLastDeleted(entry);
    setNotice('Trade deleted.');
  }

  function undoDelete() {
    if (!lastDeleted) return;
    restoreTrade(lastDeleted);
    setLastDeleted(null);
    setNotice('Trade restored.');
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      const imported = parseJournalBackup(await file.text());
      importTrades(imported);
      setNotice(`${imported.length} trade${imported.length === 1 ? '' : 's'} imported and saved locally.`);
      setError(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import this backup.');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  return (
    <div className="h-dvh w-screen overflow-y-auto bg-surface text-gray-200">
      <header className="sticky top-0 z-20 border-b border-border bg-panel/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-gray-400 transition hover:border-gray-500 hover:text-gray-100"
          >
            <ArrowLeft size={15} />
            Modes
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold tracking-[0.24em] text-blue-400">NQ TRAINER</div>
            <div className="truncate text-sm font-semibold text-gray-100">Trade Journal</div>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-green-300 sm:flex">
            <HardDrive size={14} />
            Saved locally
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
        <section ref={formSectionRef} className="scroll-mt-20 self-start rounded-xl border border-border bg-panel shadow-xl shadow-black/10 lg:sticky lg:top-[76px]">
          <div className="border-b border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-100">Trading date</div>
                <div className="mt-0.5 text-[11px] text-gray-500">Set once; every new trade uses this date.</div>
              </div>
              <span className={cn(
                'rounded border px-2 py-1 text-[10px]',
                storageAvailable
                  ? 'border-green-500/30 bg-green-500/10 text-green-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300',
              )}>
                {storageAvailable ? 'AUTO-SAVED' : 'STORAGE OFF'}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <input
                type="date"
                value={activeDate}
                onChange={(event) => {
                  setActiveDate(event.target.value);
                  resetEntryForm();
                }}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-gray-100 outline-none focus:border-blue-500"
              />
              {journalDates.length > 0 && (
                <select
                  value={journalDates.includes(activeDate) ? activeDate : ''}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    setActiveDate(event.target.value);
                    resetEntryForm();
                  }}
                  className="h-10 rounded-lg border border-border bg-surface px-3 text-xs text-gray-300 outline-none focus:border-blue-500"
                  aria-label="Dates with saved trades"
                >
                  <option value="">Saved dates…</option>
                  {journalDates.map((date) => (
                    <option key={date} value={date}>{date}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <form onSubmit={submitTrade} className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h1 className="text-sm font-semibold text-gray-100">
                {editingId ? 'Edit trade' : 'Add trade'}
              </h1>
              {editingId && (
                <button type="button" onClick={resetEntryForm} className="text-[11px] text-gray-500 hover:text-gray-200">
                  Cancel edit
                </button>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Direction</label>
              <div className="grid grid-cols-2 gap-2">
                {(['long', 'short'] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => updateForm('direction', direction)}
                    className={cn(
                      'h-11 rounded-lg border text-sm font-bold transition',
                      form.direction === direction
                        ? direction === 'long'
                          ? 'border-green-500 bg-green-500/15 text-green-300'
                          : 'border-red-500 bg-red-500/15 text-red-300'
                        : 'border-border bg-surface text-gray-500 hover:border-gray-600 hover:text-gray-300',
                    )}
                  >
                    {direction.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Time</span>
                <input
                  type="time"
                  step="60"
                  required
                  value={form.time}
                  onChange={(event) => updateForm('time', event.target.value)}
                  className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-gray-100 outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500">P/L points</span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={form.pnlPoints}
                  onChange={(event) => updateForm('pnlPoints', event.target.value)}
                  placeholder="+12.5 or -6"
                  className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-base tabular-nums text-gray-100 outline-none placeholder:text-gray-700 focus:border-blue-500"
                />
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Prior candle</div>
              <YesNoCheck
                label="At key level"
                checked={form.priorCandleAtKeyLevel}
                onChange={(checked) => updateForm('priorCandleAtKeyLevel', checked)}
              />
              <YesNoCheck
                label="Touched key level"
                checked={form.priorCandleTouchedKeyLevel}
                onChange={(checked) => updateForm('priorCandleTouchedKeyLevel', checked)}
              />
              <YesNoCheck
                label="Closed past key level"
                checked={form.priorCandleClosedPastKeyLevel}
                onChange={(checked) => updateForm('priorCandleClosedPastKeyLevel', checked)}
              />
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Key level</span>
              <input
                type="text"
                value={form.keyLevel}
                onChange={(event) => updateForm('keyLevel', event.target.value)}
                placeholder="IBH, prior high, 19000…"
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-gray-100 outline-none placeholder:text-gray-700 focus:border-blue-500"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Setup</span>
              <select
                value={form.setup}
                onChange={(event) => updateForm('setup', event.target.value as JournalSetup)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-gray-100 outline-none focus:border-blue-500"
              >
                {JOURNAL_SETUP_OPTIONS.map((setup) => <option key={setup}>{setup}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500">Comments</span>
              <textarea
                value={form.comments}
                onChange={(event) => updateForm('comments', event.target.value)}
                rows={3}
                placeholder="What did you see? What would you repeat or change?"
                className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-700 focus:border-blue-500"
              />
            </label>

            {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

            <button
              type="submit"
              disabled={!storageAvailable}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-blue-500 bg-blue-600 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
            >
              {editingId ? <Save size={16} /> : <Check size={17} />}
              {editingId ? 'Save changes' : 'Save & add next'}
            </button>
          </form>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="rounded-xl border border-border bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Daily journal</div>
                <h2 className="mt-1 text-lg font-semibold text-gray-100">{displayDate(activeDate)}</h2>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-green-300">
                  <HardDrive size={13} />
                  {notice}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={entries.length === 0}
                  onClick={() => exportJournalCsv(entries)}
                  className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[11px] text-gray-400 transition hover:border-gray-500 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Download size={14} /> CSV
                </button>
                <button
                  type="button"
                  disabled={entries.length === 0}
                  onClick={() => exportJournalBackup(entries)}
                  className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[11px] text-gray-400 transition hover:border-gray-500 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Save size={14} /> Backup
                </button>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[11px] text-gray-400 transition hover:border-gray-500 hover:text-gray-100"
                >
                  <Upload size={14} /> Import
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => void importBackup(event.target.files?.[0])}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                ['Trades', String(dayEntries.length), 'text-gray-100'],
                ['Wins', String(wins), 'text-green-300'],
                ['Losses', String(losses), 'text-red-300'],
                ['Net pts', formatPoints(netPoints), netPoints >= 0 ? 'text-green-300' : 'text-red-300'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-lg border border-border bg-surface/60 px-2 py-3 text-center">
                  <div className="text-[9px] uppercase tracking-wide text-gray-600 sm:text-[10px]">{label}</div>
                  <div className={cn('mt-1 text-base font-bold tabular-nums', color)}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {lastDeleted && (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <span>Trade deleted.</span>
              <button type="button" onClick={undoDelete} className="flex items-center gap-1.5 font-semibold hover:text-white">
                <RotateCcw size={13} /> Undo
              </button>
            </div>
          )}

          {dayEntries.length === 0 ? (
            <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-panel/40 p-8 text-center">
              <div>
                <div className="text-sm font-semibold text-gray-300">No trades logged for this date</div>
                <div className="mt-2 max-w-sm text-xs leading-5 text-gray-600">
                  Add your first trade. It will be saved automatically in this browser.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {dayEntries.map((entry) => (
                <article key={entry.id} className="rounded-xl border border-border bg-panel p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'rounded-md border px-2 py-1 text-[10px] font-bold',
                        entry.direction === 'long'
                          ? 'border-green-500/50 bg-green-500/10 text-green-300'
                          : 'border-red-500/50 bg-red-500/10 text-red-300',
                      )}
                    >
                      {entry.direction.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold tabular-nums text-gray-100">{entry.time}</span>
                        <span className="text-xs text-gray-400">{entry.setup}</span>
                        {entry.keyLevel && <span className="text-[11px] text-blue-300">@ {entry.keyLevel}</span>}
                      </div>
                    </div>
                    <div className={cn('text-base font-bold tabular-nums', entry.pnlPoints >= 0 ? 'text-green-300' : 'text-red-300')}>
                      {formatPoints(entry.pnlPoints)}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[
                      ['At level', entry.priorCandleAtKeyLevel],
                      ['Touched', entry.priorCandleTouchedKeyLevel],
                      ['Closed past', entry.priorCandleClosedPastKeyLevel],
                    ].map(([label, yes]) => (
                      <span
                        key={String(label)}
                        className={cn(
                          'rounded border px-2 py-1 text-[10px]',
                          yes
                            ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                            : 'border-border text-gray-600',
                        )}
                      >
                        {label}: {yes ? 'Yes' : 'No'}
                      </span>
                    ))}
                  </div>

                  {entry.comments && (
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-gray-400">{entry.comments}</p>
                  )}

                  <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
                    <button type="button" onClick={() => startEditing(entry)} className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-gray-500 hover:bg-white/5 hover:text-gray-200">
                      <Edit3 size={13} /> Edit
                    </button>
                    <button type="button" onClick={() => duplicateTrade(entry)} className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-gray-500 hover:bg-white/5 hover:text-gray-200">
                      <Copy size={13} /> Duplicate
                    </button>
                    <button type="button" onClick={() => removeTrade(entry)} className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-gray-500 hover:bg-red-500/10 hover:text-red-300">
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
