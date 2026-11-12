// The fill and stroke colour boxes, Illustrator style: the fill is a solid square at the back-left, the stroke a
// square with a hole at the front-right, and the one you clicked comes to the front. Used in the Colours panel and
// in the shape tools' options.
import { useStore } from '../../core/store';
import { resetColors, setActiveNone, setActiveWell, swapColors } from '../../tools/wells';
import { Icon } from '../../ui/icons';
import { useGradientWells } from '../../tools/gradient-wells';
import { gradientCss } from '../../core/gradient';
import { usePaintWells } from '../../tools/pixelWells';
import { PaintWells } from '../../pixel/PaintWells';

function Box({ which, color, front }: { which: 'fill' | 'stroke'; color: string | null; front: boolean }) {
  const label = which === 'fill' ? 'Fill colour' : 'Stroke colour';
  const g = useGradientWells((s) => (color ? s[which] : null));
  const style = color ? ({ '--well': color, ...(g ? { '--wellg': gradientCss(g, g.angle) } : {}) } as React.CSSProperties) : undefined;
  return (
    <button
      type="button"
      className={`cv-well cv-well-${which}${front ? ' is-front' : ''}${color ? '' : ' is-none'}${g ? ' has-grad' : ''}`}
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
  // The Pixel workspace has Paint and Back instead.
  const paintWells = usePaintWells();
  if (paintWells) return <PaintWells />;
  return (
    <div className="cv-wells" data-quest="color-wells">
      <div className="cv-wells-stack">
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
