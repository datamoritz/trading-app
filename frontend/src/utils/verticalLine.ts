import { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IChartApi,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  ISeriesPrimitiveBase,
  Time,
} from 'lightweight-charts';

class VLineRenderer implements ISeriesPrimitivePaneRenderer {
  private readonly _chart: IChartApi;
  private readonly _time: Time;
  private readonly _color: string;
  private readonly _dash: number;

  constructor(chart: IChartApi, time: Time, color: string, dash: number) {
    this._chart = chart;
    this._time = time;
    this._color = color;
    this._dash = dash;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const x = this._chart.timeScale().timeToCoordinate(this._time);
    if (x === null) return;
    const xPx = x as unknown as number;
    const color = this._color;
    const dash  = this._dash;
    target.useBitmapCoordinateSpace((scope) => {
      const bx  = Math.round(xPx * scope.horizontalPixelRatio);
      const d   = Math.max(1, Math.round(dash * scope.verticalPixelRatio));
      const ctx = scope.context;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = Math.max(1, Math.round(scope.horizontalPixelRatio));
      ctx.setLineDash([d, d]);
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx, scope.bitmapSize.height);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class VLineView implements ISeriesPrimitivePaneView {
  private readonly _chart: IChartApi;
  private readonly _time: Time;
  private readonly _color: string;
  private readonly _dash: number;

  constructor(chart: IChartApi, time: Time, color: string, dash: number) {
    this._chart = chart;
    this._time = time;
    this._color = color;
    this._dash = dash;
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new VLineRenderer(this._chart, this._time, this._color, this._dash);
  }

  zOrder(): 'bottom' { return 'bottom'; }
}

export class VerticalLine implements ISeriesPrimitiveBase {
  private readonly _view: VLineView;

  constructor(
    chart: IChartApi,
    time: Time,
    color = 'rgba(251,191,36,0.55)',
    dash  = 5,
  ) {
    this._view = new VLineView(chart, time, color, dash);
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return [this._view];
  }
}
