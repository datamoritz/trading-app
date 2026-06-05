# NQ Trainer — Frontend Spec

## One-line goal
Local React app for replaying historical NQ 1-minute sessions candle by candle, with signal overlays and manual trade entry.

## Stack
- React 19 + Vite + TypeScript (strict)
- TradingView Lightweight Charts v4 (canvas, `addCandlestickSeries` / `addHistogramSeries`)
- Zustand (three stores, no middleware)
- Tailwind v3 + utility classes (no shadcn component library, just Tailwind)
- FastAPI backend — `src/api/client.ts` stubs only, not wired

## Layout
```
┌─ header (h-12) ──────────────────────────────────────────────────────┐
│  NQ TRAINER | Session selector | Replay controls                      │
├─ main (flex-1) ──────────────────────────────────────────────────────┤
│  ChartContainer                                                        │
│    ├─ toolbar (timeframe toggle, VP/Δ toggles)                         │
│    ├─ [chart column (flex-1)]          [▐ drag] [VolumeProfile?]      │
│    │    ├─ MainChart (flex-1)                  │ ← VP spans full      │
│    │    ├─ [▬ drag handle]                     │   height of both     │
│    │    └─ DeltaChart (fixed h, resizable)     │   main + delta       │
├─ footer (h-44) ──────────────────────────────────────────────────────┤
│  TradePanel | TradeLog                                                 │
└──────────────────────────────────────────────────────────────────────┘
```
Resize handles: horizontal drag on VP left edge (wider/narrower), vertical drag between main and delta (taller/shorter delta).

## Stores

### replayStore
- `candles: Candle[]` — full 1m session (390 bars)
- `signals: Signal[]` — mock signal markers
- `currentIndex` — pointer into candles; controls what's visible
- `isPlaying`, `speed: 1|2|5|10` — interval managed in `useReplayInterval` hook in App.tsx
- `loadSession(date)` — replaces candles+signals, resets index
- `stepForward / stepBack / setIndex` — manual navigation

### chartStore
- `activeTimeframe: '1m'|'5m'|'1h'` — aggregation applied at render time
- `showVolumeProfile`, `showDelta` — panel visibility booleans

### tradeStore
- `openTrade: Trade | null` — at most one open position
- `tradeLog: Trade[]` — closed trades for the session
- `enterTrade` — no-op if openTrade exists
- `flatten(exitTime, exitPrice)` — closes openTrade, computes result_points

## Key design decisions
- **Timeframe aggregation** happens in `MainChart` on every render: `aggregateCandles(candles.slice(0, currentIndex+1), tf)`. Delta chart always uses 1m data.
- **Signal markers** filtered by `signal.timestamp <= candles[currentIndex].time` before calling `series.setMarkers()`.
- **Price lines** (entry/stop/target) created via `series.createPriceLine()`, refs cleared on trade close.
- **Replay interval** lives in a `useReplayInterval` hook in App.tsx, not in the store, so the store stays serializable.
- **Hotkeys** (`Space`, `←→`, `L`, `S`, `F`) scoped to non-input elements via tagName guard.
- **Trade defaults**: stop = 10 pts, target = 20 pts. Entry at current candle's close.
- **VolumeProfile**: canvas-rendered, body-weighted distribution. 65% of each 1m candle's volume goes uniformly across body ticks, 35% across all wick ticks with uniform density (longer wick = proportionally more). Always computed from 1m bars regardless of active timeframe. Bucket size = 0.25 pt (NQ tick). Keys stored as `Math.round(price * 4)` integers to avoid float errors. Rendered via `<canvas>` with ResizeObserver to track panel height. `utils/volumeProfile.ts`.
- **X-alignment**: both MainChart and DeltaChart set `rightPriceScale.minimumWidth: 70` so price scale widths are equal → chart content areas are the same pixel width → time scales are pixel-aligned.
- **Time sync**: `subscribeVisibleTimeRangeChange` on each chart, `setVisibleRange` on the other, guarded by a `syncingRef` flag to prevent feedback loops. Wired in `ChartContainer` via `onChartReady` callbacks.
- **Delta chart**: sign = candle direction × volume (mock). Real delta requires tick data from backend.

## Mock data
- `generateMockSession(date)` → 390 1m bars, NQ range 19000–21000, 0.25-pt increments
- `generateMockSignals(candles)` → 3–6 random signals per session
- `getMockSessionDates()` → 60 weekdays starting 2024-01-02

## API stubs (`src/api/client.ts`)
```
GET  /api/bars?date=&timeframe=   → Candle[]
GET  /api/signals?date=           → Signal[]
POST /api/trades                  → void
```
All throw on non-OK status. None are called yet — stores use mock data.

## To wire the real backend
1. Call `fetchBars` + `fetchSignals` inside `replayStore.loadSession`.
2. Call `saveTrade` inside `tradeStore.closeTrade`.
3. Remove mock data imports from store.
