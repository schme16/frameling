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
    reset() {
      bag.latency = [];
      bag.overlayMs = [];
      bag.mainMs = [];
      bag.painted = [];
      bag.pending = [];
    },
  };
  // Loaded on the side so the templates stay out of the startup bundle.
  void import('../templates').then((m) => (bag.templates = m.TEMPLATES));
  (window as unknown as { __framelingPerf: PerfBag }).__framelingPerf = bag;
  return bag;
}

/** The collector, or null when measuring is off. */
export const perf: PerfBag | null = PERF_ON ? make() : null;
