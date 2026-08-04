interface Props {
  onChoose: (mode: 'standard' | 'simulation' | 'journal') => void;
}

export function LaunchModeChooser({ onChoose }: Props) {
  return (
    <main className="grid min-h-dvh w-screen place-items-center bg-surface px-5 text-gray-200">
      <section className="w-full max-w-xl">
        <div className="mb-7 text-center">
          <div className="text-xs font-bold tracking-[0.28em] text-blue-400">NQ TRAINER</div>
          <h1 className="mt-3 text-2xl font-semibold text-gray-100">Choose a mode</h1>
          <p className="mt-2 text-sm text-gray-500">Practice, replay, or quickly record your live trades.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onChoose('simulation')}
            className="group rounded-xl border border-blue-500/60 bg-blue-500/10 p-5 text-left transition hover:border-blue-400 hover:bg-blue-500/15"
          >
            <div className="text-sm font-semibold text-blue-300">Simulation</div>
            <div className="mt-2 text-lg font-semibold text-gray-100">Blind large candle</div>
            <div className="mt-2 text-xs leading-5 text-gray-400">
              Random setup · exact ticks · 1m, 5m and 22R · 10-minute window
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChoose('standard')}
            className="rounded-xl border border-border bg-panel p-5 text-left transition hover:border-gray-500"
          >
            <div className="text-sm font-semibold text-gray-400">Replay</div>
            <div className="mt-2 text-lg font-semibold text-gray-100">Full session</div>
            <div className="mt-2 text-xs leading-5 text-gray-500">
              Browse historical dates and step through the regular session replay.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChoose('journal')}
            className="rounded-xl border border-green-500/40 bg-green-500/5 p-5 text-left transition hover:border-green-400 hover:bg-green-500/10"
          >
            <div className="text-sm font-semibold text-green-300">Journal</div>
            <div className="mt-2 text-lg font-semibold text-gray-100">Log live trades</div>
            <div className="mt-2 text-xs leading-5 text-gray-500">
              Fast manual entry · daily totals · saved locally in this browser
            </div>
          </button>
        </div>
      </section>
    </main>
  );
}
