// The Slices panel: every slice on the active pixel layer, each with its name, rectangle, 9-patch borders and pivot.
import { useMemo, type ReactNode } from 'react';
import { goToArtboard } from '../../artboards/ops';
import { findLayer } from '../../core/doc';
import type { Slice } from '../../core/format';
import { useStore } from '../../core/store';
import { ActionButton, Tip } from '../../canvas/controls';
import { setPixelSettings, usePixelSettings } from '../settings';
import { borders, keyAt, sliceAt, sliceColor, sliceOwners, type SliceOwner } from './model';
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

function Row({ slice, frame, open, canKey, onOpen }: { slice: Slice; frame: number; open: boolean; canKey: boolean; onOpen: () => void }) {
  // A slice that changes between frames shows (and edits) the way it is at the current frame.
  const s = sliceAt(slice, canKey ? frame : 0);
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
          {!canKey ? null : slice.keys?.length ? (
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

/** A board and layer heading over their slices. */
function Group({ owner, title, note, children }: { owner: SliceOwner; title: string; note?: string; children: ReactNode }) {
  return (
    <li className="sl-group">
      <div className="sl-group-head">
        <b>{title}</b>
        {note && <span className="sl-group-note">{note}</span>}
        {!owner.open && (
          <button type="button" className="sl-open" onClick={() => goToArtboard(owner.boardId, true)} title={`Open the board ${owner.boardName} to draw on it and key its slices`}>
            Open board
          </button>
        )}
      </div>
      <ul className="sl-list" aria-label={`Slices on ${title}`}>
        {children}
      </ul>
    </li>
  );
}

export function SlicesPanel() {
  const layer = useLayer();
  const frame = useStore((s) => s.ui.frame);
  const doc = useStore((s) => s.doc);
  const activeLayerId = useStore((s) => s.ui.activeLayerId);
  const picked = usePickedSlice();
  const show = usePixelSettings((s) => s.showSlices);
  const owners = useMemo(() => sliceOwners(doc, activeLayerId), [doc, activeLayerId]);
  const boards = new Set(owners.map((o) => o.boardId)).size;
  const elsewhere = owners.some((o) => o.layer.id !== layer?.id);
  const adding = (
    <div className="px-row px-wrap">
      {layer && (
        <ActionButton
          onClick={() => {
            createSlice({ x: 0, y: 0, w: 16, h: 16 });
          }}
          title="Add a slice in the top left corner. Or use the Slice tool and drag on the layer."
        >
          + Add slice
        </ActionButton>
      )}
      <label className="sl-check">
        <input type="checkbox" checked={show} onChange={(e) => setPixelSettings({ showSlices: e.target.checked })} />
        <span>Show on canvas</span>
      </label>
    </div>
  );
  if (!layer && !owners.length) return <p className="cv-tip">Slices go on a pixel layer. Pick or add a pixel layer to use them.</p>;
  const rows = (o: SliceOwner) => o.layer.slices!.map((s) => <Row key={s.id} slice={s} frame={frame} open={picked === s.id} canKey={o.open} onOpen={() => pickSlice(picked === s.id ? null : s.id)} />);
  // One layer with slices, the one you are on: the plain list. Slices on other layers or boards bring headings.
  if (layer && !elsewhere && boards <= 1) {
    const slices = layer.slices ?? [];
    return (
      <div className="sl-panel">
        {adding}
        {slices.length === 0 ? (
          <Tip>No slices on {layer.name} yet. Pick the Slice tool (Shift+S) and drag on the layer to cut one out. Slices carry a name, a 9-patch and a pivot into your game engine.</Tip>
        ) : (
          <ul className="sl-list" aria-label={`Slices on ${layer.name}`}>
            {slices.map((s) => (
              <Row key={s.id} slice={s} frame={frame} open={picked === s.id} canKey onOpen={() => pickSlice(picked === s.id ? null : s.id)} />
            ))}
          </ul>
        )}
      </div>
    );
  }
  const many = new Set(owners.map((o) => o.boardId)).size > 1 || doc.artboards?.length;
  return (
    <div className="sl-panel">
      {adding}
      {layer && !layer.slices?.length && <Tip>No slices on {layer.name} yet. Pick the Slice tool (Shift+S) and drag on the layer to cut one out.</Tip>}
      <ul className="sl-groups" aria-label="Slices on every layer and board">
        {owners.map((o) => (
          <Group key={o.layer.id} owner={o} title={many ? `${o.boardName} / ${o.layer.name}` : o.layer.name} note={o.layer.id === layer?.id && o.open ? 'this layer' : !o.layer.visible ? 'hidden, left out of exports' : undefined}>
            {rows(o)}
          </Group>
        ))}
      </ul>
      {owners.some((o) => !o.open) && <Tip>Slices on other boards show where they sit on their first frame. Open the board to key them at a frame.</Tip>}
    </div>
  );
}
