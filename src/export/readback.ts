// The one place that decides how export canvases are made.
//
// `willReadFrequently: true` asks the browser for a canvas that is cheap to read back, and we used to set it on every
// export canvas, which sounds right: an export draws a frame and then reads every pixel out of it. Measured, it is
// the wrong trade, and badly so on anything with layers or effects. The flag puts the export canvas on the processor,
// while the scratch canvases that layers and effects are drawn into stay on the card, so every `drawImage` into the
// export canvas becomes a copy from the card to the processor. Those copies cost far more than the read-back saves.
//
// On a quiet machine with the card, the kitchen sink at 96 frames, two runs each way:
//
//   | | with the flag | without |
//   |---|---|---|
//   | reading a frame back | 12.7 and 13.1 ms | 3.5 and 2.8 ms |
//   | drawing plus reading | 13.7 and 14.1 ms | 4.4 and 3.7 ms |
//   | the whole export | 4081 and 4178 ms | 2426 and 2499 ms |
//
// A plain stroke document with no effects is a wash either way, which fits: with nothing to composite there are no
// card-to-processor copies to pay for.
//
// So the flag is off by default now. Where there is no card at all the canvas is on the processor regardless and the
// flag means nothing, so this cannot make a machine without one worse. `FRAMELING_EXPORT_READBACK=1` puts it back,
// for measuring it again or for a machine where the trade really does go the other way.

const flagged = (): boolean => {
  const tuning = typeof window !== 'undefined' ? (window as { frameling?: { tuning?: { exportReadback?: boolean } } }).frameling?.tuning : undefined;
  return tuning?.exportReadback === true;
};

/** Read once, the first time an export canvas is made. */
export const READBACK_FLAG: boolean = flagged();

/** The options for `getContext('2d', ...)` on a canvas an export draws on and then reads back. */
export const exportContextOptions: CanvasRenderingContext2DSettings = { willReadFrequently: READBACK_FLAG };
