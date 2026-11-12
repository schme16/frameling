// The Slices panel: every slice on the active pixel layer, each with its name, rectangle, 9-patch borders and pivot.
import { findLayer } from '../../core/doc';
import type { Slice } from '../../core/format';
import { useStore } from '../../core/store';
import { ActionButton, Tip } from '../../canvas/controls';
import { setPixelSettings, usePixelSettings } from '../settings';
import { borders, keyAt, sliceAt, sliceColor } from './model';
import { deleteSlice, keySliceHere, pickSlice, renameSlice, setNineBorders, setPivot, setSliceRect, stopSliceMoving, toggleNine, togglePivot, unkeySliceHere, usePickedSlice, createSlice, setSliceColor } from './state';
import '../pixel.css';
import './slices.css';

function useLayer() {
  return useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return l?.kind === 'pixel' ? l : null;
  });
}

/** A whole number box that applies as it is typed (each change is one undo step, merged while typing). */
function Num({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="sl-num">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v) && e.target.value !== '') onChange(v);
        }}
      />
    </label>
  );
}

function Row({ slice, frame, open, onOpen }: { slice: Slice; frame: number; open: boolean; onOpen: () => void }) {
  // A slice that changes between frames shows (and edits) the way it is at the current frame.
  const s = sliceAt(slice, frame);
  const keyHere = slice.keys?.some((k) => k.frame === frame) ?? false;
  const b = borders(s);
  const color = sliceColor(s);
  return (
    <li className={`sl-item${open ? ' open' : ''}`}>
      <div className="sl-head">
        <button type="button" className="sl-pick" onClick={onOpen} aria-expanded={open} title="Pick this slice">
          <span className="sl-dot" style={{ background: color }} aria-hidden="true" />
          <b>{s.name}</b>
          <span className="sl-size">
            {s.w} x {s.h}
            {b ? ', 9-patch' : ''}
            {s.pivot ? ', pivot' : ''}
            {slice.keys?.length ? ', moves' : ''}
          </span>
        </button>
        <button type="button" className="sl-del" onClick={() => deleteSlice(s.id)} aria-label={`Delete slice ${s.name}`} title="Delete slice">
          x
        </button>
      </div>
      {open && (
        <div className="sl-body">
          <label className="sl-name">
            <span>Name</span>
            <input type="text" value={s.name} onChange={(e) => renameSlice(s.id, e.target.value)} aria-label="Slice name" />
          </label>
          <div className="sl-grid">
            <Num label="X" value={s.x} onChange={(v) => setSliceRect(s.id, { x: v })} />
            <Num label="Y" value={s.y} onChange={(v) => setSliceRect(s.id, { y: v })} />
            <Num label="Width" value={s.w} min={1} onChange={(v) => setSliceRect(s.id, { w: v })} />
            <Num label="Height" value={s.h} min={1} onChange={(v) => setSliceRect(s.id, { h: v })} />
          </div>
          <label className="sl-check">
            <input type="checkbox" checked={!!b} onChange={(e) => toggleNine(s.id, e.target.checked)} />
            <span>9-patch (stretchy middle)</span>
          </label>
          {b && (
            <div className="sl-grid">
              <Num label="Left" value={b.left} min={0} onChange={(v) => setNineBorders(s.id, { left: v })} />
              <Num label="Top" value={b.top} min={0} onChange={(v) => setNineBorders(s.id, { top: v })} />
              <Num label="Right" value={b.right} min={0} onChange={(v) => setNineBorders(s.id, { right: v })} />
              <Num label="Bottom" value={b.bottom} min={0} onChange={(v) => setNineBorders(s.id, { bottom: v })} />
            </div>
          )}
          <label className="sl-check">
            <input type="checkbox" checked={!!s.pivot} onChange={(e) => togglePivot(s.id, e.target.checked)} />
            <span>Pivot (where it turns and sits)</span>
          </label>
          {s.pivot && (
            <div className="sl-grid">
              <Num label="Pivot X" value={s.pivot.x - s.x} onChange={(v) => setPivot(s.id, { x: s.x + v })} />
              <Num label="Pivot Y" value={s.pivot.y - s.y} onChange={(v) => setPivot(s.id, { y: s.y + v })} />
            </div>
          )}
          {slice.keys?.length ? (
            <div className="sl-keys">
              <Tip>
                Changes between frames: {slice.keys.length} {slice.keys.length === 1 ? 'key' : 'keys'} (frame {slice.keys.map((k) => k.frame + 1).join(', ')}). Move it at another frame to key it there.
              </Tip>
              <div className="px-row px-wrap">
                {!keyHere && keyAt(slice, frame) && (
                  <ActionButton onClick={() => keySliceHere(slice.id)} title="Start a new place for this slice at this frame. It stays where it was before.">
                    Key this frame
                  </ActionButton>
                )}
                {keyHere && (
                  <ActionButton onClick={() => unkeySliceHere(slice.id)} title="Take this frame's key away. The slice goes back to the key before it.">
                    Remove this key
                  </ActionButton>
                )}
                <ActionButton onClick={() => stopSliceMoving(slice.id)} title="Keep the slice in the place it has at this frame, on every frame.">
                  Keep in one place
                </ActionButton>
              </div>
            </div>
          ) : (
            <div className="px-row px-wrap">
              <ActionButton onClick={() => keySliceHere(slice.id)} title="Let this slice move or change between frames: it keeps its place until this frame, then you move it here.">
                Move between frames
              </ActionButton>
            </div>
          )}
          <label className="sl-name">
            <span>Colour on the canvas</span>
            <input type="color" value={color} onChange={(e) => setSliceColor(s.id, e.target.value)} aria-label="Slice colour" />
          </label>
        </div>
      )}
    </li>
  );
}

export function SlicesPanel() {
  const layer = useLayer();
  const frame = useStore((s) => s.ui.frame);
  const picked = usePickedSlice();
  const show = usePixelSettings((s) => s.showSlices);
  if (!layer) return <p className="cv-tip">Slices go on a pixel layer. Pick or add a pixel layer to use them.</p>;
  const slices = layer.slices ?? [];
  return (
    <div className="sl-panel">
      <div className="px-row px-wrap">
        <ActionButton
          onClick={() => {
            createSlice({ x: 0, y: 0, w: 16, h: 16 });
          }}
          title="Add a slice in the top left corner. Or use the Slice tool and drag on the layer."
        >
          + Add slice
        </ActionButton>
        <label className="sl-check">
          <input type="checkbox" checked={show} onChange={(e) => setPixelSettings({ showSlices: e.target.checked })} />
          <span>Show on canvas</span>
        </label>
      </div>
      {slices.length === 0 ? (
        <Tip>No slices on {layer.name} yet. Pick the Slice tool (Shift+S) and drag on the layer to cut one out. Slices carry a name, a 9-patch and a pivot into your game engine.</Tip>
      ) : (
        <ul className="sl-list" aria-label={`Slices on ${layer.name}`}>
          {slices.map((s) => (
            <Row key={s.id} slice={s} frame={frame} open={picked === s.id} onOpen={() => pickSlice(picked === s.id ? null : s.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
