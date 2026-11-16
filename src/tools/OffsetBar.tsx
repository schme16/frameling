// "Offset path": a small card over the stage with a distance slider, in or out, and round or sharp corners. The stage
// shows the copy as you slide, and nothing is changed until you press the button, as one undo step.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Id } from '../core/format';
import { store } from '../core/store';
import { setLive } from '../canvas/controller';
import { MAX_OFFSET, offsetShapes, type OffsetCorners } from '../geometry/offset';
import { activeLayer } from './edit';
import { selectionTarget, type Target } from './select-land';
import { applyOffset, offsetDistance, offsetWords, rememberOffset, signedDistance } from './offset';
import './strokeLine.css';

function Bar({ target, ids, layerId, close }: { target: Target; ids: Set<Id>; layerId: Id; close: () => void }) {
  const start = offsetDistance();
  const [px, setPx] = useState(Math.abs(start.distance));
  const [dir, setDir] = useState<'out' | 'in'>(start.distance < 0 ? 'in' : 'out');
  const [corners, setCorners] = useState<OffsetCorners>(start.corners);
  const slider = useRef<HTMLInputElement>(null);
  const d = signedDistance(dir, px);
  const made = useMemo(() => offsetShapes(target.drawing.shapes, ids, d, corners, 'copy'), [target, ids, d, corners]);

  // The stage shows the result while the card is open.
  useEffect(() => {
    setLive({ layerId, kind: 'vector', drawing: { ...target.drawing, shapes: typeof made === 'string' ? target.drawing.shapes : made.shapes } });
  }, [made, layerId, target]);
  useEffect(() => {
    slider.current?.focus();
    // Anything else changing the drawing or the selection ends it, so the preview never outlives what it was made for.
    const was = store().get();
    const off = store().subscribe(() => {
      const now = store().get();
      if (now.doc !== was.doc || now.ui.selection !== was.ui.selection || now.ui.frame !== was.ui.frame || now.ui.activeLayerId !== was.ui.activeLayerId) close();
    });
    return () => {
      off();
      setLive(null);
    };
  }, []);

  const apply = () => {
    rememberOffset(d, corners);
    close();
    applyOffset(d, corners);
  };

  const problem = typeof made === 'string' ? offsetWords.problem(made, dir) : null;
  return (
    <div
      className="sl-bar"
      role="dialog"
      aria-label="Offset path"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) apply();
      }}
    >
      <div className="sl-title">Copy a bit bigger or smaller</div>
      <p className="sl-note">Makes a copy of {ids.size === 1 ? 'this shape' : `these ${ids.size} shapes`} the same distance away all the way round. Good for an outline round a character, or a second line.</p>
      <div className="sl-row">
        <span>Which way</span>
        <div role="group" aria-label="Which way" style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`io-btn${dir === 'out' ? ' io-primary' : ''}`} aria-pressed={dir === 'out'} onClick={() => setDir('out')}>
            Bigger
          </button>
          <button type="button" className={`io-btn${dir === 'in' ? ' io-primary' : ''}`} aria-pressed={dir === 'in'} onClick={() => setDir('in')}>
            Smaller
          </button>
        </div>
      </div>
      <label className="sl-row">
        <span>Distance</span>
        <input ref={slider} type="range" min={1} max={60} value={Math.min(60, Math.max(1, Math.round(px)))} aria-label="Distance in pixels" onChange={(e) => setPx(Number(e.target.value))} />
      </label>
      <div className="sl-ends">
        <span>{Math.round(px)} px</span>
        <span>{MAX_OFFSET > 60 ? '60 px' : `${MAX_OFFSET} px`}</span>
      </div>
      <div className="sl-row">
        <span>Corners</span>
        <div role="group" aria-label="Corners" style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={`io-btn${corners === 'round' ? ' io-primary' : ''}`} aria-pressed={corners === 'round'} onClick={() => setCorners('round')}>
            Round
          </button>
          <button type="button" className={`io-btn${corners === 'sharp' ? ' io-primary' : ''}`} aria-pressed={corners === 'sharp'} onClick={() => setCorners('sharp')}>
            Sharp
          </button>
        </div>
      </div>
      <p className="sl-count" aria-live="polite">
        {problem ?? (dir === 'out' ? 'The copy goes behind the original.' : 'The copy goes in front of the original.')}
      </p>
      <div className="sl-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" onClick={apply} disabled={!!problem}>
          Make the copy
        </button>
      </div>
    </div>
  );
}

let open: (() => void) | null = null;

/** Opens the card for the selected shapes. Returns false (after saying why) when there is nothing to offset. */
export function openOffsetBar(): boolean {
  const t = selectionTarget();
  const { layer } = activeLayer();
  if (!t || !layer) {
    offsetWords.tellNothingPicked();
    return false;
  }
  open?.();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    open = null;
    // After this turn, so closing from inside a store notification doesn't unmount mid-render.
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 0);
  };
  open = close;
  root.render(<Bar target={t} ids={new Set(t.originals.map((s) => s.id))} layerId={layer.id} close={close} />);
  return true;
}
