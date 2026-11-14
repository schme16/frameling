// Is the canvas really drawn? Judges what the WINDOW shows (a picture of the composited window, not a read back of the
// canvas element: a canvas can read back perfectly while nothing reaches the screen, which is exactly how a flag once
// blanked the user's drawing and a passing check missed it). Pure, so a test can hand it any picture.
//
// A picture here is a coarse grid of the canvas area: `cells` is an array of [r, g, b] averages, row by row. Averages, so
// anti-aliasing and the odd pixel of difference between two drivers do not matter; an empty canvas or a missing layer does.

/** Spread of the picture: the largest difference between any two cells, on the biggest channel. 0 for one flat colour. */
function spread(cells) {
  let lo = [255, 255, 255];
  let hi = [0, 0, 0];
  for (const c of cells) for (let k = 0; k < 3; k++) { if (c[k] < lo[k]) lo[k] = c[k]; if (c[k] > hi[k]) hi[k] = c[k]; }
  return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
}

/** The share of cells that are clearly different (more than `level` on any channel) between two grids of the same size. */
function cellsOff(a, b, level) {
  if (a.length !== b.length) return 1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.max(Math.abs(a[i][0] - b[i][0]), Math.abs(a[i][1] - b[i][1]), Math.abs(a[i][2] - b[i][2])) > level) n++;
  return n / a.length;
}

/**
 * What is wrong with `cells`, as plain sentences; an empty list means it is drawn. `reference` is the same drawing made
 * in software. With no reference the check is only "is something there": the picture must not be one flat colour.
 * `needSpread` is how much a drawing must vary to count as drawn (the sample drawings are far above it). The drawing
 * itself is only judged against the reference: a blank canvas with the page's own colours around it still varies.
 */
function judgeCanvas(cells, reference, opts = {}) {
  const needSpread = opts.needSpread ?? 40;
  const level = opts.level ?? 30;
  const allowed = opts.allowed ?? 0.01;
  const problems = [];
  if (!cells || !cells.length) return ['no picture of the canvas was taken'];
  const s = spread(cells);
  if (s < needSpread) problems.push(`the canvas is empty: the picture of the window is one flat colour (spread ${s.toFixed(0)}, a drawing has more than ${needSpread})`);
  if (reference && reference.length) {
    const rs = spread(reference);
    if (rs < needSpread) problems.push('the software reference is empty too, so there is nothing to compare with');
    else if (!problems.length) {
      // Not an average: a drawing that is missing (the page still there, the ball gone) is a few cells out of many, and an
      // average hides exactly that.
      const off = cellsOff(cells, reference, level);
      if (off > allowed) problems.push(`the canvas does not match the software drawing of the same file (${(off * 100).toFixed(1)}% of it is clearly different, allowed ${(allowed * 100).toFixed(0)}%)`);
    }
  }
  return problems;
}

module.exports = { spread, cellsOff, judgeCanvas };
