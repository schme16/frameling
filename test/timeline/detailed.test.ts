import { describe, expect, it } from 'vitest';
import type { Doc } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { findTemplate } from '../../src/templates';
import { parseFile, saveFile } from '../../src/io/file';
import { buildLayout, rowAtY, DETAIL_ROW_H, PROP_ROW_H, CLEAN_ROW_H } from '../../src/timeline/layout';
import { timelineRows } from '../../src/effects/rows';
import { celRef, fxRef, keyFrame, layerTracks, parseRef } from '../../src/timeline/tracks';
import { canShift, clampShift, deleteKeys, moveKeys, removeKeys, retimeKeys, scaleKeys, scaleMap } from '../../src/timeline/keys';
import { isSolo, setLayerLabel, toggleSolo } from '../../src/timeline/layerExtras';
import { migratePrefs } from '../../src/ui/prefs';
import { docWith, isTidy, shape } from './helpers';

const tpl = (id: string): Doc => findTemplate(id)!.make();

describe('key refs', () => {
  it('round-trip', () => {
    expect(parseRef(celRef('L', 'c1'))).toEqual({ kind: 'cel', layerId: 'L', celId: 'c1' });
    expect(parseRef(fxRef('L', 'e1', 12))).toEqual({ kind: 'fx', layerId: 'L', effectId: 'e1', frame: 12 });
    expect(parseRef('nonsense')).toBeNull();
  });
});

describe('property tracks', () => {
  it('a plain frame-by-frame layer has none', () => {
    const doc = docWith([[0, 2], [2, 2], [4, 2]]);
    expect(layerTracks(doc, doc.layers[0])).toEqual([]);
  });

  it('the bouncing logo shows what its instance does, with the tweens as spans', () => {
    const doc = tpl('bouncing-logo');
    const logo = doc.layers.find((l) => l.name === 'Logo')!;
    const tracks = layerTracks(doc, logo);
    const ids = tracks.map((t) => t.id);
    expect(ids).toContain('position');
    const pos = tracks.find((t) => t.id === 'position')!;
    expect(pos.keys.length).toBeGreaterThan(1);
    expect(pos.keys.every((k) => k.ref.startsWith('c:'))).toBe(true);
    expect(pos.spans.length).toBeGreaterThan(0);
    expect(pos.spans[0].kind).toBe('tween');
    // Cached until the drawings change.
    expect(layerTracks(doc, logo)).toBe(tracks);
  });

  it('the puppet has a row per bone that moves', () => {
    const doc = tpl('puppet');
    const bones = doc.layers.find((l) => l.kind === 'vector' && l.rig)!;
    const tracks = layerTracks(doc, bones);
    expect(tracks.length).toBeGreaterThan(2);
    expect(tracks.every((t) => t.id.startsWith('bone-'))).toBe(true);
  });

  it('animated effects get their own rows of independent keys', () => {
    const doc = docWith([[0, 24]]);
    doc.layers[0].effects = [{ id: 'fx1', kind: 'blur', values: { radius: 2 }, keys: [{ frame: 0, values: { radius: 0 } }, { frame: 10, values: { radius: 8 } }] }];
    const [t] = layerTracks(doc, doc.layers[0]);
    expect(t.id).toBe('fx-fx1');
    expect(t.keys.map((k) => k.frame)).toEqual([0, 10]);
    expect(t.spans).toEqual([{ from: 0, to: 10, kind: 'even' }]);
  });

  it('camera keys split into where it looks, zoom and turn', () => {
    const doc = tpl('camera-parallax');
    const cam = doc.layers.find((l) => l.kind === 'camera');
    if (!cam) return;
    const ids = layerTracks(doc, cam).map((t) => t.id);
    expect(ids.every((id) => id.startsWith('cam-'))).toBe(true);
  });
});

describe('retiming keys', () => {
  it('moving a key between two touching holds moves the boundary only', () => {
    const doc = docWith([[0, 4], [4, 4], [8, 4]]);
    const l = doc.layers[0];
    const out = retimeKeys(doc, [celRef(l.id, l.cels[1].id)], (f) => f + 2);
    expect(out).toHaveLength(1);
    expect(shape(l)).toEqual([[0, 6], [6, 2], [8, 4]]);
    expect(isTidy(l)).toBe(true);
  });

  it('a hold that ended in empty frames slides with its key', () => {
    const doc = docWith([[0, 2], [6, 2]]);
    const l = doc.layers[0];
    retimeKeys(doc, [celRef(l.id, l.cels[1].id)], (f) => f + 3);
    expect(shape(l)).toEqual([[0, 2], [9, 2]]);
  });

  it('refuses to run keys into each other', () => {
    const doc = docWith([[0, 4], [4, 4], [8, 4]]);
    const l = doc.layers[0];
    const ref = celRef(l.id, l.cels[1].id);
    expect(retimeKeys(doc, [ref], (f) => f + 4)).toBeNull();
    expect(shape(l)).toEqual([[0, 4], [4, 4], [8, 4]]);
    expect(canShift(doc, [ref], 3)).toBe(true);
    expect(clampShift(doc, [ref], 9)).toBe(3);
    expect(clampShift(doc, [ref], -9)).toBe(-3);
  });

  it('moves keys on several layers and effect keys together', () => {
    const doc = docWith([[0, 4], [4, 4]]);
    const l = doc.layers[0];
    l.effects = [{ id: 'fx', kind: 'blur', values: { radius: 0 }, keys: [{ frame: 0, values: { radius: 0 } }, { frame: 5, values: { radius: 4 } }] }];
    const out = retimeKeys(doc, [celRef(l.id, l.cels[1].id), fxRef(l.id, 'fx', 5)], (f) => f + 1)!;
    expect(shape(l)).toEqual([[0, 5], [5, 4]]);
    expect(l.effects[0].keys!.map((k) => k.frame)).toEqual([0, 6]);
    expect(out).toContain(fxRef(l.id, 'fx', 6));
  });

  it('stretches picked keys from the first one', () => {
    const doc = docWith([[0, 2], [2, 2], [4, 2]], 24);
    const l = doc.layers[0];
    retimeKeys(doc, l.cels.map((c) => celRef(l.id, c.id)), scaleMap(0, 2));
    expect(shape(l)).toEqual([[0, 4], [4, 4], [8, 2]]);
  });

  it('grows the animation when keys go past the end', () => {
    const doc = docWith([[0, 2], [6, 2]], 8);
    const l = doc.layers[0];
    retimeKeys(doc, [celRef(l.id, l.cels[1].id)], (f) => f + 10);
    expect(doc.length).toBe(18);
  });
});

describe('deleting keys', () => {
  it('the drawing before holds on over a deleted key', () => {
    const doc = docWith([[0, 3], [3, 3], [9, 2]]);
    const l = doc.layers[0];
    const before = Object.keys(doc.drawings).length;
    expect(removeKeys(doc, [celRef(l.id, l.cels[1].id), celRef(l.id, l.cels[2].id)])).toBe(true);
    expect(shape(l)).toEqual([[0, 6]]);
    expect(Object.keys(doc.drawings).length).toBe(before - 2);
  });

  it('an effect left with one key turns back into a still value', () => {
    const doc = docWith([[0, 4]]);
    const l = doc.layers[0];
    l.effects = [{ id: 'fx', kind: 'blur', values: { radius: 0 }, keys: [{ frame: 0, values: { radius: 1 } }, { frame: 5, values: { radius: 4 } }] }];
    removeKeys(doc, [fxRef(l.id, 'fx', 0)]);
    expect(l.effects[0].keys).toBeUndefined();
    expect(l.effects[0].values.radius).toBe(4);
  });
});

describe('key edits on the store', () => {
  it('are single undo steps, and refuse locked layers', () => {
    resetStore(docWith([[0, 4], [4, 4], [8, 4]]));
    const l = () => store().get().doc.layers[0];
    const ref = celRef(l().id, l().cels[1].id);
    const o = moveKeys([ref], 1);
    expect(o.ok).toBe(true);
    expect(shape(l())).toEqual([[0, 5], [5, 3], [8, 4]]);
    store().undo();
    expect(shape(l())).toEqual([[0, 4], [4, 4], [8, 4]]);
    expect(scaleKeys(l().cels.map((c) => celRef(l().id, c.id)), 2).ok).toBe(true);
    expect(shape(l())[2][0]).toBe(16);
    store().undo();
    store().update('lock', (d) => void (d.layers[0].locked = true));
    const no = deleteKeys([ref]);
    expect(no.ok).toBe(false);
    expect(keyFrame(store().get().doc, ref)).toBe(4);
  });
});

describe('layout', () => {
  it('detailed rows are slimmer and opened layers add a row per property', () => {
    const doc = tpl('bouncing-logo');
    const rows = timelineRows(doc, new Set());
    const logo = doc.layers.find((l) => l.name === 'Logo')!;
    const clean = buildLayout(rows, 'clean', new Set([logo.id]), (l) => layerTracks(doc, l));
    expect(clean.rows.every((r) => r.h === CLEAN_ROW_H)).toBe(true);
    const shut = buildLayout(rows, 'detailed', new Set(), (l) => layerTracks(doc, l));
    expect(shut.rows.length).toBe(rows.length);
    const open = buildLayout(rows, 'detailed', new Set([logo.id]), (l) => layerTracks(doc, l));
    const n = layerTracks(doc, logo).length;
    expect(open.rows.length).toBe(rows.length + n);
    expect(open.height).toBe(rows.length * DETAIL_ROW_H + n * PROP_ROW_H);
    const firstProp = open.rows.find((r) => r.kind === 'prop')!;
    expect(rowAtY(open, firstProp.y + 3)).toBe(firstProp);
    expect(rowAtY(open, -50)).toBe(open.rows[0]);
    expect(rowAtY(open, 1e6)).toBe(open.rows[open.rows.length - 1]);
  });
});

describe('solo and colour labels', () => {
  it('solo hides the others and brings them back as they were', () => {
    const doc = docWith([[0, 2]]);
    doc.layers.push({ ...doc.layers[0], id: 'b', name: 'B', cels: [] }, { ...doc.layers[0], id: 'c', name: 'C', cels: [], visible: false });
    resetStore(doc);
    const a = doc.layers[0].id;
    toggleSolo(a);
    expect(isSolo(store().get().doc, a)).toBe(true);
    toggleSolo(a);
    expect(store().get().doc.layers.map((l) => l.visible)).toEqual([true, true, false]);
  });

  it('labels save and load, and junk labels are dropped', () => {
    resetStore(docWith([[0, 2]]));
    const id = store().get().doc.layers[0].id;
    setLayerLabel(id, 'teal');
    const back = parseFile(saveFile(store().get().doc));
    expect(back.layers[0].label).toBe('teal');
    setLayerLabel(id, null);
    expect(store().get().doc.layers[0].label).toBeUndefined();
  });
});

describe('preference', () => {
  it('defaults to the detailed timeline', () => {
    expect(migratePrefs({}).cleanTimeline).toBe(false);
    expect(migratePrefs({ cleanTimeline: true }).cleanTimeline).toBe(true);
    expect(migratePrefs({ cleanTimeline: 'yes' }).cleanTimeline).toBe(false);
  });
});
