// The quantiser Frameling had before a0e18ee, taken out of git history (src/pixel/palette-io.ts at a0e18ee~1) with
// nothing changed except that it returns packed colours. Kept only to make the before/after pictures.
const ch = (k: number, c: number) => (k >> (16 - c * 8)) & 255;

export function oldPick(pixels: Uint8ClampedArray, max: number): number[] {
  const counts = new Map<number, number>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const k = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let keys = [...counts.keys()];
  if (keys.length > max) keys = medianCut(counts, max);
  return keys;
}

/** Median cut over weighted colours: splits the box with the widest channel until there are `n` boxes. */
function medianCut(counts: Map<number, number>, n: number): number[] {
  type Box = { keys: number[] };
  const boxes: Box[] = [{ keys: [...counts.keys()] }];
  const ch = (k: number, c: number) => (k >> (16 - c * 8)) & 255;
  const range = (b: Box): [number, number] => {
    let best = 0;
    let bestC = 0;
    for (let c = 0; c < 3; c++) {
      let lo = 255;
      let hi = 0;
      for (const k of b.keys) {
        const v = ch(k, c);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > best) {
        best = hi - lo;
        bestC = c;
      }
    }
    return [best, bestC];
  };
  while (boxes.length < n) {
    let pick = -1;
    let widest = 0;
    let channel = 0;
    boxes.forEach((b, i) => {
      if (b.keys.length < 2) return;
      const [w, c] = range(b);
      if (w > widest) {
        widest = w;
        pick = i;
        channel = c;
      }
    });
    if (pick < 0) break;
    const b = boxes[pick];
    b.keys.sort((x, y) => ch(x, channel) - ch(y, channel));
    // Split at the weighted median, so busy colours get more boxes.
    const total = b.keys.reduce((s, k) => s + counts.get(k)!, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < b.keys.length - 1; i++) {
      acc += counts.get(b.keys[i])!;
      if (acc >= total / 2) {
        cut = i + 1;
        break;
      }
    }
    boxes.splice(pick, 1, { keys: b.keys.slice(0, cut) }, { keys: b.keys.slice(cut) });
  }
  return boxes.map((b) => {
    let r = 0;
    let g = 0;
    let bl = 0;
    let w = 0;
    for (const k of b.keys) {
      const c = counts.get(k)!;
      r += ch(k, 0) * c;
      g += ch(k, 1) * c;
      bl += ch(k, 2) * c;
      w += c;
    }
    return (Math.round(r / w) << 16) | (Math.round(g / w) << 8) | Math.round(bl / w);
  });
}

