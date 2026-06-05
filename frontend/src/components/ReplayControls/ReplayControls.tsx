import { Pause, Play, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react';
import { useReplayStore, type ReplaySpeed } from '@/stores/replayStore';
import { cn } from '@/lib/utils';

const SPEEDS: ReplaySpeed[] = [1, 2, 5, 10];

export function ReplayControls() {
  const { isPlaying, speed, currentIndex, candles, togglePlay, stepBack, stepForward, setSpeed, setIndex } =
    useReplayStore();

  const progress = candles.length > 0 ? currentIndex / (candles.length - 1) : 0;

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const idx = Math.round(Number(e.target.value) * (candles.length - 1));
    setIndex(idx);
  }

  return (
    <div className="flex items-center gap-3 flex-1">
      {/* Step back */}
      <button
        className="icon-btn"
        onClick={stepBack}
        disabled={currentIndex === 0}
        title="Step back (←)"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Play / Pause */}
      <button
        className="icon-btn text-blue-400"
        onClick={togglePlay}
        title="Play / Pause (Space)"
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>

      {/* Step forward */}
      <button
        className="icon-btn"
        onClick={stepForward}
        disabled={currentIndex >= candles.length - 1}
        title="Step forward (→)"
      >
        <ChevronRight size={16} />
      </button>

      {/* Jump to start / end */}
      <button
        className="icon-btn"
        onClick={() => setIndex(0)}
        title="Jump to start"
      >
        <SkipBack size={14} />
      </button>
      <button
        className="icon-btn"
        onClick={() => setIndex(candles.length - 1)}
        title="Jump to end"
      >
        <SkipForward size={14} />
      </button>

      {/* Scrub bar */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.0001}
        value={progress}
        onChange={handleScrub}
        className="flex-1 h-1 accent-blue-500 cursor-pointer"
        style={{ maxWidth: '200px' }}
      />

      {/* Candle counter */}
      <span className="text-xs text-gray-500 tabular-nums w-24">
        {currentIndex + 1} / {candles.length}
      </span>

      {/* Speed selector */}
      <div className="flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={cn(
              'px-2 py-0.5 rounded text-xs border',
              s === speed
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-panel border-border text-gray-400 hover:text-gray-200',
            )}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
