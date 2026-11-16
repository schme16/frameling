// "Turn into an editable line": a small card over the stage with a Smoothness slider. The canvas shows the result as you
// slide it, and nothing is changed until you press the button, as one undo step.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Id, Shape } from '../core/format';
import { store } from '../core/store';
import { setLive } from '../canvas/controller';
import { toast } from '../ui/toast';
import { pointCount, turnStrokes } from '../geometry/strokeToPath';
import { editShapes } from './merge-mode';
import { activeLayer, EDIT_HINTS } from './edit';
import { pickTool } from './pick';
import { selectionTarget, type Target } from './select-land';
import './strokeLine.css';

/** The Smoothness left as it was last time, so a second line is turned the same way. */
let lastSmoothness = 0.6;

/** The brush lines among the selected shapes, with the drawing they are on; null when there are none. */
export function selectedBrushLines(): { target: Target; ids: Set<Id>; layerId: Id } | null {
  const t = selectionTarget();
  const { layer } = activeLayer();
  if (!t || !layer) return null;
  const ids = new Set(t.originals.filter((s) => s.type === 'stroke').map((s) => s.id));
  return ids.size ? { target: t, ids, layerId: layer.id } : null;
}

function Bar({ target, ids, layerId, close }: { target: Target; ids: Set<Id>; layerId: Id; close: () => void }) {
  const [smooth, setSmooth] = useState(lastSmoothness);
  const made = useMemo(() => turnStrokes(target.drawing.shapes, ids, smooth), [target, ids, smooth]);
  const before = useMemo(() => [...ids].reduce((n, id) => n + pointCount(target.drawing.shapes.find((s) => s.id === id) as Shape), 0), [target, ids]);
  const after = useMemo(() => made.shapes.filter((s) => ids.has(s.id)).reduce((n, s) => n + pointCount(s), 0), [made, ids]);
  const slider = useRef<HTMLInputElement>(null);

  // The stage shows the result while the card is open.
  useEffect(() => {
    setLive({ layerId, kind: 'vector', drawing: { ...target.drawing, shapes: made.shapes } });
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
    lastSmoothness = smooth;
    const picked = ids;
    close();
    const r = editShapes('Turn into an editable line', (shapes) => {
      const out = turnStrokes(shapes, picked, smooth);
      return out.changed ? out.shapes : null;
    });
    if (r === 'ok') {
      pickTool('points');
      toast(`Now ${picked.size === 1 ? 'a line' : `${picked.size} lines`} with ${after} points. Drag them to reshape.`, { action: { label: 'Undo', run: () => store().undo() } });
    } else if (r !== 'nothing') toast(EDIT_HINTS[r]);
  };

  return (
    <div
      className="sl-bar"
      role="dialog"
      aria-label="Turn into an editable line"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) apply();
      }}
    >
      <div className="sl-title">Turn into an editable line</div>
      <p className="sl-note">
        Swaps {ids.size === 1 ? 'this brush line' : `these ${ids.size} brush lines`} for {ids.size === 1 ? 'a shape' : 'shapes'} with a few smooth points you can drag with Edit points. It keeps its width and tapered ends.
      </p>
      <label className="sl-row">
        <span>Smoothness</span>
        <input ref={slider} type="range" min={0} max={100} value={Math.round(smooth * 100)} aria-label="Smoothness" onChange={(e) => setSmooth(Number(e.target.value) / 100)} />
      </label>
      <div className="sl-ends">
        <span>Closest to what I drew</span>
        <span>Smoothest</span>
      </div>
      <p className="sl-count" aria-live="polite">
        {before} points become {after}.
      </p>
      <p className="sl-note">It can't go back to a pressure-sensitive brush line, but Undo can.</p>
      <div className="sl-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" onClick={apply}>
          Turn into a line
        </button>
      </div>
    </div>
  );
}

let open: (() => void) | null = null;

/** Opens the card for the selected brush lines. Says what to do when none is selected. */
export function openStrokeLineBar(): boolean {
  const picked = selectedBrushLines();
  if (!picked) {
    toast('Select a brush line first. Only lines made with the Brush have this: pen shapes, rectangles and clean lines already have points to edit.');
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
  root.render(<Bar target={picked.target} ids={picked.ids} layerId={picked.layerId} close={close} />);
  return true;
}
