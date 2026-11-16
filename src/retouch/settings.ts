// The retouch brushes (clone stamp, blur, sharpen) each keep their own brush: a dab brush from src/dab, so spacing, hardness,
// flow and pen dynamics mean what they mean on the pixel brush. They are kept apart from it because a blur wants a wide
// soft brush while the pencil next to it wants one pixel. Saved in the browser's storage, so they come back as you left them.
import { createStore, readRaw, writeJson, type MiniStore } from '../ui/mini';
import { cleanDab, DEFAULT_DAB, type DabBrush } from '../dab/maths';
import { cleanRoutes, withRoute, type DynRoute } from '../dab/dynamics';

export type RetouchKind = 'clone' | 'blur' | 'sharpen';
export const RETOUCH_KINDS: RetouchKind[] = ['clone', 'blur', 'sharpen'];

/** Where the clone stamp copies from. */
export type CloneSample = 'layer' | 'visible';

export interface Retouch {
  brush: DabBrush;
  /** Blur and sharpen: how strong, 0.05 to 1. (Not used by the clone stamp.) */
  amount: number;
  /** Clone stamp: copy from this layer only, or from everything you can see. */
  sample: CloneSample;
}

export const AMOUNT_RANGE = { min: 0.05, max: 1 };

const soft = (size: number, dynamics: DynRoute[]): DabBrush => ({ ...DEFAULT_DAB, size, hardness: 0.5, spacing: 0.15, aliased: false, dynamics });

/** How each one starts: soft, smooth, and closely spaced, because a retouch is built up from overlapping dabs. Pen pressure sets the strength of blur and sharpen. */
export const RETOUCH_DEFAULTS: Record<RetouchKind, Retouch> = {
  clone: { brush: soft(18, []), amount: 1, sample: 'layer' },
  blur: { brush: soft(20, withRoute([], 'flow', { from: 'pressure', amount: 0.8 })), amount: 0.5, sample: 'layer' },
  sharpen: { brush: soft(14, withRoute([], 'flow', { from: 'pressure', amount: 0.8 })), amount: 0.5, sample: 'layer' },
};

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** A retouch read from saved data. Anything missing or odd takes this kind's start. */
export function cleanRetouch(kind: RetouchKind, raw: unknown): Retouch {
  const base = RETOUCH_DEFAULTS[kind];
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  // A retouch brush has no colour and no texture, so the parts of a dab brush that are about those are held off.
  const brush = cleanDab(r.brush, base.brush);
  return {
    brush: { ...brush, tip: brush.tip === 'picture' ? 'round' : brush.tip, wet: 0, grain: null, dual: null, dynamics: cleanRoutes(brush.dynamics).filter((d) => d.to === 'size' || d.to === 'flow' || d.to === 'angle' || d.to === 'scatter') },
    amount: Math.round(num(r.amount, AMOUNT_RANGE.min, AMOUNT_RANGE.max, base.amount) * 100) / 100,
    sample: r.sample === 'visible' ? 'visible' : 'layer',
  };
}

export interface RetouchStore {
  readonly kind: RetouchKind;
  store: MiniStore<Retouch>;
  get(): Retouch;
  /** Changes some of the settings (the brush is patched, not swapped). */
  set(patch: Partial<Omit<Retouch, 'brush'>> & { brush?: Partial<DabBrush> }): void;
  reset(): void;
  use<S>(selector: (r: Retouch) => S): S;
  subscribe(fn: () => void): () => void;
}

const stores = new Map<RetouchKind, RetouchStore>();

/** The settings of one retouch brush (made on first use, and kept). */
export function retouchStore(kind: RetouchKind): RetouchStore {
  const have = stores.get(kind);
  if (have) return have;
  const key = `frameling.retouch.${kind}.v1`;
  const s = createStore<Retouch>(cleanRetouch(kind, readRaw<unknown>(key, null)));
  const made: RetouchStore = {
    kind,
    store: s,
    get: () => s.get(),
    set(patch) {
      s.set((old) => {
        const next = cleanRetouch(kind, { ...old, ...patch, brush: { ...old.brush, ...patch.brush } });
        writeJson(key, next);
        return next;
      });
    },
    reset() {
      s.set(RETOUCH_DEFAULTS[kind]);
      writeJson(key, RETOUCH_DEFAULTS[kind]);
    },
    use: (sel) => s.use(sel),
    subscribe: (fn) => s.subscribe(fn),
  };
  stores.set(kind, made);
  return made;
}
