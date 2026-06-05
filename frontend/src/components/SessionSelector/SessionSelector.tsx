import { useReplayStore } from '@/stores/replayStore';

export function SessionSelector() {
  const { sessionDate, availableDates, loadSession } = useReplayStore();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 uppercase tracking-widest">Session</span>
      <select
        className="bg-panel border border-border text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
        value={sessionDate}
        onChange={(e) => loadSession(e.target.value)}
      >
        {availableDates.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}
