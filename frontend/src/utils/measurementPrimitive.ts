import { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  ISeriesPrimitiveBase,
  Logical,
} from 'lightweight-charts';

export interface MeasurePoint {
  logical: Logical;
  price: number;
}

function fmtPrice(price: number) {
  return price.toFixed(2);
}

function fmtDiff(from: number, to: number) {
  const diff = to - from;
  const abs = Math.abs(diff);
  const pct = from === 0 ? 0 : (diff / from) * 100;
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  return `${sign}${abs.toFixed(2)} pts  ${sign}${Math.abs(pct).toFixed(2)}%`;
}

class MeasurementRenderer implements ISeriesPrimitivePaneRenderer {
  private readonly _chart: IChartApi;
  private readonly _series: ISeriesApi<'Candlestick'>;
  private readonly _start: MeasurePoint;
  private readonly _end: MeasurePoint | null;

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    start: MeasurePoint,
    end: MeasurePoint | null,
  ) {
    this._chart = chart;
    this._series = series;
    this._start = start;
    this._end = end;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const x1 = this._chart.timeScale().logicalToCoordinate(this._start.logical);
    const y1 = this._series.priceToCoordinate(this._start.price as never);
    if (x1 === null || y1 === null) return;

    const x1Px = x1 as unknown as number;
    const y1Px = y1 as unknown as number;
    const end = this._end;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.save();
      ctx.font = '11px ui-monospace, "Cascadia Code", Consolas, monospace';
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(88, 166, 255, 0.7)';
      ctx.fillStyle = 'rgba(88, 166, 255, 0.85)';

      if (!end) {
        ctx.beginPath();
        ctx.arc(x1Px, y1Px, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      const x2 = this._chart.timeScale().logicalToCoordinate(end.logical);
      const y2 = this._series.priceToCoordinate(end.price as never);
      if (x2 === null || y2 === null) {
        ctx.restore();
        return;
      }

      const x2Px = x2 as unknown as number;
      const y2Px = y2 as unknown as number;
      const high = Math.max(this._start.price, end.price);
      const low = Math.min(this._start.price, end.price);
      const diffLabel = fmtDiff(this._start.price, end.price);
      const rangeLabel = `High ${fmtPrice(high)}  Low ${fmtPrice(low)}`;

      ctx.beginPath();
      ctx.moveTo(x1Px, y1Px);
      ctx.lineTo(x2Px, y2Px);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x1Px, y1Px, 2.5, 0, Math.PI * 2);
      ctx.arc(x2Px, y2Px, 2.5, 0, Math.PI * 2);
      ctx.fill();

      const labelW = Math.ceil(Math.max(ctx.measureText(diffLabel).width, ctx.measureText(rangeLabel).width)) + 16;
      const labelH = 38;
      const midX = (x1Px + x2Px) / 2;
      const midY = (y1Px + y2Px) / 2;
      const left = Math.min(Math.max(8, midX - labelW / 2), Math.max(8, mediaSize.width - labelW - 8));
      const top = Math.min(Math.max(8, midY - labelH - 10), Math.max(8, mediaSize.height - labelH - 8));

      ctx.fillStyle = 'rgba(13, 17, 23, 0.82)';
      ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)';
      ctx.beginPath();
      ctx.roundRect(left, top, labelW, labelH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(230, 237, 243, 0.92)';
      ctx.fillText(diffLabel, left + 8, top + 15);
      ctx.fillStyle = 'rgba(139, 148, 158, 0.95)';
      ctx.fillText(rangeLabel, left + 8, top + 30);

      ctx.restore();
    });
  }
}

class MeasurementView implements ISeriesPrimitivePaneView {
  private readonly _chart: IChartApi;
  private readonly _series: ISeriesApi<'Candlestick'>;
  private readonly _start: MeasurePoint;
  private readonly _end: MeasurePoint | null;

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    start: MeasurePoint,
    end: MeasurePoint | null,
  ) {
    this._chart = chart;
    this._series = series;
    this._start = start;
    this._end = end;
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new MeasurementRenderer(this._chart, this._series, this._start, this._end);
  }

  zOrder(): 'top' { return 'top'; }
}

export class MeasurementPrimitive implements ISeriesPrimitiveBase {
  private readonly _chart: IChartApi;
  private readonly _series: ISeriesApi<'Candlestick'>;
  private _start: MeasurePoint;
  private _end: MeasurePoint | null;
  private _view: MeasurementView | null;
  private _requestUpdate: (() => void) | null = null;

  constructor(
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    start: MeasurePoint,
    end: MeasurePoint | null,
  ) {
    this._chart = chart;
    this._series = series;
    this._start = start;
    this._end = end;
    this._view = new MeasurementView(chart, series, start, end);
  }

  update(start: MeasurePoint, end: MeasurePoint | null): void {
    this._start = start;
    this._end = end;
    this._view = new MeasurementView(this._chart, this._series, this._start, this._end);
    this._requestUpdate?.();
  }

  clear(): void {
    this._view = null;
    this._requestUpdate?.();
  }

  attached(param: { requestUpdate: () => void }): void {
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._requestUpdate = null;
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return this._view ? [this._view] : [];
  }
}
