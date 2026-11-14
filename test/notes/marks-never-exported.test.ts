// Marks live in the file and nowhere else. Three kinds of proof, as for notes: the code that makes exports and the
// renderer has no way to reach a mark; every way a document is handed out takes the marks off first; and each format
// that can be made without a screen makes the very same bytes with marks as without. The picture formats (PNG, sprite
// sheet, GIF, APNG, WebP, JPEG, video) are made from what the renderer draws, and the run that feeds every one of them
// is shown below to be handed a document with no marks.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CanvasMark, Doc } from '../../src/core/format';
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

// The pictures are drawn by the app's canvas, which a test has no screen for: this records the document each frame is
// drawn from instead of drawing it.
const drawn: Doc[] = [];
vi.mock('../../src/export/draw', async (orig) => ({
  ...(await orig<typeof import('../../src/export/draw')>()),
  makeCanvas: () => ({}) as never,
  drawFrame: (canvas: unknown, doc: Doc) => {
    drawn.push(doc);
    return canvas as never;
  },
  readPixels: () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }) as never,
}));

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

const SECRET = 'ZZ-SECRET-MARK-ZZ';
const marks: CanvasMark[] = [
  { id: 'm1', kind: 'arrow', pts: [5, 5, 30, 12], color: '#3b82f6', pin: 'frame', frame: 1 },
  { id: 'm2', kind: 'text', pts: [9, 9], text: SECRET, w: 5 },
  { id: 'm3', kind: 'scribble', pts: [1, 1, 3, 9, 8, 2, 12, 12], pin: 'layer', layer: 'a' },
];
const withMarks = <T extends Doc>(d: T): T => ({ ...d, marks });
const plainOf = (d: Doc): Doc => {
  const c = { ...d };
  delete c.marks;
  return c;
};

describe('the code that makes exports cannot reach a mark', () => {
  it('nothing under src/export, the renderer or the artboard export reads doc.marks', () => {
    const watched = [...files(join(SRC, 'export')), ...files(join(SRC, 'interactives')), join(SRC, 'core/render.ts'), join(SRC, 'artboards/export.ts'), join(SRC, 'io/preview.ts'), join(SRC, 'plugins/export.ts')];
    const reads = watched.filter((f) => /\b(doc|root|scene|open|st\.doc)\.marks\b/.test(text(f)));
    expect(reads.map(rel)).toEqual([]);
  });
  it('the one renderer, the preview picture and the camera know nothing about them', () => {
    for (const f of ['core/render.ts', 'io/preview.ts', 'camera/canvas.ts', 'export/draw.ts']) {
      expect(text(join(SRC, f)), f).not.toMatch(/notes\/|\.marks\b|CanvasMark/);
    }
  });
  it('the only thing the export code takes from the notes area is withoutNotes', () => {
    const importers = files(SRC)
      .filter((f) => /from '(\.\.?\/)+notes\//.test(text(f)))
      .map((f) => ({ f: rel(f), from: [...text(f).matchAll(/from '(?:\.\.?\/)+(notes\/[\w./-]+)'/g)].map((m) => m[1]) }));
    const exportish = importers.filter((i) => /^(export|interactives|plugins|templates)\//.test(i.f) || i.f === 'core/symbols.ts' || i.f === 'core/render.ts' || i.f.startsWith('camera/'));
    for (const i of exportish) expect(i.from.every((x) => x === 'notes/model'), i.f).toBe(true);
  });
  it('withoutNotes names marks, so it is the one place that takes them out', () => {
    expect(text(join(SRC, 'notes/model.ts'))).toMatch(/delete copy\.marks/);
  });
});

describe('withoutNotes takes marks off everything that leaves the app', () => {
  it('the scene an export is made from has no marks, with or without a symbol open', () => {
    const d = withMarks(kitchenSinkDoc());
    expect(sceneOf(d, 3).doc.marks).toBeUndefined();
    const open = { ...d, editing: [{ symbolId: 'ball', layers: d.layers, length: d.length, frame: 2 }] } as Doc;
    expect(sceneOf(open, 3).doc.marks).toBeUndefined();
  });
  it('gives back the same document when there is nothing to take out, and the same copy twice when there is', () => {
    const d = kitchenSinkDoc();
    expect(withoutNotes(d)).toBe(d);
    const m = withMarks(d);
    expect(withoutNotes(m)).toBe(withoutNotes(m));
    expect(withoutNotes(m).marks).toBeUndefined();
    expect(m.marks).toBe(marks);
  });
  it('takes notes out too, when a document has both', () => {
    const d = { ...withMarks(kitchenSinkDoc()), notes: [{ id: 'n', x: 1, y: 1, text: 'hi' }] };
    const bare = withoutNotes(d);
    expect(bare.notes).toBeUndefined();
    expect(bare.marks).toBeUndefined();
  });
  it('a copy saved without them has none in its file, and one saved with them does', () => {
    const d = withMarks(kitchenSinkDoc());
    const json = (b: Uint8Array) => strFromU8(unzipSync(b)['doc.json']);
    expect(json(saveFile(d, 'test'))).toContain(SECRET);
    expect(json(saveFile(withoutNotes(d), 'test'))).not.toContain(SECRET);
  });
  it('the places that hand a document out all pass it through withoutNotes', () => {
    for (const f of ['export/run.ts', 'export/exporter.ts', 'export/formats/interactives.ts', 'plugins/manager.ts', 'templates/actions.ts', 'core/symbols.ts', 'interactives/roundtrip.ts']) {
      expect(text(join(SRC, f)), f).toMatch(/withoutNotes\(/);
    }
    expect(text(join(SRC, 'export/formats/interactives.ts'))).toMatch(/saveFile\(withoutNotes\(/);
    expect(text(join(SRC, 'export/run.ts'))).toMatch(/withoutNotes\(ctx\.doc\)/);
  });
});

describe('every format is run from a document with no marks', () => {
  // Each real format is swapped for a stand-in that asks for the first frame, so what runExport hands to the renderer
  // is seen for every format, with the real plan for that format's own settings.
  it('PNG, sprite sheet, GIF, APNG, WebP, JPEG, video, Lottie, SVG, PDF, PSD, Godot and the rest', async () => {
    const { registerExporter, allExporters } = await import('../../src/export/registry');
    await import('../../src/export/builtin');
    const { runExport } = await import('../../src/export/run');
    const { defaultSettings } = await import('../../src/export/plan');
    const doc = withMarks(kitchenSinkDoc());
    const ids: string[] = [];
    for (const def of allExporters()) {
      registerExporter({
        ...def,
        direct: undefined,
        prepare: undefined,
        settle: undefined,
        problem: undefined,
        load: async () => ({
          run: async (ctx: { doc: Doc }, env: { frameAt: (i: number) => unknown }) => {
            env.frameAt(0);
            // A format that reads the document itself (SVG, Lottie, Godot) is given the same one.
            expect(ctx.doc.marks, def.info.id).toBeDefined();
            return { kind: 'file', name: 'x', bytes: new Uint8Array() };
          },
        }),
      } as never);
      drawn.length = 0;
      const settings = { ...defaultSettings(doc), format: def.info.id } as never;
      await runExport({ doc, settings, currentFrame: 0, signal: new AbortController().signal, onProgress: () => {} });
      expect(drawn.length, def.info.id).toBeGreaterThan(0);
      for (const d of drawn) expect(d.marks, def.info.id).toBeUndefined();
      ids.push(def.info.id);
    }
    // The ones the brief names are among those that were run.
    for (const id of ['png', 'gif', 'apng', 'webm', 'sheet', 'svg', 'lottie']) expect(ids, id).toContain(id);
  });
});

describe('formats made without a screen come out the same with marks', () => {
  const sink = kitchenSinkDoc();
  // A small drawing with no effects or masks: the SVG writers number their filters and masks from a counter that runs
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
  const both = (make: (d: Doc) => string | Uint8Array, doc: Doc = sink) => {
    expect(s(make(withoutNotes(withMarks(doc))))).toBe(s(make(plainOf(doc))));
    expect(s(make(withMarks(doc)))).toBe(s(make(plainOf(doc))));
    expect(s(make(withMarks(doc)))).not.toContain(SECRET);
  };
  const clean = (make: (d: Doc) => string) => expect(make(withMarks(sink))).not.toContain(SECRET);
  it('SVG, every frame', () => {
    for (let f = 0; f < 2; f++) both((d) => frameToSvg(d, f), small);
    for (let f = 0; f < sink.length; f += 5) clean((d) => frameToSvg(d, f));
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
    const b = make(withMarks(doc));
    expect(b).toBe(a);
    expect(b).not.toContain(SECRET);
  });
});
