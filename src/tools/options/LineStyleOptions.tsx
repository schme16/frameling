import type { ArrowHead } from '../../core/format';
import { Choice, MoreOptions } from '../../canvas/controls';
import { ARROW_HEADS, DASH_PRESETS, WIDTH_PRESETS, type DashKind, type WidthKind } from '../../geometry/lineStyle';
import { chooseArrow, chooseDash, chooseWidth } from '../lineStyle';
import { useToolSettings } from '../settings';

const DASHES = (Object.keys(DASH_PRESETS) as DashKind[]).map((k) => ({ value: k, label: k === 'dashdot' ? 'Dash dot' : DASH_PRESETS[k].label }));
const WIDTHS = (Object.keys(WIDTH_PRESETS) as WidthKind[]).map((k) => ({ value: k, label: WIDTH_PRESETS[k].label }));
const HEADS: { value: ArrowHead | 'none'; label: string }[] = [{ value: 'none', label: 'None' }, ...(Object.keys(ARROW_HEADS) as ArrowHead[]).map((k) => ({ value: k, label: ARROW_HEADS[k] }))];

/**
 * Dashes, arrow heads and a width that changes along the line, for the next shapes and for any picked. `arrows` is off for
 * shapes that have no open ends (rectangle, ellipse, polygon).
 */
export function LineStyleOptions({ arrows = true }: { arrows?: boolean }) {
  const t = useToolSettings((s) => s);
  return (
    <MoreOptions name="line-style" label="Dashes, arrows and width" hint="Dashed and dotted lines, arrow heads, tapered lines">
      <Choice<DashKind> label="Line" value={(DASH_PRESETS[t.lineDash as DashKind] ? t.lineDash : 'solid') as DashKind} options={DASHES} onChange={chooseDash} />
      {arrows && (
        <>
          <Choice<ArrowHead | 'none'> label="Arrow at the end" value={(t.arrowEnd in ARROW_HEADS ? t.arrowEnd : 'none') as ArrowHead | 'none'} options={HEADS} onChange={(v) => chooseArrow('end', v)} />
          <Choice<ArrowHead | 'none'> label="Arrow at the start" value={(t.arrowStart in ARROW_HEADS ? t.arrowStart : 'none') as ArrowHead | 'none'} options={HEADS} onChange={(v) => chooseArrow('start', v)} />
        </>
      )}
      <Choice<WidthKind> label="Width along the line" value={(WIDTH_PRESETS[t.lineWidth as WidthKind] ? t.lineWidth : 'even') as WidthKind} options={WIDTHS} onChange={chooseWidth} />
    </MoreOptions>
  );
}
