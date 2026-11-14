// The bar across the top of the canvas while a symbol is open: where you are, and the way back out. Also the
// canvas's double-click (open a symbol, or go back out) and dropping symbols from the Library.
import type { DragEvent, MouseEvent } from 'react';
import { useStore, store } from '../core/store';
import { topShapeAt } from '../canvas/geometry';
import { getTurn, windowToBox } from '../canvas/turn';
import { screenToDoc } from '../canvas/view';
import { SYMBOL_DRAG_TYPE } from './dragType';
import { currentKey, editInstance, editPath, leaveSymbol, placeInstance } from './ops';
import './symbols.css';

export function EditBar() {
  const doc = useStore((s) => s.doc);
  if (!doc.editing?.length) return null;
  const path = editPath(doc);
  return (
    <nav className="sy-editbar" aria-label="Where you are">
      {path.map((p, i) => {
        const last = i === path.length - 1;
        return (
          <span key={i} className="sy-crumb-wrap">
            {i > 0 && <span className="sy-crumb-sep" aria-hidden="true">›</span>}
            <button type="button" className="sy-crumb" aria-current={last} disabled={last} onClick={() => leaveSymbol(path.length - 1 - i)} title={last ? undefined : `Back to ${p.name}`}>
              {p.name}
            </button>
          </span>
        );
      })}
      <button type="button" className="sy-done" onClick={() => leaveSymbol()} title="Back out of the symbol (Shift+F9)">
        Done
      </button>
    </nav>
  );
}

function docPoint(e: { clientX: number; clientY: number; currentTarget: Element }): { x: number; y: number } {
  const r = e.currentTarget.getBoundingClientRect();
  const { zoom, panX, panY } = store().get().ui;
  const q = windowToBox(getTurn(), r.width, r.height, e.clientX - r.left, e.clientY - r.top);
  return screenToDoc({ zoom, panX, panY }, q.x, q.y);
}

/** Double-click with the Select tool: open the symbol under the pointer, or go back out from an empty spot. */
export function onCanvasDoubleClick(e: MouseEvent<HTMLElement>): void {
  const { ui, doc } = store().get();
  if (ui.tool !== 'select') return;
  const p = docPoint(e);
  const k = currentKey();
  const hit = k ? topShapeAt(k.drawing.shapes, p.x, p.y, 4 / ui.zoom) : undefined;
  if (hit?.type === 'instance') editInstance(hit.id);
  else if (!hit && doc.editing?.length) leaveSymbol();
}

export function onCanvasDragOver(e: DragEvent<HTMLElement>): void {
  if (!e.dataTransfer.types.includes(SYMBOL_DRAG_TYPE)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  e.currentTarget.classList.add('is-dropping');
}

export function onCanvasDragLeave(e: DragEvent<HTMLElement>): void {
  e.currentTarget.classList.remove('is-dropping');
}

export function onCanvasDrop(e: DragEvent<HTMLElement>): void {
  e.currentTarget.classList.remove('is-dropping');
  const id = e.dataTransfer.getData(SYMBOL_DRAG_TYPE);
  if (!id) return;
  e.preventDefault();
  placeInstance(id, docPoint(e));
}
