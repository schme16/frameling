/**
 * Shape hints on the canvas: the "Shape hints" tool places lettered markers on a morph's first key and drags their
 * twins on its last key, and a decoration shows them whenever the playhead is on either key.
 */
import type { ShapeHint, VectorDrawing } from '../core/format';
import { registerTool, type Tool } from '../core/registry';
import { store } from '../core/store';
import { hintLetter, snapHint } from '../core/shape-tween';
import { cssVar } from '../canvas/theme';
import { registerDecoration } from '../canvas/decorations';
import { addShapeHint, hintTarget, moveShapeHint, removeShapeHint } from './ops';

const RADIUS = 9;

interface Marker {
  hint: ShapeHint;
  index: number;
  x: number;
  y: number;
}

/** The markers on the key at the playhead, where they show (snapped to the outline). */
export function hintMarkers(): { end: 'from' | 'to'; markers: Marker[] } | null {
  const t = hintTarget();
  if (!t) return null;
  const { doc, ui } = store().get();
  // Only on the keys themselves: in between, the drawing is a blend the markers don't sit on.
  if (ui.frame !== (t.end === 'from' ? t.cel.start : t.next.start)) return null;
  const d = doc.drawings[(t.end === 'from' ? t.cel : t.next).drawingId];
  if (d?.kind !== 'vector') return null;
  const hints = t.cel.tween?.hints ?? [];
  return {
    end: t.end,
    markers: hints.map((h, index) => {
      const p = snapHint(d as VectorDrawing, h[t.end]);
      return { hint: h, index, x: p.x, y: p.y };
    }),
  };
}

function markerAt(x: number, y: number, zoom: number): Marker | undefined {
  const m = hintMarkers();
  if (!m) return undefined;
  const r = (RADIUS + 3) / zoom;
  let best: Marker | undefined;
  let bd = r * r;
  for (const k of m.markers) {
    const d = (k.x - x) ** 2 + (k.y - y) ** 2;
    if (d <= bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

let drag: { id: string; end: 'from' | 'to'; key: string } | null = null;

export const shapeHintTool: Tool = {
  id: 'shape-hints',
  label: 'Shape hints',
  icon: 'hint',
  layers: ['vector'],
  order: 96,
  help: 'shape-hints',
  cursor: 'crosshair',
  down(e, ctx) {
    const t = hintTarget();
    if (!t) {
      ctx.hint('Shape hints go on a morph. Put the playhead on its first or last key.');
      return;
    }
    if (store().get().ui.frame !== (t.end === 'from' ? t.cel.start : t.next.start)) {
      // In the middle of the morph: hop to its first key, where hints go.
      store().setUi({ frame: t.cel.start });
      ctx.hint('Hints go on the keys. This is the first key of the morph: click its outline to add one.');
      return;
    }
    const hit = markerAt(e.x, e.y, ctx.zoom);
    if (hit && e.alt) {
      removeShapeHint(hit.hint.id);
      ctx.requestOverlay();
      return;
    }
    if (hit) {
      drag = { id: hit.hint.id, end: t.end, key: `hint-${hit.hint.id}-${Date.now()}` };
      return;
    }
    if (t.end === 'to') {
      ctx.hint('Add hints on the first key of the morph, then drag their twins here.');
      return;
    }
    const before = new Set((t.cel.tween?.hints ?? []).map((h) => h.id));
    const r = addShapeHint({ x: e.x, y: e.y });
    if (r) return;
    const added = (hintTarget()?.cel.tween?.hints ?? []).find((h) => !before.has(h.id));
    // Keep dragging the new one, so a press-and-drag places it exactly.
    if (added) drag = { id: added.id, end: 'from', key: `hint-${added.id}-${Date.now()}` };
    ctx.requestOverlay();
  },
  move(e, ctx) {
    if (!drag) return;
    moveShapeHint(drag.id, drag.end, { x: e.x, y: e.y }, drag.key);
    ctx.requestOverlay();
  },
  up(_e, ctx) {
    drag = null;
    ctx.requestOverlay();
  },
  cancel(ctx) {
    drag = null;
    ctx.requestOverlay();
  },
};

registerTool(shapeHintTool);

registerDecoration((g, ctx) => {
  const { ui } = store().get();
  if (ui.playing) return;
  const m = hintMarkers();
  if (!m || !m.markers.length) return;
  const z = ctx.zoom;
  // Gold on the first key, mint on the last, so you can tell which end you're looking at.
  const fill = m.end === 'from' ? cssVar('--sunny', '#ffc94a') : cssVar('--mint', '#4fd1a5');
  const ink = '#1d1b26';
  g.font = `700 ${11 / z}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const k of m.markers) {
    g.beginPath();
    g.arc(k.x, k.y, RADIUS / z, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 1.5 / z;
    g.strokeStyle = ink;
    g.stroke();
    g.fillStyle = ink;
    g.fillText(hintLetter(k.index), k.x, k.y + 0.5 / z);
  }
});
