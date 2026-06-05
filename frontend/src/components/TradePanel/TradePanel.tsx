import { useReplayStore } from '@/stores/replayStore';
import { useTradeStore } from '@/stores/tradeStore';
import { cn } from '@/lib/utils';

const DEFAULT_STOP_PTS   = 10;
const DEFAULT_TARGET_PTS = 20;
const STEP = 5;

export function TradePanel() {
  const { candles, currentIndex } = useReplayStore();
  const { openTrade, enterTrade, flatten, cancelTrade, updateStopPrice, updateTargetPrice } = useTradeStore();


  const currentCandle = candles[currentIndex];
  const price = currentCandle?.close ?? 0;

  function handleLong() {
    if (!currentCandle || openTrade) return;
    enterTrade({
      trade_id: crypto.randomUUID(),
      direction: 'long',
      entry_time: currentCandle.time,
      entry_price: price,
      stop_price:   price - DEFAULT_STOP_PTS,
      target_price: price + DEFAULT_TARGET_PTS,
    });
  }

  function handleShort() {
    if (!currentCandle || openTrade) return;
    enterTrade({
      trade_id: crypto.randomUUID(),
      direction: 'short',
      entry_time: currentCandle.time,
      entry_price: price,
      stop_price:   price + DEFAULT_STOP_PTS,
      target_price: price - DEFAULT_TARGET_PTS,
    });
  }

  function handleFlatten() {
    if (!currentCandle || !openTrade) return;
    flatten(currentCandle.time, price);
  }

  function handleCancel() {
    if (!openTrade) return;
    if (window.confirm('Cancel trade? (no log entry)')) cancelTrade();
  }

  return (
    <div className="flex flex-col border-r border-border min-w-[220px] shrink-0">
      {/* Panel header */}
      <div className="flex items-center px-3 py-1 border-b border-border bg-panel">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Trade</span>
      </div>

      <div className="flex-1 flex flex-col gap-2 px-3 py-2">

        {/* Entry buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleLong}
            disabled={!!openTrade}
            className="flex-1 py-1.5 rounded text-xs font-bold bg-green-700 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white"
            title="Long (L)"
          >LONG</button>
          <button
            onClick={handleShort}
            disabled={!!openTrade}
            className="flex-1 py-1.5 rounded text-xs font-bold bg-red-700 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white"
            title="Short (S)"
          >SHORT</button>
        </div>

        {/* Current price */}
        <div className="text-[11px] text-gray-600 tabular-nums text-center">
          @ {price.toFixed(2)}
        </div>

        {/* SL / TP adjustment — only when trade is open */}
        {openTrade && (
          <div className="flex flex-col gap-1.5 border border-border rounded px-2 py-1.5">
            <div className="flex items-center gap-1 text-xs">
              <span className="w-6 text-gray-500 shrink-0">SL</span>
              <button onClick={() => updateStopPrice(openTrade.stop_price - STEP)}
                className="px-1.5 text-gray-400 hover:text-white border border-border rounded">−</button>
              <span className="flex-1 text-center tabular-nums text-red-400">{openTrade.stop_price.toFixed(2)}</span>
              <button onClick={() => updateStopPrice(openTrade.stop_price + STEP)}
                className="px-1.5 text-gray-400 hover:text-white border border-border rounded">+</button>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="w-6 text-gray-500 shrink-0">TP</span>
              <button onClick={() => updateTargetPrice(openTrade.target_price - STEP)}
                className="px-1.5 text-gray-400 hover:text-white border border-border rounded">−</button>
              <span className="flex-1 text-center tabular-nums text-green-400">{openTrade.target_price.toFixed(2)}</span>
              <button onClick={() => updateTargetPrice(openTrade.target_price + STEP)}
                className="px-1.5 text-gray-400 hover:text-white border border-border rounded">+</button>
            </div>
            <div className="text-[10px] text-gray-700 text-center">
              drag SL/TP lines on chart to move freely
            </div>
          </div>
        )}

        {/* Exit / Cancel */}
        <div className="flex gap-2">
          <button
            onClick={handleFlatten}
            disabled={!openTrade}
            className={cn(
              'flex-1 py-1.5 rounded text-xs font-bold border disabled:opacity-30 disabled:cursor-not-allowed',
              openTrade
                ? 'bg-gray-600 hover:bg-gray-500 border-gray-500 text-white'
                : 'border-border text-gray-600',
            )}
            title="Flatten (F)"
          >FLAT</button>
          <button
            onClick={handleCancel}
            disabled={!openTrade}
            className="flex-1 py-1.5 rounded text-xs border border-gray-700 text-gray-500 hover:text-red-400 hover:border-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Cancel (no log)"
          >Cancel</button>
        </div>

      </div>
    </div>
  );
}
