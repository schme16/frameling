// The two ends of the link between the drawing window and the second window, joined directly: what the drawing window
// does to its store has to leave the second window's copy equal to it, whichever way the change was made.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, PathShape, StrokeShape } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { Mirror } from '../../src/popout/mirror';
import { Replica } from '../../src/popout/replica';
import type { Look, ToPopout } from '../../src/popout/protocol';

const THEME = { dark: true, bg: '#000', text: '#fff', muted: '#888', accent: '#a0f', raised: '#222' };
const square = (id: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }], fill: '#f00', stroke: null, opacity: 1 });
const stroke = (id: string): StrokeShape => ({ id, type: 'stroke', points: [{ x: 1, y: 1, p: 0.5 }, { x: 9, y: 9, p: 0.5 }], brush: { size: 4, thinning: 0.5, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true } as never, color: '#000', opacity: 1 });

let sent: ToPopout[];
let mirror: Mirror;
let replica: Replica;
let theme = THEME;
const lookOf = (s: ReturnType<ReturnType<typeof store>['get']>): Look => ({ name: 'T', frame: s.ui.frame, playing: s.ui.playing, activeLayerId: s.ui.activeLayerId, camera: false, marks: false, theme });

/** Joins the two ends the way the message port does, in order. */
function connect() {
  sent = [];
  replica = new Replica();
  mirror = new Mirror({ get: () => store().get(), lastChange: () => store().lastChange() }, (m) => {
    sent.push(m);
    if (replica.apply(structuredClone(m))) mirror.hello();
  }, lookOf);
  store().subscribe(() => mirror.sync());
  mirror.hello();
}
const equal = (a: Doc | null, b: Doc) => JSON.stringify(a) === JSON.stringify(b);

beforeEach(() => {
  theme = THEME;
  const doc = newDoc({ width: 100, height: 100, length: 8 });
  const d = { ...newVectorDrawing(), shapes: [square('a')] };
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 8, drawingId: d.id });
  resetStore(doc);
  connect();
});

describe('keeping the second window\'s copy equal', () => {
  it('starts with the whole drawing and the look', () => {
    expect(sent[0].t).toBe('doc');
    expect(replica.look?.frame).toBe(0);
    expect(equal(replica.doc, store().get().doc)).toBe(true);
    expect(replica.empty).toBe(false);
  });

  it('sends an edit as patches, not the whole drawing again', () => {
    const before = sent.length;
    const id = Object.keys(store().get().doc.drawings)[0];
    store().update('Add shape', (d) => void (d.drawings[id] as { shapes: unknown[] }).shapes.push(square('b')));
    const fresh = sent.slice(before);
    expect(fresh.some((m) => m.t === 'patch')).toBe(true);
    expect(fresh.some((m) => m.t === 'doc')).toBe(false);
    expect(mirror.sentPatches).toBe(1);
    expect(equal(replica.doc, store().get().doc)).toBe(true);
  });

  it('follows undo and redo', () => {
    const id = Object.keys(store().get().doc.drawings)[0];
    store().update('Add shape', (d) => void (d.drawings[id] as { shapes: unknown[] }).shapes.push(square('b')));
    store().undo();
    expect(equal(replica.doc, store().get().doc)).toBe(true);
    expect((replica.doc!.drawings[id] as { shapes: unknown[] }).shapes).toHaveLength(1);
    store().redo();
    expect(equal(replica.doc, store().get().doc)).toBe(true);
    expect((replica.doc!.drawings[id] as { shapes: unknown[] }).shapes).toHaveLength(2);
    expect(mirror.sentDocs).toBe(1);
  });

  it('sends the whole drawing for a new or opened one, and for a jump back through history', () => {
    store().load(newDoc({ name: 'Other', width: 50, height: 50 }));
    expect(mirror.sentDocs).toBe(2);
    expect(replica.doc!.name).toBe('Other');
    const id = Object.keys(store().get().doc.drawings)[0] ?? null;
    store().update('x', (d) => void (d.name = 'Changed'));
    store().update('y', (d) => void (d.name = 'Changed again'));
    const first = store().historyList().done[0]?.id ?? null;
    store().jumpToStep(first);
    expect(equal(replica.doc, store().get().doc)).toBe(true);
    void id;
  });

  it('keeps pixel and settled edits equal too (many edits in a row)', () => {
    const id = Object.keys(store().get().doc.drawings)[0];
    for (let i = 0; i < 20; i++) store().update('Add shape', (d) => void (d.drawings[id] as { shapes: unknown[] }).shapes.push(square('s' + i)), { coalesce: 'many' });
    expect(equal(replica.doc, store().get().doc)).toBe(true);
    store().undo();
    expect(equal(replica.doc, store().get().doc)).toBe(true);
  });

  it('tells the playhead and playing as a small look, without touching the drawing', () => {
    const docs = mirror.sentDocs;
    const patches = mirror.sentPatches;
    store().setUi({ frame: 3 });
    expect(replica.look?.frame).toBe(3);
    store().setUi({ playing: true });
    expect(replica.look?.playing).toBe(true);
    expect(mirror.sentDocs).toBe(docs);
    expect(mirror.sentPatches).toBe(patches);
  });

  it('sends nothing when nothing it cares about changed', () => {
    const n = sent.length;
    store().setUi({ zoom: 3, panX: 20, tool: 'pen' });
    store().setUi({ color: '#123456' });
    expect(sent.length).toBe(n);
  });

  it('sends a new look when the theme changes', () => {
    theme = { ...THEME, dark: false, bg: '#fff' };
    store().setUi({});
    expect(replica.look?.theme.dark).toBe(false);
  });

  it('asks again, and gets everything, when a message is missed', () => {
    const out: ToPopout[] = [];
    const r = new Replica();
    const m = new Mirror({ get: () => store().get(), lastChange: () => store().lastChange() }, (x) => out.push(x), lookOf);
    m.hello();
    for (const x of out.splice(0)) r.apply(structuredClone(x));
    const id = Object.keys(store().get().doc.drawings)[0];
    store().update('one', (d) => void (d.drawings[id] as { shapes: unknown[] }).shapes.push(square('p1')));
    m.sync();
    out.splice(0); // lost
    store().update('two', (d) => void (d.drawings[id] as { shapes: unknown[] }).shapes.push(square('p2')));
    m.sync();
    const lost = out.splice(0).map((x) => r.apply(structuredClone(x)));
    expect(lost).toContain(true);
    m.hello();
    for (const x of out.splice(0)) r.apply(structuredClone(x));
    expect(equal(r.doc, store().get().doc)).toBe(true);
  });

  it('refuses a patch it cannot apply, and says so', () => {
    const r = new Replica();
    expect(r.apply({ t: 'patch', seq: 5, patches: [] })).toBe(true);
    r.apply({ t: 'doc', seq: 1, doc: store().get().doc });
    expect(r.apply({ t: 'patch', seq: 3, patches: [] })).toBe(true);
    expect(r.apply({ t: 'patch', seq: 2, patches: [{ op: 'replace', path: ['nope', 'nope'], value: 1 }] })).toBe(true);
    expect(r.doc).toBeNull();
  });

  it('follows a stroke in progress and a half-done change, and clears them', () => {
    mirror.setInk(stroke('i'));
    expect(replica.ink?.id).toBe('i');
    mirror.setInk(null);
    expect(replica.ink).toBeNull();
    const id = Object.keys(store().get().doc.drawings)[0];
    mirror.setLive({ layerId: store().get().doc.layers[0].id, drawing: store().get().doc.drawings[id] });
    expect(replica.live?.drawing.id).toBe(id);
    mirror.setLive(null);
    expect(replica.live).toBeNull();
  });

  it('a new whole drawing drops a stroke that belonged to the old one', () => {
    mirror.setInk(stroke('i'));
    store().load(newDoc({ name: 'Other' }));
    expect(replica.ink).toBeNull();
  });

  it('does not touch the drawing it was given', () => {
    const doc = store().get().doc;
    const frozen = JSON.stringify(doc);
    const id = Object.keys(doc.drawings)[0];
    store().update('Add shape', (d) => void (d.drawings[id] as { shapes: unknown[] }).shapes.push(square('b')));
    expect(JSON.stringify(doc)).toBe(frozen);
  });
});

describe('store.lastChange', () => {
  it('is the patches of the last edit, from the drawing before to the one now', () => {
    const before = store().get().doc;
    store().update('Rename', (d) => void (d.name = 'Renamed'));
    const c = store().lastChange()!;
    expect(c.from).toBe(before);
    expect(c.to).toBe(store().get().doc);
    expect(c.patches.length).toBeGreaterThan(0);
  });
  it('is not the drawing now after a load, so a mirror sends the whole drawing', () => {
    store().update('Rename', (d) => void (d.name = 'Renamed'));
    store().load(newDoc());
    const c = store().lastChange()!;
    expect(c.to).not.toBe(store().get().doc);
  });
});
