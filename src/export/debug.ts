// With ?debug in the page address, expose the export machinery so scripts/e2e/export.cjs can drive it in the real app.
// exportDocument is the very function the dialog's Export button calls, so this runs the same path a person does.
// Never on in normal use.
import { rootDoc } from '../core/symbols';
import { DEFAULT_BRUSH, newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing, newVectorLayer } from '../core/doc';
import type { ClipDirection, Doc } from '../core/format';
import { store } from '../core/store';
import { setChoice } from '../core/choices';
import { detectCapabilities } from './capabilities';
import { exportDocument } from './exporter';
import { runExport } from './run';
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
  doc.drawings[px.id] = px;
  lp.cels = [{ id: 'c2', start: 0, length: 3, drawingId: px.id }];
  doc.layers = [lv, lp];
  return doc;
}

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingExport: unknown }).__framelingExport = {
    // The templates load on demand, so a normal run never pays for them here.
    templates: async () => (await import('../templates')).TEMPLATES.map((t) => t.id),
    load: async (id: string) => store().load((await import('../templates')).findTemplate(id)!.make(), null),
    loadStress: () => store().load(stressDoc(), null),
    // A symbol with bones, a camera, a far layer and an Add glow, for the Godot bones checks.
    loadBonesExtras: async (camera = true, extra: Record<string, unknown> = {}) => store().load((await import('./bonesExtrasDoc')).bonesExtrasDoc({ ...(camera ? { camera: { a: { x: 180, y: 135, zoom: 1, rotation: 0 }, b: { x: 215, y: 150, zoom: 1.4, rotation: 6 } } } : {}), ...extra }), null),
    // Every feature at once (symbols, tweens, effects, folders, masks, tiles, bones, sound): see kitchenSink.ts.
    loadKitchenSink: async () => store().load((await import('./kitchenSink')).kitchenSinkDoc(), null),
    loadKitchenSinkPerf: async (frames?: number) => store().load((await import('./kitchenSink')).kitchenSinkPerfDoc(frames), null),
    doc: () => rootDoc(store().get().doc),
    defaults: () => defaultSettings(rootDoc(store().get().doc)),
    plan: (s: ExportSettings) => planExport(rootDoc(store().get().doc), s, store().get().ui.frame),
    caps: (w: number, h: number) => detectCapabilities(w, h),
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
