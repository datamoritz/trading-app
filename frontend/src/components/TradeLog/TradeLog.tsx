import { useTradeStore } from '@/stores/tradeStore';
import { cn, formatPrice, formatPoints, formatTime } from '@/lib/utils';

export function TradeLog() {
  const { tradeLog, openTrade, clearLog } = useTradeStore();

  const allTrades = openTrade
    ? [...tradeLog, openTrade]
    : tradeLog;

  const totalPnl = tradeLog.reduce((sum, t) => sum + (t.result_points ?? 0), 0);

  return (
    <div className="flex-1 overflow-auto border-l border-border">
      <div className="flex items-center justify-between px-3 py-1 border-b border-border bg-panel sticky top-0">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Trade Log</span>
        <div className="flex items-center gap-3">
          <span className={cn('text-xs font-bold tabular-nums', totalPnl >= 0 ? 'text-green-400' : 'text-red-400')}>
            {formatPoints(totalPnl)} pts
          </span>
          <button onClick={clearLog} className="text-xs text-gray-600 hover:text-gray-400">
            Clear
          </button>
        </div>
      </div>

      {allTrades.length === 0 ? (
        <div className="text-xs text-gray-600 text-center py-4">No trades yet</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-border">
              <th className="text-left px-3 py-1 font-normal">Dir</th>
              <th className="text-right px-2 py-1 font-normal">Entry</th>
              <th className="text-right px-2 py-1 font-normal">Exit</th>
              <th className="text-right px-2 py-1 font-normal">Stop</th>
              <th className="text-right px-2 py-1 font-normal">Target</th>
              <th className="text-right px-2 py-1 font-normal">Time</th>
              <th className="text-right px-3 py-1 font-normal">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {allTrades.map((t) => {
              const isOpen = !t.exit_price;
              return (
                <tr key={t.trade_id} className={cn('border-b border-border', isOpen && 'bg-blue-950/30')}>
                  <td className="px-3 py-1">
                    <span className={cn('font-bold', t.direction === 'long' ? 'text-green-400' : 'text-red-400')}>
                      {t.direction === 'long' ? 'L' : 'S'}
                    </span>
                  </td>
                  <td className="text-right px-2 py-1 tabular-nums">{formatPrice(t.entry_price)}</td>
                  <td className="text-right px-2 py-1 tabular-nums text-gray-400">
                    {t.exit_price ? formatPrice(t.exit_price) : '—'}
                  </td>
                  <td className="text-right px-2 py-1 tabular-nums text-red-400">{formatPrice(t.stop_price)}</td>
                  <td className="text-right px-2 py-1 tabular-nums text-green-400">{formatPrice(t.target_price)}</td>
                  <td className="text-right px-2 py-1 tabular-nums text-gray-500">{formatTime(t.entry_time)}</td>
                  <td className={cn('text-right px-3 py-1 tabular-nums font-bold', isOpen ? 'text-gray-500' : t.result_points! >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {isOpen ? 'OPEN' : formatPoints(t.result_points!)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
