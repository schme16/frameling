// The plain maths behind scripts/panels-sheet.cjs: which document each panel is shown in, how crops are packed into a
// contact sheet, and what a crop that came out blank or broken is called. No Electron in here, so test/ui/panels-sheet.test.ts runs it.

/** The document a panel is shown in when the usual Bouncing ball would leave it empty. Same table as the a11y check. */
const DOCS = {
  default: 'bouncing-ball',
  text: 'title-card',
  effects: 'bouncing-logo',
  rig: 'puppet',
  'lip-sync': 'lip-sync',
  lipsync: 'lip-sync',
  slices: 'hero-sprites',
  particles: 'sparkle-fx',
  tileset: 'tileset',
  palette: 'blank-pixel',
  'symbol-props': 'bouncing-logo',
  camera: 'camera-parallax',
  'clip-flow': 'hero-sprites',
  library: 'bouncing-logo',
};

/** Small states a panel needs on top of its document, as the `__frameling.seed` hooks (src/renderer/debug.ts) that make them. */
const SEEDS = { text: 'text', notes: 'notes', slices: 'slices', history: 'history' };

/** The template id for a panel. `forced` (--doc) wins over the table. */
function docFor(id, forced) {
  return forced || DOCS[id] || DOCS.default;
}

/** Every id the app lists, once each, in order, minus any the caller skips; `only` keeps just those. Unknown names in
 *  `only` come back in `missing` so a typo is reported instead of quietly giving a smaller sheet. */
function panelList(all, { only, skip } = {}) {
  const seen = new Set();
  const ids = all.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  const wanted = only?.length ? only : null;
  const missing = wanted ? wanted.filter((id) => !seen.has(id)) : [];
  const kept = ids.filter((id) => (!wanted || wanted.includes(id)) && !(skip ?? []).includes(id));
  return { ids: kept, missing };
}

/**
 * Packs boxes left to right into rows no wider than `width`, a new row when the next one does not fit. Every box is
 * `{ w, h }` (its picture plus its caption); the result gives each its `x`, `y` and the sheet's `height`. A box wider
 * than the sheet gets a row to itself, and the sheet grows to hold it rather than clipping it.
 */
function packRows(boxes, { width = 1800, gap = 16, margin = 20 } = {}) {
  const placed = [];
  let x = margin;
  let y = margin;
  let rowH = 0;
  let widest = 0;
  for (const b of boxes) {
    if (x > margin && x + b.w > width - margin) {
      x = margin;
      y += rowH + gap;
      rowH = 0;
    }
    placed.push({ x, y });
    x += b.w + gap;
    rowH = Math.max(rowH, b.h);
    widest = Math.max(widest, placed[placed.length - 1].x + b.w);
  }
  return { placed, width: Math.max(width, widest + margin), height: y + rowH + margin };
}

/**
 * What a crop is, from a sample of its pixels (BGRA bytes, as Electron's toBitmap gives): "blank" when nearly every
 * pixel is one colour, so a panel that drew nothing is named on the sheet instead of passing as a picture.
 */
function judgePixels(bitmap, { step = 4, tolerance = 0.995 } = {}) {
  const px = bitmap.length / 4;
  if (!px) return 'blank';
  const counts = new Map();
  let n = 0;
  for (let i = 0; i < px; i += step) {
    const k = (bitmap[i * 4] << 16) | (bitmap[i * 4 + 1] << 8) | bitmap[i * 4 + 2];
    counts.set(k, (counts.get(k) ?? 0) + 1);
    n++;
  }
  let top = 0;
  for (const c of counts.values()) top = Math.max(top, c);
  return top / n >= tolerance ? 'blank' : 'ok';
}

/**
 * How tall to keep a crop: down to the last row that is not just the panel's own background (the colour of its
 * commonest colour), plus `pad`, never under `minH` or over the full height. A panel is as tall as its dock zone, so
 * without this a sheet is mostly empty space under short panels. `bitmap` is BGRA bytes, `w` and `h` its size.
 */
function trimmedHeight(bitmap, w, h, { pad = 14, minH = 90, edge = 14 } = {}) {
  if (!w || !h) return h;
  const at = (x, y) => (bitmap[(y * w + x) * 4] << 16) | (bitmap[(y * w + x) * 4 + 1] << 8) | bitmap[(y * w + x) * 4 + 2];
  const tally = new Map();
  for (let i = 0; i < w * h; i += 7) tally.set(at(i % w, Math.floor(i / w)), (tally.get(at(i % w, Math.floor(i / w))) ?? 0) + 1);
  const bg = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let last = -1;
  for (let y = h - 1; y >= 0 && last < 0; y--) {
    for (let x = 0; x < w; x++) {
      // The edges are a border, a scrollbar track or a resize grip, not content.
      if (x >= edge && x < w - edge && at(x, y) !== bg) {
        last = y;
        break;
      }
    }
  }
  return Math.min(h, Math.max(minH, last + 1 + pad));
}

/** The one-line reason a panel is not a picture, or null when it is. `facts` is what the driver saw. */
function problemOf(facts) {
  if (facts.error) return facts.error;
  if (!facts.found) return 'no panel on screen (the dock did not show it)';
  if (facts.broken) return `the panel's own error screen: ${facts.broken}`;
  if (facts.pixels === 'blank') return 'drew nothing (every pixel the same colour)';
  return null;
}

module.exports = { SEEDS, DOCS, docFor, panelList, packRows, judgePixels, trimmedHeight, problemOf };
