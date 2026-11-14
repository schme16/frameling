// Tells the canvas when the screen's pixel scale changes while the window keeps its size: the window dragged to another
// screen at a different scale, or the system's scale setting changed. Neither fires a resize, so without this the
// canvas keeps drawing at the old number of pixels and is shown stretched (soft on a sharper screen, or with seams).

/** The parts of `window` this needs, so a test can pass a stand-in. */
export interface PixelRatioHost {
  readonly devicePixelRatio: number;
  matchMedia?(query: string): { addEventListener(type: 'change', fn: () => void): void; removeEventListener(type: 'change', fn: () => void): void };
}

/** Calls `changed` each time the pixel ratio changes. Returns the stopper. */
export function watchPixelRatio(changed: () => void, host: PixelRatioHost = window): () => void {
  let stopped = false;
  let current: { query: { removeEventListener(type: 'change', fn: () => void): void }; fn: () => void } | null = null;
  // A media query on the current ratio goes false when the ratio moves, so it is set again for the new one each time.
  const arm = () => {
    current?.query.removeEventListener('change', current.fn);
    // No media queries (a test page): nothing to listen to, and the per-frame check in the engine still covers it.
    const query = host.matchMedia?.(`(resolution: ${host.devicePixelRatio}dppx)`);
    if (!query) return;
    const fn = () => {
      if (stopped) return;
      changed();
      arm();
    };
    query.addEventListener('change', fn);
    current = { query, fn };
  };
  arm();
  return () => {
    stopped = true;
    current?.query.removeEventListener('change', current.fn);
    current = null;
  };
}
