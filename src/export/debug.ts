// With ?debug in the page address, expose the export machinery so scripts/e2e/export.cjs can drive it in the real app.
import { trimmedDrawing } from '../core/pixelBounds';
// exportDocument is the very function the dialog's Export button calls, so this runs the same path a person does.
// Never on in normal use.
import { makeFramesSymbol, newInstance, rootDoc } from '../core/symbols';
import { DEFAULT_BRUSH, newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing, newVectorLayer } from '../core/doc';
import type { ClipDirection, Doc } from '../core/format';
import { store } from '../core/store';
import { setChoice } from '../core/choices';
import { detectCapabilities } from './capabilities';
import { exportDocument } from './exporter';
import { runExport } from './run';
import { allExporters } from './registry';
import { defaultSettings, planExport } from './plan';
import type { ExportSettings } from './types';

/** A small document with the awkward bits: a shape with a hole, curves, strokes, 8 digit colours, a faded layer, pixels. */
function stressDoc(): Doc {
  const doc = newDoc({ name: 'Stress', width: 200, height: 160, fps: 10, length: 3, background: '#fffaf0' });
  const sq = (a: number, b: number) => ({ closed: true, points: [{ x: a, y: a }, { x: b, y: a }, { x: b, y: b }, { x: a, y: b }] });
  const vec = newVectorDrawing();
  vec.shapes.push(
    // Both squares run the same way round, so only the even-odd rule makes the hole.
    { id: 's1', type: 'fill', paths: [sq(20, 140), sq(50, 110)], color: '#ff6f91', opacity: 0.8 },
    {
      id: 's2',
      type: 'path',
      paths: [{ closed: true, points: [{ x: 100, y: 20 }, { x: 180, y: 60, c1: { x: 150, y: 10 }, c2: { x: 180, y: 30 } }, { x: 120, y: 100, c1: { x: 180, y: 90 }, c2: { x: 150, y: 110 } }] }],
      fill: '#5ab8ff80',
      stroke: { color: '#1d1b26', width: 6, join: 'miter', cap: 'butt' },
      opacity: 0.9,
    },
    {
      id: 's3',
      type: 'stroke',
      points: [{ x: 20, y: 150, p: 0.3 }, { x: 70, y: 120, p: 0.6 }, { x: 130, y: 150, p: 0.9 }, { x: 190, y: 130, p: 0.4 }],
      brush: { ...DEFAULT_BRUSH, size: 12, thinning: 0.5, taperStart: 10, taperEnd: 20 },
      color: '#4fd1a5',
      opacity: 0.7,
    },
  );
  const lv = newVectorLayer('Art');
  doc.drawings[vec.id] = vec;
  lv.cels = [{ id: 'c1', start: 0, length: 3, drawingId: vec.id }];
  const lp = newPixelLayer('Pixels', 10);
  lp.opacity = 0.6;
  const px = newPixelDrawing(20, 16);
  for (let i = 0; i < 20; i++) px.pixels.set([155, 123, 255, 255], (8 * 20 + i) * 4);
  px.pixels.set([255, 201, 74, 255], (3 * 20 + 3) * 4);
  // Stored trimmed, the way painting and saving leave pixel drawings, so a save and open gives back the same object.
  doc.drawings[px.id] = trimmedDrawing(px);
  lp.cels = [{ id: 'c2', start: 0, length: 3, drawingId: px.id }];
  doc.layers = [lv, lp];
  return doc;
}

/**
 * A pixel walk of four drawings made into one looping symbol (the whole animation), with a second copy of it turned and
 * faded on another layer: every export has to show each drawing on its own frame, in both copies.
 */
function pixelSymbolWalkDoc(): Doc {
  const doc = newDoc({ name: 'Pixel symbol walk', width: 128, height: 96, fps: 8, length: 8, background: '#fffaf0' });
  const lp = newPixelLayer('Walk', 4);
  const cels: Doc['layers'][number]['cels'] = [];
  [0, 1, 2, 3].forEach((i) => {
    const px = newPixelDrawing(32, 24);
    const x0 = 4 + i * 6;
    for (let y = 8; y < 14; y++) for (let x = x0; x < x0 + 4; x++) px.pixels.set([255 - i * 60, 80 + i * 50, 120, 255], (y * 32 + x) * 4);
    px.pixels.set([30, 30, 60, 255], (9 * 32 + x0 + 1) * 4);
    doc.drawings[px.id] = trimmedDrawing(px);
    cels.push({ id: `walk-${i}`, start: i * 2, length: 2, drawingId: px.id });
  });
  lp.cels = cels;
  doc.layers = [lp];
  const made = makeFramesSymbol(doc, lp.id, { name: 'Walk' });
  if (made) {
    const above = newVectorLayer('Second copy');
    const held = newVectorDrawing();
    const inst = newInstance(made.symbolId, { x: 40, y: 70 });
    inst.transform.rotation = 20;
    inst.transform.scaleX = 0.8;
    inst.transform.scaleY = 0.8;
    inst.opacity = 0.7;
    held.shapes.push(inst);
    doc.drawings[held.id] = held;
    above.cels = [{ id: 'second', start: 0, length: 8, drawingId: held.id }];
    doc.layers.push(above);
  }
  return doc;
}

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingExport: unknown }).__framelingExport = {
    // The templates load on demand, so a normal run never pays for them here.
    templates: async () => (await import('../templates')).TEMPLATES.map((t) => t.id),
    load: async (id: string) => store().load((await import('../templates')).findTemplate(id)!.make(), null),
    loadStress: () => store().load(stressDoc(), null),
    loadPixelSymbolWalk: () => store().load(pixelSymbolWalkDoc(), null),
    // A symbol with bones, a camera, a far layer and an Add glow, for the Godot bones checks.
    loadBonesExtras: async (camera = true, extra: Record<string, unknown> = {}) => store().load((await import('./bonesExtrasDoc')).bonesExtrasDoc({ ...(camera ? { camera: { a: { x: 180, y: 135, zoom: 1, rotation: 0 }, b: { x: 215, y: 150, zoom: 1.4, rotation: 6 } } } : {}), ...extra }), null),
    // Every feature at once (symbols, tweens, effects, folders, masks, tiles, bones, sound): see kitchenSink.ts.
    loadKitchenSink: async () => store().load((await import('./kitchenSink')).kitchenSinkDoc(), null),
    loadKitchenSinkPerf: async (frames?: number) => store().load((await import('./kitchenSink')).kitchenSinkPerfDoc(frames), null),
    doc: () => rootDoc(store().get().doc),
    defaults: () => defaultSettings(rootDoc(store().get().doc)),
    plan: (s: ExportSettings) => planExport(rootDoc(store().get().doc), s, store().get().ui.frame),
    caps: (w: number, h: number) => detectCapabilities(w, h),
    // The formats registered right now. A format whose feature is switched off is not in here, so a harness can
    // skip it instead of asking for it and getting an error.
    formats: () => allExporters().map((d) => d.info.id),
    addClip: (name: string, start: number, end: number, loop = true, direction?: ClipDirection, repeat?: number) =>
      store().update('Add clip', (d) => void d.clips.push({ id: 'clip-' + name, name, start, end, loop, ...(direction ? { direction } : {}), ...(repeat ? { repeat } : {}) })),
    /** Sets (or with undefined, forgets) a remembered choice, like the one in Preferences > Behaviour. */
    setChoice: (id: string, value: string | undefined) => setChoice(id, value),
    clearClips: () => store().update('Clear clips', (d) => void (d.clips = [])),
    rename: (name: string) => store().update('Rename', (d) => void (d.name = name)),
    setFrame: (n: number) => store().setUi({ frame: n }),
    /** Makes the export's bytes without saving them anywhere (the perf soak test). Returns the size and time. */
    encode: async (s: ExportSettings) => {
      const t0 = performance.now();
      const st = store().get();
      const r = await runExport({ doc: rootDoc(st.doc), settings: s, currentFrame: st.ui.frame, signal: new AbortController().signal, onProgress: () => undefined, appVersion: 'perf' });
      const bytes = r.kind === 'file' ? r.bytes.length : -1;
      return { bytes, ms: Math.round(performance.now() - t0) };
    },
    /** The PNG export of one frame, through the real exporter, as base64 (for A/B stills of an export beside the screen). */
    pngBase64: async (frame = 0, scale = 1) => {
      const st = store().get();
      const doc = rootDoc(st.doc);
      const settings = { ...defaultSettings(doc), format: 'png', range: 'frame', clipId: null, scale } as unknown as ExportSettings;
      const r = await runExport({ doc, settings, currentFrame: frame, signal: new AbortController().signal, onProgress: () => undefined, appVersion: 'ab' });
      if (r.kind !== 'file') return null;
      let bin = '';
      for (const b of r.bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    },
    /** One frame through the real exporter in any single-file format (svg, pdf, lottie, png...), as base64, for stills of an export beside the screen. */
    fileBase64: async (format: string, frame = 0, range: 'frame' | 'all' = 'frame') => {
      const st = store().get();
      const doc = rootDoc(st.doc);
      const settings = { ...defaultSettings(doc), format, range, clipId: null, scale: 1 } as unknown as ExportSettings;
      const r = await runExport({ doc, settings, currentFrame: frame, signal: new AbortController().signal, onProgress: () => undefined, appVersion: 'ab' });
      if (r.kind !== 'file') return null;
      let bin = '';
      for (let i = 0; i < r.bytes.length; i += 0x8000) bin += String.fromCharCode(...r.bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    /** Runs an export. `cancelAfterMs` presses Cancel that long after the start. */
    run: async (s: ExportSettings, cancelAfterMs?: number) => {
      const ac = new AbortController();
      if (cancelAfterMs !== undefined) setTimeout(() => ac.abort(), cancelAfterMs);
      const progress: { done: number; total: number; label: string }[] = [];
      const t0 = performance.now();
      try {
        const outcome = await exportDocument(s, ac.signal, (p) => progress.push(p));
        return { outcome, ms: Math.round(performance.now() - t0), progress: progress.length };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? String(e.stack).split('\n').slice(0, 6).join(' / ') : '', ms: Math.round(performance.now() - t0), progress: progress.length };
      }
    },
  };
}
