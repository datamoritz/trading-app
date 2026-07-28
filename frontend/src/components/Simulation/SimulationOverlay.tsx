import { useSimulationStore } from '@/stores/simulationStore';

export function SimulationOverlay() {
  const { phase, error, completedCount, totalCount, next } = useSimulationStore();
  if (phase !== 'loading' && phase !== 'complete' && phase !== 'error') return null;

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-[#0f1117]/75 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5 text-center shadow-2xl">
        {phase === 'loading' && (
          <>
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-gray-700 border-t-blue-400" />
            <div className="mt-4 text-sm font-semibold text-gray-200">Loading a blind setup…</div>
            <div className="mt-1 text-xs text-gray-500">Preparing exact tick history</div>
          </>
        )}

        {phase === 'complete' && (
          <>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Setup complete</div>
            <div className="mt-3 text-xl font-semibold text-gray-100">Ready for the next one?</div>
            <div className="mt-2 text-xs text-gray-500">{completedCount} of {totalCount} used this session</div>
            <button
              type="button"
              onClick={() => void next()}
              className="mt-5 w-full rounded-lg border border-blue-500 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Continue · Next setup
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="text-sm font-semibold text-red-300">Setup could not be loaded</div>
            <div className="mt-2 text-xs leading-5 text-gray-500">{error}</div>
            <button
              type="button"
              onClick={() => void next()}
              className="mt-5 w-full rounded-lg border border-border px-4 py-2.5 text-sm text-gray-200"
            >
              Try another setup
            </button>
          </>
        )}
      </div>
    </div>
  );
}
