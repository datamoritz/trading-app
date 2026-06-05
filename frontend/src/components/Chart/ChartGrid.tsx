import { useChartLayoutStore } from '@/stores/chartLayoutStore';
import { ChartContainer } from './ChartContainer';

export function ChartGrid() {
  const { chartIds, addChart, removeChart } = useChartLayoutStore();

  const count   = chartIds.length;
  const is2Col  = count >= 2;
  const is2Row  = count >= 3;

  return (
    <div
      className="w-full h-full grid gap-px bg-border"
      style={{
        gridTemplateColumns: is2Col ? '1fr 1fr' : '1fr',
        gridTemplateRows:    is2Row ? '1fr 1fr' : '1fr',
      }}
    >
      {chartIds.map((id) => (
        <ChartContainer
          key={id}
          chartId={id}
          onRemove={count > 1 ? () => removeChart(id) : undefined}
          onAddChart={count < 4 ? addChart : undefined}
        />
      ))}
    </div>
  );
}
