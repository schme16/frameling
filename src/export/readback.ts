// The one place that decides how export canvases are made. `willReadFrequently: true` asks the browser for a canvas
// that is cheap to read back, and a side effect can be drawing on the processor instead of the card. Whether that
// trade is a good one is measured (scripts/perf, test `export`), so it can be switched: start the app with
// FRAMELING_EXPORT_READBACK=0 and these canvases are made without the flag. Unset, nothing changes.

const flagged = (): boolean => {
  const tuning = typeof window !== 'undefined' ? (window as { frameling?: { tuning?: { exportReadback?: boolean } } }).frameling?.tuning : undefined;
  return tuning?.exportReadback !== false;
};

/** Read once, the first time an export canvas is made. */
export const READBACK_FLAG: boolean = flagged();

/** The options for `getContext('2d', ...)` on a canvas an export draws on and then reads back. */
export const exportContextOptions: CanvasRenderingContext2DSettings = { willReadFrequently: READBACK_FLAG };
