import { useEffect, useRef, useState } from 'react';
import type { IndicatorConfig } from '@/types/indicators';
import { cn } from '@/lib/utils';

const ITEMS: { key: keyof IndicatorConfig; label: string }[] = [
  { key: 'showIBHL',        label: 'IBH / IBL' },
  { key: 'showSessionOpen', label: 'Session Open' },
  { key: 'showPriorClose',  label: 'Prior Day Close' },
  { key: 'showPriorHL',     label: 'Prior Day H / L' },
  { key: 'showPriorVP',     label: 'Prior VAH / VAL / POC' },
  { key: 'showCurrentVP',   label: 'Current VAH / VAL / POC' },
  { key: 'showVWAP',        label: 'VWAP + Bands' },
];

interface Props {
  indicators: IndicatorConfig;
  onToggle: (key: keyof IndicatorConfig) => void;
}

export function IndicatorMenu({ indicators, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const anyActive = Object.values(indicators).some(Boolean);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'px-2 py-0.5 rounded text-xs border',
          anyActive || open
            ? 'border-blue-500 text-blue-400'
            : 'border-border text-gray-500 hover:text-gray-300',
        )}
        title="Indicators"
      >
        ⚙
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-panel border border-border rounded shadow-xl py-1 min-w-max">
          {ITEMS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left',
                indicators[key] ? 'text-blue-300' : 'text-gray-400 hover:text-gray-200',
              )}
            >
              <span
                className={cn(
                  'inline-flex w-3 h-3 shrink-0 items-center justify-center rounded-sm border',
                  indicators[key] ? 'border-blue-500 bg-blue-500' : 'border-gray-600',
                )}
              >
                {indicators[key] && (
                  <svg viewBox="0 0 8 8" className="w-2 h-2 fill-white">
                    <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
