/**
 * Measurement hooks for scripts/perf/run.cjs. Off unless the page address has ?perf, and then it only collects
 * timings into window.__framelingPerf, so normal use pays one boolean check per event.
 */
export interface PerfBag {
  /** Input event timestamp to the end of the overlay draw that showed it, in ms. */
  latency: number[];
  overlayMs: number[];
  mainMs: number[];
  /** When a main paint finished and which frame it showed. */
  painted: { t: number; frame: number }[];
  /** Events waiting for the next overlay draw. */
  pending: number[];
  painter?: unknown;
  templates?: unknown;
  /**
   * Where the time inside a layer-bitmap build goes, totalled in ms over the run. `ink` is working out which part of
   * the frame the drawing can touch, `paint` is drawing it, `copy` is lifting the painted part onto its own canvas and
   * `trim` is throwing bitmaps out to stay inside the budget.
   *
   * One honest limit: `paint` covers both building the paths and telling the card to fill them, and a canvas fill's
   * real cost on the card does not show up in JavaScript timing at all, so a small `paint` does not prove the drawing
   * was cheap. It does prove the processor-side work was.
   */
  build: { ink: number; paint: number; copy: number; trim: number; n: number; appends: number };
  reset(): void;
}

export const PERF_ON = typeof location !== 'undefined' && /[?&]perf\b/.test(location.search);

function make(): PerfBag {
  const bag: PerfBag = {
    latency: [],
    overlayMs: [],
    mainMs: [],
    painted: [],
    pending: [],
    build: { ink: 0, paint: 0, copy: 0, trim: 0, n: 0, appends: 0 },
    reset() {
      bag.latency = [];
      bag.overlayMs = [];
      bag.mainMs = [];
      bag.painted = [];
      bag.pending = [];
      bag.build = { ink: 0, paint: 0, copy: 0, trim: 0, n: 0, appends: 0 };
    },
  };
  // Loaded on the side so the templates stay out of the startup bundle.
  void import('../templates').then((m) => (bag.templates = m.TEMPLATES));
  (window as unknown as { __framelingPerf: PerfBag }).__framelingPerf = bag;
  return bag;
}

/** The collector, or null when measuring is off. */
export const perf: PerfBag | null = PERF_ON ? make() : null;
