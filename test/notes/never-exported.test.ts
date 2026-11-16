// Notes live in the file and nowhere else. Two kinds of proof: the code that makes exports has no way to reach a note,
// and the formats that can be made without a screen make the very same bytes with notes as without.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CanvasNote, Doc } from '../../src/core/format';
import { sceneOf } from '../../src/core/symbols';
import { godotBonesScene, bonesParts } from '../../src/export/godot-bones';
import { buildAnimations } from '../../src/export/sheet';
import { kitchenSinkDoc } from '../../src/export/kitchenSink';
import { lottieJson } from '../../src/export/lottie';
import { writePdf } from '../../src/export/pdf';
import { frameToSvg } from '../../src/export/svg';
import { animatedSvg } from '../../src/export/svg-anim';
import { saveFile } from '../../src/io/file';
import { withoutNotes } from '../../src/notes/model';
import { makePuppet } from '../../src/templates/puppet';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const files = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/');
const text = (f: string) => readFileSync(f, 'utf8');

const SECRET = 'ZZ-SECRET-NOTE-ZZ';
const notes: CanvasNote[] = [
  { id: 'n1', x: 5, y: 5, text: SECRET, by: 'Sam', at: 1_700_000_000_000, pin: 'frame', frame: 1, replies: [{ id: 'r', text: SECRET + ' answer' }] },
  { id: 'n2', x: 9, y: 9, text: SECRET + ' page', done: true },
];
const withNotes = <T extends Doc>(d: T): T => ({ ...d, notes });
const plainOf = (d: Doc): Doc => {
  const c = { ...d };
  delete c.notes;
  return c;
};

describe('the code that makes exports cannot reach a note', () => {
  it('nothing under src/export, the renderer or the artboard export reads doc.notes', () => {
    const watched = [...files(join(SRC, 'export')), ...files(join(SRC, 'interactives')), join(SRC, 'core/render.ts'), join(SRC, 'artboards/export.ts'), join(SRC, 'io/preview.ts'), join(SRC, 'plugins/export.ts')];
    // Plan "notes" in the export code are sentences for the person, not CanvasNotes: only a read through a document counts.
    const reads = watched.filter((f) => /\b(doc|root|scene|open|st\.doc)\.notes\b/.test(text(f)));
    expect(reads.map(rel)).toEqual([]);
  });
  it('the one renderer knows nothing about them', () => {
    expect(text(join(SRC, 'core/render.ts'))).not.toMatch(/notes\//);
  });
  it('the only thing the export code takes from the notes area is withoutNotes', () => {
    const importers = files(SRC)
      .filter((f) => /from '(\.\.?\/)+notes\//.test(text(f)))
      .map((f) => ({ f: rel(f), from: [...text(f).matchAll(/from '(?:\.\.?\/)+(notes\/[\w./-]+)'/g)].map((m) => m[1]) }));
    const exportish = importers.filter((i) => /^(export|interactives|plugins|templates)\//.test(i.f) || i.f === 'core/symbols.ts' || i.f === 'core/render.ts');
    for (const i of exportish) expect(i.from.every((x) => x === 'notes/model'), i.f).toBe(true);
    // And the places that hand a document out all pass it through withoutNotes.
    for (const f of ['export/run.ts', 'export/exporter.ts', 'export/formats/interactives.ts', 'plugins/manager.ts', 'templates/actions.ts', 'core/symbols.ts']) {
      expect(text(join(SRC, f)), f).toMatch(/withoutNotes\(/);
    }
  });
  it('the Interactives package source and every run of an export strip them', () => {
    expect(text(join(SRC, 'export/formats/interactives.ts'))).toMatch(/saveFile\(withoutNotes\(/);
    expect(text(join(SRC, 'export/run.ts'))).toMatch(/withoutNotes\(ctx\.doc\)/);
  });
});

describe('withoutNotes is what every way out takes', () => {
  it('the scene an export is made from has no notes, with or without a symbol open', () => {
    const d = withNotes(kitchenSinkDoc());
    expect(sceneOf(d, 3).doc.notes).toBeUndefined();
    const open = { ...d, editing: [{ symbolId: 'ball', layers: d.layers, length: d.length, frame: 2 }] } as Doc;
    expect(sceneOf(open, 3).doc.notes).toBeUndefined();
    expect(sceneOf(open, 3).frame).toBe(2);
  });
  it('a copy saved without them has none in its file, and one saved with them does', () => {
    const d = withNotes(kitchenSinkDoc());
    const json = (b: Uint8Array) => strFromU8(unzipSync(b)['doc.json']);
    expect(json(saveFile(d, 'test'))).toContain(SECRET);
    expect(json(saveFile(withoutNotes(d), 'test'))).not.toContain(SECRET);
  });
});

describe('formats made without a screen come out the same with notes', () => {
  const sink = kitchenSinkDoc();
  // A small drawing with no effects or masks. The SVG writers number their filters and masks from a counter that runs
  // across calls, so two runs of the big document differ in those ids alone; this one can be compared byte for byte.
  const small = (() => {
    const d = newDoc({ width: 40, height: 20, background: '#ffffff' });
    const l = Object.assign(newVectorLayer('Box'), { id: 'a' });
    d.drawings = { da: { id: 'da', kind: 'vector', shapes: [{ id: 'r', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }], fill: '#ff0000', stroke: null, opacity: 1 }] } };
    l.cels = [{ id: 'c1', start: 0, length: 2, drawingId: 'da' }];
    d.layers = [l];
    d.length = 2;
    return d;
  })();
  const s = (x: string | Uint8Array) => (typeof x === 'string' ? x : Buffer.from(x).toString('latin1'));
  /** The same bytes with and without notes on a document, and no sign of a note even when they are left on. */
  const both = (make: (d: Doc) => string | Uint8Array, doc: Doc = sink) => {
    expect(s(make(withoutNotes(withNotes(doc))))).toBe(s(make(plainOf(doc))));
    expect(s(make(withNotes(doc)))).toBe(s(make(plainOf(doc))));
    expect(s(make(withNotes(doc)))).not.toContain(SECRET);
  };
  /** Everything a big document writes carries no note, though its generated ids differ from run to run. */
  const clean = (make: (d: Doc) => string) => expect(make(withNotes(sink))).not.toContain(SECRET);
  it('SVG, one frame', () => {
    both((d) => frameToSvg(d, 0), small);
    clean((d) => frameToSvg(d, 0));
  });
  it('SVG, every frame', () => {
    for (let f = 0; f < sink.length; f += 5) clean((d) => frameToSvg(d, f));
    for (let f = 0; f < 2; f++) both((d) => frameToSvg(d, f), small);
  });
  it('moving SVG', () => {
    both((d) => animatedSvg(d), small);
    clean((d) => animatedSvg(d));
  });
  it('Lottie', () => both((d) => lottieJson(d)));
  it('PDF', () => both((d) => writePdf(d, { frames: [0, 1], scale: 1, background: '#ffffff', title: 'Test' })));
  it('Godot bones scene', () => {
    const doc = makePuppet();
    const range = { start: 0, end: 23 };
    const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: 23, fps: 12, whole: true });
    const make = (d: Doc) => {
      const parts = bonesParts(d, range);
      const textures = parts.map((p, i) => p.pictures.map(() => ({ path: `res://p${i}.png`, x: 1, y: 2, w: 3, h: 4 })));
      return godotBonesScene({ doc: d, range, parts, textures, scale: 1, animations, rootName: 'Puppet' });
    };
    const a = make(doc);
    const b = make(withNotes(doc));
    expect(b).toBe(a);
    expect(b).not.toContain(SECRET);
  });
});
