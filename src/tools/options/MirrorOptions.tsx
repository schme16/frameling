// Mirror drawing options, the same on a pixel layer and a vector layer: off, left and right, top and bottom or both
// ways, and where the mirror lines sit (in art pixels on a pixel layer, in page pixels on a vector one).
import { findLayer } from '../../core/doc';
import { useStore } from '../../core/store';
import { ActionButton, Choice, Slider } from '../../canvas/controls';
import { setPixelSettings, usePixelSettings, type SymmetryMode } from '../../pixel/settings';

/** The page size the lines are counted over: art pixels on a pixel layer (the grid), page pixels on a vector one. */
function useSpan(): { vector: boolean; w: number; h: number } {
  const ps = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' ? l.pixelSize : 0;
  });
  const dw = useStore((s) => s.doc.width);
  const dh = useStore((s) => s.doc.height);
  return ps ? { vector: false, w: Math.ceil(dw / ps), h: Math.ceil(dh / ps) } : { vector: true, w: dw, h: dh };
}

/** Mirror drawing: off, left and right, top and bottom, or all four ways, and where the mirror lines sit. */
export function MirrorOptions() {
  const mode = usePixelSettings((s) => s.symmetry);
  const pxX = usePixelSettings((s) => s.axisX);
  const pxY = usePixelSettings((s) => s.axisY);
  const vecX = usePixelSettings((s) => s.vectorAxisX);
  const vecY = usePixelSettings((s) => s.vectorAxisY);
  const span = useSpan();
  const vector = span.vector;
  const ax = vector ? vecX : pxX;
  const ay = vector ? vecY : pxY;
  const { w, h } = span;
  const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : `${Math.floor(v)}½`);
  const step = vector ? 1 : 0.5;
  const lo = vector ? 0 : 0.5;
  const setX = (v: number | null) => setPixelSettings(vector ? { vectorAxisX: v } : { axisX: v });
  const setY = (v: number | null) => setPixelSettings(vector ? { vectorAxisY: v } : { axisY: v });
  return (
    <div className="px-mirror">
      <Choice<SymmetryMode>
        label="Mirror drawing"
        value={mode}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'h', label: 'Left and right', title: 'Whatever you draw on one side appears flipped on the other (a mirror line down the middle).' },
          { value: 'v', label: 'Top and bottom', title: 'A mirror line across the middle.' },
          { value: 'both', label: 'Both ways', title: 'Four ways at once, like a snowflake.' },
        ]}
        onChange={(v) => setPixelSettings({ symmetry: v })}
      />
      {mode !== 'off' && w > 0 && (
        <>
          {(mode === 'h' || mode === 'both') && (
            <Slider label="Mirror line across" value={ax ?? w / 2} min={lo} max={vector ? w : w - 0.5} step={step} format={(v) => (ax === null ? `Middle (${fmt(v)})` : fmt(v))} onChange={(v) => setX(v)} />
          )}
          {(mode === 'v' || mode === 'both') && (
            <Slider label="Mirror line down" value={ay ?? h / 2} min={lo} max={vector ? h : h - 0.5} step={step} format={(v) => (ay === null ? `Middle (${fmt(v)})` : fmt(v))} onChange={(v) => setY(v)} />
          )}
          {(ax !== null || ay !== null) && <ActionButton onClick={() => (setX(null), setY(null))}>Back to the middle</ActionButton>}
        </>
      )}
    </div>
  );
}
