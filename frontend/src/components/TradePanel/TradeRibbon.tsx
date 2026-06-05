import { useReplayStore } from '@/stores/replayStore';
import { useTradeStore } from '@/stores/tradeStore';
import { cn } from '@/lib/utils';

const STEP = 5; // pts per +/- click

export function TradeRibbon({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { candles, currentIndex } = useReplayStore();
  const { openTrade, tradeLog, cancelTrade, updateStopPrice, updateTargetPrice, flatten } = useTradeStore();

  const currentPrice = candles[currentIndex]?.close ?? 0;
  const sessionPnl   = tradeLog.reduce((s, t) => s + (t.result_points ?? 0), 0);

  const unrealized =
    openTrade != null
      ? openTrade.direction === 'long'
        ? currentPrice - openTrade.entry_price
        : openTrade.entry_price - currentPrice
      : null;

  function handleCancel() {
    if (window.confirm('Cancel trade (no log entry)?')) cancelTrade();
  }

  function handleFlatten() {
    const c = candles[currentIndex];
    if (c && openTrade) flatten(c.time, c.close);
  }

  return (
    <div className="flex items-center gap-3 px-3 h-8 min-w-0 overflow-x-auto shrink-0 text-xs">

      {openTrade ? (
        <>
          {/* Direction badge */}
          <span className={cn(
            'shrink-0 px-2 py-0.5 rounded font-bold',
            openTrade.direction === 'long' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300',
          )}>
            {openTrade.direction === 'long' ? 'LONG' : 'SHORT'} @ {openTrade.entry_price.toFixed(2)}
          </span>

          {/* SL */}
          <span className="shrink-0 text-gray-500">SL</span>
          <button
            onClick={() => updateStopPrice(openTrade.stop_price + STEP)}
            className="px-1 text-gray-400 hover:text-white border border-border rounded"
          >+</button>
          <span className="shrink-0 tabular-nums text-red-400">{openTrade.stop_price.toFixed(2)}</span>
          <button
            onClick={() => updateStopPrice(openTrade.stop_price - STEP)}
            className="px-1 text-gray-400 hover:text-white border border-border rounded"
          >−</button>

          {/* TP */}
          <span className="shrink-0 text-gray-500 ml-1">TP</span>
          <button
            onClick={() => updateTargetPrice(openTrade.target_price + STEP)}
            className="px-1 text-gray-400 hover:text-white border border-border rounded"
          >+</button>
          <span className="shrink-0 tabular-nums text-green-400">{openTrade.target_price.toFixed(2)}</span>
          <button
            onClick={() => updateTargetPrice(openTrade.target_price - STEP)}
            className="px-1 text-gray-400 hover:text-white border border-border rounded"
          >−</button>

          {/* Unrealized P&L */}
          {unrealized !== null && (
            <span className={cn('shrink-0 tabular-nums font-bold ml-1', unrealized >= 0 ? 'text-green-400' : 'text-red-400')}>
              {unrealized >= 0 ? '+' : ''}{unrealized.toFixed(2)} pts
            </span>
          )}

          {/* Actions */}
          <button
            onClick={handleFlatten}
            className="shrink-0 px-2 py-0.5 rounded border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 ml-1"
            title="Close at market (F)"
          >FLAT</button>
          <button
            onClick={handleCancel}
            className="shrink-0 px-2 py-0.5 rounded border border-gray-700 text-gray-500 hover:text-red-400 hover:border-red-600"
            title="Cancel trade (no log entry)"
          >Cancel</button>
        </>
      ) : (
        <span className="text-gray-600">No position</span>
      )}

      <div className="flex-1" />

      {/* Session P&L */}
      <span className={cn('shrink-0 tabular-nums font-bold', sessionPnl >= 0 ? 'text-green-400' : 'text-red-400')}>
        {sessionPnl >= 0 ? '+' : ''}{sessionPnl.toFixed(2)} pts
      </span>

      {/* Expand / collapse toggle */}
      <button
        onClick={onToggle}
        className="shrink-0 px-2 py-0.5 text-gray-500 hover:text-gray-200 border border-border rounded ml-1"
        title={expanded ? 'Collapse trade panel' : 'Expand trade panel'}
      >{expanded ? '▼' : '▲'}</button>
    </div>
  );
}
