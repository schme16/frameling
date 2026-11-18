// The fill and stroke colour boxes, Illustrator style: the fill is a solid square at the back-left, the stroke a
// square with a hole at the front-right, and the one you clicked comes to the front, lifted and ringed. A curved swap
// arrow sits in the free top corner and the default pair in the bottom one (WellCorners.tsx). Used in the Colours panel
// and in the shape tools' options; the row of kinds (None, Solid, Linear...) under them is PaintKinds.tsx.
import { useStore } from '../../core/store';
import { resetColors, setActiveWell, swapColors } from '../../tools/wells';
import { DefaultCorner, SwapCorner } from './WellCorners';
import { isMixed, useGradientWells, usePaintView, wellIsNone, wellShows } from '../../tools/gradient-wells';
import { gradientCss } from '../../core/gradient';
import { usePaintWells } from '../../tools/pixelWells';
import { PaintWells } from '../../pixel/PaintWells';

function Box({ which, color, front }: { which: 'fill' | 'stroke'; color: string | null; front: boolean }) {
  const label = which === 'fill' ? 'Fill colour' : 'Stroke colour';
  const boxGradient = useGradientWells((s) => (color ? s[which] : null));
  // What the box shows follows the picked shapes: their gradient or colour, "mixed" when they differ (or some have
  // nothing there), and the red slash for "none" when the picked shapes have nothing on this side.
  const view = usePaintView(which);
  const mixed = isMixed(view);
  const bare = view.from === 'none';
  const shown = mixed ? null : wellShows(view, color);
  const g = view.from === 'selection' ? view.style : view.from === 'box' ? boxGradient : null;
  const style = mixed ? ({ '--well': 'var(--panel-2)' } as React.CSSProperties) : shown ? ({ '--well': shown, ...(g ? { '--wellg': gradientCss(g, g.angle) } : {}) } as React.CSSProperties) : undefined;
  color = mixed ? 'mixed' : shown;
  return (
    <button
      type="button"
      className={`cv-well cv-well-${which}${front ? ' is-front' : ''}${color ? '' : ' is-none'}${g || mixed ? ' has-grad' : ''}${mixed ? ' is-mixed' : ''}`}
      style={style}
      aria-pressed={front}
      aria-label={`${label}: ${color ?? 'none'}${front ? ', the one you are changing' : ''}`}
      title={front ? `${label}: ${color ?? 'none'}. This is the one the picker and swatches change. X switches to the other.` : `${label}: ${color ?? 'none'}. Click to change this one instead (X switches).`}
      data-control={`${which}-box`}
      aria-keyshortcuts="X"
      onClick={() => setActiveWell(which)}
    />
  );
}

export function Wells() {
  const fill = useStore((s) => s.ui.fillColor);
  const stroke = useStore((s) => (s.ui.strokeOn ? s.ui.color : null));
  const active = useStore((s) => s.ui.activeWell);
  // The box in front with nothing on it is see-through, so the box behind is cut away where they overlap: you see the
  // panel through the hole, not the other colour.
  const fillView = usePaintView('fill');
  const strokeView = usePaintView('stroke');
  const seeThrough = active === 'fill' && wellIsNone(fillView, fill) ? 'fill' : active === 'stroke' && wellIsNone(strokeView, stroke) ? 'stroke' : undefined;
  // The Pixel workspace has Paint and Back instead.
  const paintWells = usePaintWells();
  if (paintWells) return <PaintWells />;
  return (
    <div className="cv-wells" data-quest="color-wells" data-control="fill-stroke-boxes">
      <div className="cv-wells-stack" data-overlaps data-see-through={seeThrough} data-live={active} role="group" aria-label="Fill and stroke colours">
        <Box which="fill" color={fill} front={active === 'fill'} />
        <Box which="stroke" color={stroke} front={active === 'stroke'} />
        <SwapCorner onClick={swapColors} />
        <DefaultCorner onClick={resetColors} />
      </div>
      <div className="cv-wells-text">
        <strong>{active === 'fill' ? 'Fill' : 'Stroke'}</strong>
        <span>{active === 'fill' ? 'Shape insides and the paint bucket' : 'Lines, and shape outlines'}</span>
      </div>
    </div>
  );
}
