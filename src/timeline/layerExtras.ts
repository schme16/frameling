// Show only this layer (solo) and colour labels, from the timeline's layer header.
import type { Doc, Id, LayerLabel } from '../core/format';
import { store } from '../core/store';

// What was showing before a solo, so turning it off puts things back exactly. Session only.
let before: { soloId: Id; visible: Record<Id, boolean> } | null = null;

/** True when this is the only layer showing (cameras don't count: they draw nothing). */
export function isSolo(doc: Doc, layerId: Id): boolean {
  const drawn = doc.layers.filter((l) => l.kind !== 'camera');
  if (drawn.length < 2) return false;
  return drawn.every((l) => (l.id === layerId ? l.visible : !l.visible));
}

/** Shows only this layer, or (when it already is the only one) brings the others back. One undo step. */
export function toggleSolo(layerId: Id): void {
  const doc = store().get().doc;
  if (!doc.layers.some((l) => l.id === layerId)) return;
  if (isSolo(doc, layerId)) {
    const saved = before?.soloId === layerId ? before.visible : null;
    before = null;
    store().update('Show the other layers again', (d) => {
      for (const l of d.layers) l.visible = saved ? (saved[l.id] ?? true) : true;
    });
    return;
  }
  before = { soloId: layerId, visible: Object.fromEntries(doc.layers.map((l) => [l.id, l.visible])) };
  store().update('Show only this layer', (d) => {
    for (const l of d.layers) l.visible = l.id === layerId || l.kind === 'camera' ? (l.id === layerId ? true : l.visible) : false;
  });
}

/** Gives a layer a colour label on the timeline (null takes it off). */
export function setLayerLabel(layerId: Id, label: LayerLabel | null): void {
  const l = store().get().doc.layers.find((x) => x.id === layerId);
  if (!l || (l.label ?? null) === label) return;
  store().update(label ? 'Colour label' : 'Remove colour label', (d) => {
    const x = d.layers.find((y) => y.id === layerId);
    if (!x) return;
    if (label) x.label = label;
    else delete x.label;
  });
}

export const LABEL_WORDS: Record<LayerLabel, string> = { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', teal: 'Teal', blue: 'Blue', purple: 'Purple', pink: 'Pink' };
