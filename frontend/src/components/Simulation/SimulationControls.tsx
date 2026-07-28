import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSimulationStore } from '@/stores/simulationStore';
import type { SimulationSpeed } from '@/types/simulation';

const SPEEDS: SimulationSpeed[] = [1, 2, 5, 10];

function formatRemaining(progress: number): string {
  const remaining = Math.max(0, Math.ceil(600 * (1 - progress)));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function SimulationControls({ compact = false }: { compact?: boolean }) {
  const { phase, speed, progress, togglePlay, setSpeed } = useSimulationStore();
  const canPlay = phase === 'ready' || phase === 'playing';

  return (
    <div className={cn('flex items-center', compact ? 'gap-2' : 'min-w-0 flex-1 gap-3')}>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!canPlay}
        className={cn(
          'grid place-items-center rounded border border-blue-500/70 bg-blue-600 text-white disabled:opacity-30',
          compact ? 'h-9 w-10' : 'h-7 w-8',
        )}
        aria-label={phase === 'playing' ? 'Pause simulation' : 'Play simulation'}
      >
        {phase === 'playing' ? <Pause size={15} /> : <Play size={15} />}
      </button>

      <div className={cn('min-w-0', compact ? 'flex-1' : 'w-36')}>
        <div className="h-1 overflow-hidden rounded bg-gray-800">
          <div className="h-full bg-blue-500 transition-[width] duration-75" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-gray-500">
          <span>{phase === 'complete' ? 'Complete' : phase === 'loading' ? 'Loading' : 'Live ticks'}</span>
          <span>{formatRemaining(progress)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSpeed(value)}
            className={cn(
              'rounded border px-1.5 py-1 text-[11px] tabular-nums',
              value === speed
                ? 'border-blue-500 bg-blue-600 text-white'
                : 'border-border text-gray-500',
            )}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  );
}
