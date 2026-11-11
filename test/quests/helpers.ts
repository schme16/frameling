import type { Doc, Id, Layer, Shape, StrokePoint } from '../../src/core/format';
import { DEFAULT_BRUSH, newDoc, newPixelDrawing, newVectorDrawing, pixelGrid, uid } from '../../src/core/doc';
import { resetStore, type Store } from '../../src/core/store';
import { runCommandById } from '../../src/quests/actions';
import { QuestEngine, type EngineDeps } from '../../src/quests/engine';
import { createStore } from '../../src/ui/mini';
import { FRESH_PROGRESS, NO_PROBE, type Probe, type Quest, type QuestProgress, type StepCtx } from '../../src/quests/types';
import type { State } from '../../src/core/store';

export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

/** A stroke around a circle (ends meeting) or a squiggle. */
export function stroke(points: [number, number][]): Shape {
  const pts: StrokePoint[] = points.map(([x, y]) => ({ x, y, p: 0.5 }));
  return { id: uid('s'), type: 'stroke', points: pts, brush: { ...DEFAULT_BRUSH }, color: '#000000', opacity: 1 };
}

export function ring(cx = 200, cy = 150, r = 60, closed = true): [number, number][] {
  const n = 24;
  const out: [number, number][] = [];
  const upto = closed ? n : Math.floor(n * 0.6);
  for (let i = 0; i <= upto; i++) out.push([cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);
  return out;
}

/** Puts a drawing with these shapes on a layer at a frame. */
export function putShapes(doc: Doc, layer: Layer, start: number, shapes: Shape[], length = 1): Id {
  const d = newVectorDrawing();
  d.shapes = shapes;
  doc.drawings[d.id] = d;
  layer.cels.push({ id: uid('c'), start, length, drawingId: d.id });
  layer.cels.sort((a, b) => a.start - b.start);
  return d.id;
}

/** Puts a pixel drawing with these painted pixels (grid x, y) on a pixel layer. */
export function putPixels(doc: Doc, layer: Layer, start: number, painted: [number, number][]): Id {
  if (layer.kind !== 'pixel') throw new Error('pixel layer needed');
  const g = pixelGrid(doc, layer);
  const d = newPixelDrawing(g.width, g.height);
  for (const [x, y] of painted) {
    const i = (y * g.width + x) * 4;
    d.pixels[i] = 20;
    d.pixels[i + 3] = 255;
  }
  doc.drawings[d.id] = d;
  layer.cels.push({ id: uid('c'), start, length: 1, drawingId: d.id });
  layer.cels.sort((a, b) => a.start - b.start);
  return d.id;
}

export const vectorDoc = (over: Parameters<typeof newDoc>[0] = {}): Doc => newDoc({ width: 400, height: 300, ...over });
export const pixelDoc = (): Doc => newDoc({ width: 128, height: 128, pixel: { pixelSize: 8 } });

export interface Rig {
  engine: QuestEngine;
  store: Store;
  progress: ReturnType<typeof createStore<QuestProgress>>;
  storage: ReturnType<typeof memoryStorage>;
  clock: { t: number; advance(ms: number): void };
  probe: { value: Probe };
  ran: string[];
}

/** An engine wired to a fresh store, an in-memory storage, a clock you wind by hand and a probe you set by hand. */
export function rig(quests: Quest[], doc: Doc = vectorDoc(), storage = memoryStorage(), opts: { run?: boolean; probe?: () => Probe } = {}): Rig {
  const store = resetStore(doc);
  const progress = createStore<QuestProgress>({ ...FRESH_PROGRESS });
  const clock = { t: 1000, advance(ms: number) { clock.t += ms; } };
  const probe = { value: { ...NO_PROBE } };
  const ran: string[] = [];
  const deps: EngineDeps = {
    source: store,
    progress,
    getQuest: (id) => quests.find((q) => q.id === id),
    runCommand: (id) => (opts.run ? runCommandById(id) : void ran.push(id)),
    probe: opts.probe ?? (() => probe.value),
    storage,
    now: () => clock.t,
  };
  return { engine: new QuestEngine(deps), store, progress, storage, clock, probe, ran };
}

/** A step context for a hand-built state, with sensible empties. */
export function ctxFor(state: State, over: Partial<StepCtx> = {}): StepCtx {
  return { state, prev: state, entry: { state, probe: { ...NO_PROBE } }, probe: { ...NO_PROBE }, ran: new Set(), edits: [], frames: new Set([state.ui.frame]), elapsed: 0, ...over };
}
