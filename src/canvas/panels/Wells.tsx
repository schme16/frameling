// The fill and stroke colour boxes, Illustrator style: the fill is a solid square at the back-left, the stroke a
// square with a hole at the front-right, and the one you clicked comes to the front. Used in the Colours panel and
// in the shape tools' options.
import { useStore } from '../../core/store';
import { resetColors, setActiveNone, setActiveWell, swapColors } from '../../tools/wells';
import { Icon } from '../../ui/icons';
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
      aria-label={`${label}: ${color ?? 'none'}${front ? ' (in front)' : ''}`}
      title={`${label}: ${color ?? 'none'}. Click to bring it to the front (X).`}
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
    <div className="cv-wells" data-quest="color-wells">
      <div className="cv-wells-stack" data-overlaps data-see-through={seeThrough}>
        <Box which="fill" color={fill} front={active === 'fill'} />
        <Box which="stroke" color={stroke} front={active === 'stroke'} />
      </div>
      <div className="cv-wells-actions">
        <button type="button" className="cv-wells-btn" title="Swap fill and stroke (Shift+X)" aria-label="Swap fill and stroke colours" onClick={swapColors}>
          <Icon name="loop" size={14} />
        </button>
        <button type="button" className="cv-wells-btn" title="Default colours: theme fill, black stroke (Shift+D)" aria-label="Default colours" onClick={resetColors}>
          <span className="cv-wells-mini" aria-hidden="true" />
        </button>
        <button type="button" className="cv-wells-btn" title={`No ${active} (/)`} aria-label={`Set ${active} to none`} onClick={setActiveNone}>
          <span className="cv-wells-none" aria-hidden="true" />
        </button>
      </div>
      <div className="cv-wells-text">
        <strong>{active === 'fill' ? 'Fill' : 'Stroke'}</strong>
        <span>{active === 'fill' ? 'Shape insides and the paint bucket' : 'Lines, and shape outlines'}</span>
      </div>
    </div>
  );
}
