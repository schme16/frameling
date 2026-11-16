// The gradient part of the Colours panel: Solid / Linear / Radial for the box in front, and for a gradient a bar of
// its colours with a marker per colour. Click a marker to change its colour with the picker above, drag it to move
// it, drag it off the bar (or press its x) to take it away, and click the bar to add a colour there. Shapes you have
// picked come first: when they share a gradient the bar is theirs, and when they differ it says so and offers to match.
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { gradientCss } from '../../core/gradient';
import { hasAlpha } from '../colors';
import { Choice, Slider, Tip } from '../controls';
import { getCommand } from '../../core/registry';
import { useStore } from '../../core/store';
import { addStop, bareWords, endGradientGesture, moveStop, removeStop, reverseStops, selectStop, setAngle, setPaintKind, useGradientWells, usePaintView, type PaintKind } from '../../tools/gradient-wells';

/** How far below the bar (in screen pixels) a dragged marker has to go to be taken away. */
const DRAG_OFF = 36;

// The A/B in brand/ab/gradient-editor: 'bar' (built: a bar with draggable markers) or 'list' (a row per colour, with
// a position slider and a remove button). Set before the panel opens, with ?debug and __framelingGradientLook('list').
let look: 'bar' | 'list' = 'bar';
if (typeof window !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingGradientLook: (l: 'bar' | 'list') => void }).__framelingGradientLook = (l) => void (look = l);
}

export function GradientEditor() {
  const well = useStore((s) => s.ui.activeWell);
  const view = usePaintView(well);
  const g = 'style' in view ? view.style : null;
  const sel = useGradientWells((s) => s.stop[well]);
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; moved: boolean; off: boolean } | null>(null);
  const mixed = view.from === 'differ' || view.from === 'colours';
  const kind: PaintKind = g?.kind ?? 'solid';

  const atOf = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
  };

  const markerDown = (i: number) => (e: RPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    selectStop(well, i);
    drag.current = { i, moved: false, off: false };
  };
  const markerMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || !bar.current) return;
    const r = bar.current.getBoundingClientRect();
    d.off = (g?.stops.length ?? 0) > 2 && e.clientY > r.bottom + DRAG_OFF;
    e.currentTarget.style.opacity = d.off ? '0.35' : '';
    d.moved = true;
    d.i = moveStop(well, d.i, atOf(e.clientX));
  };
  const markerUp = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.style.opacity = '';
    if (d?.off) removeStop(well, d.i);
    endGradientGesture();
  };

  return (
    <div className="cv-gradient" data-quest="gradient-editor">
      <Choice<PaintKind>
        label={well === 'fill' ? 'Fill' : 'Stroke'}
        value={mixed ? ('' as PaintKind) : kind}
        options={[
          { value: 'solid', label: 'Solid', title: 'One colour' },
          { value: 'linear', label: 'Linear', title: 'Colours blending along a straight line (linear gradient)' },
          { value: 'radial', label: 'Radial', title: 'Colours blending out from the middle in a circle (radial gradient)' },
        ]}
        onChange={(k) => {
          setPaintKind(well, k);
          endGradientGesture();
        }}
      />
      {bareWords(view, well) && (
        <p className="cv-tip" data-testid="paint-bare">
          {bareWords(view, well)}
        </p>
      )}
      {view.from === 'colours' && (
        <div className="cv-gradient-differ" role="group" aria-label="The picked shapes have different colours">
          <p className="cv-tip" data-testid="colour-differ">
            These {view.count} shapes have different colours. Click a swatch to give them all one.
          </p>
          <button type="button" className="cv-action" title="Give every picked shape the colour of the first one" onClick={() => getCommand('colors.matchColours')?.run()}>
            Make them all match the first
          </button>
        </div>
      )}
      {view.from === 'differ' && (
        <div className="cv-gradient-differ" role="group" aria-label="The picked shapes have different gradients">
          <p className="cv-tip" data-testid="gradient-differ">
            These {view.count} shapes have different gradients.
          </p>
          <button
            type="button"
            className="cv-action"
            title="Give every picked shape the colours and direction of the first one"
            onClick={() => getCommand('colors.matchGradients')?.run()}
          >
            Make them all match the first
          </button>
        </div>
      )}
      {g && look === 'list' && (
        <>
          <div className="cv-gradient-preview" style={{ backgroundImage: gradientCss({ kind: 'linear', stops: g.stops }) }} aria-hidden="true" />
          {g.stops.map((s, i) => (
            <div key={i} className="cv-gradient-item" data-on={i === sel}>
              <button type="button" className="cv-swatch" data-on={i === sel} aria-pressed={i === sel} style={{ backgroundColor: s.color }} aria-label={`Colour ${i + 1}: ${s.color}`} onClick={() => selectStop(well, i)} />
              <input type="range" className="cv-slider" min={0} max={100} value={Math.round(s.at * 100)} aria-label={`Where colour ${i + 1} sits`} onChange={(e) => moveStop(well, i, Number(e.target.value) / 100)} />
              <span className="cv-gradient-pct">{Math.round(s.at * 100)}%</span>
              <button type="button" className="cv-wells-btn" disabled={g.stops.length <= 2} aria-label={`Remove colour ${i + 1}`} onClick={() => removeStop(well, i)}>
                x
              </button>
            </div>
          ))}
          <div className="cv-gradient-row">
            <button type="button" className="cv-action" onClick={() => addStop(well, 0.5)}>
              Add a colour
            </button>
            <button type="button" className="cv-action" onClick={() => {
                reverseStops(well);
                endGradientGesture();
              }}>
              Reverse
            </button>
          </div>
          {g.kind === 'linear' && <Slider label="Direction" value={g.angle} min={0} max={359} format={(v) => `${v} deg`} onChange={(v) => setAngle(well, v)} />}
        </>
      )}
      {g && look === 'bar' && (
        <>
          <div
            className="cv-gradient-bar"
            ref={bar}
            role="group"
            aria-label="Gradient colours. Click to add a colour."
            title="Click to add a colour here"
            style={{ background: g.stops.some((s) => hasAlpha(s.color)) ? `${gradientCss({ kind: 'linear', stops: g.stops })}, var(--cp-checker)` : gradientCss({ kind: 'linear', stops: g.stops }) }}
            onPointerDown={(e) => {
              if (e.target === bar.current) {
                addStop(well, atOf(e.clientX));
                endGradientGesture();
              }
            }}
          >
            {g.stops.map((s, i) => (
              <button
                key={i}
                type="button"
                className="cv-gradient-stop"
                data-on={i === sel}
                aria-pressed={i === sel}
                aria-label={`Colour ${i + 1} of ${g.stops.length}: ${s.color} at ${Math.round(s.at * 100)}%`}
                title={`${s.color} at ${Math.round(s.at * 100)}%. Drag to move${g.stops.length > 2 ? ', drag down off the bar to remove' : ''}.`}
                style={{ left: `${s.at * 100}%`, ['--stop' as string]: s.color }}
                onPointerDown={markerDown(i)}
                onPointerMove={markerMove}
                onPointerUp={markerUp}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    moveStop(well, i, s.at + (e.key === 'ArrowLeft' ? -0.01 : 0.01) * (e.shiftKey ? 10 : 1));
                    endGradientGesture();
                  } else if ((e.key === 'Delete' || e.key === 'Backspace') && g.stops.length > 2) {
                    e.preventDefault();
                    e.stopPropagation();
                    removeStop(well, i);
                    endGradientGesture();
                  }
                }}
              />
            ))}
          </div>
          <div className="cv-gradient-row">
            {g.kind === 'linear' && <Slider label="Direction" value={g.angle} min={0} max={359} format={(v) => `${v} deg`} onChange={(v) => setAngle(well, v)} />}
            <button type="button" className="cv-action" title="Turn the colours round, end to end" onClick={() => {
                reverseStops(well);
                endGradientGesture();
              }}>
              Reverse
            </button>
          </div>
          <Tip>Pick a marker, then a colour above. Click the bar to add a colour, drag a marker down to remove it. The Gradient tool (F) sets the direction on the canvas.</Tip>
        </>
      )}
    </div>
  );
}
