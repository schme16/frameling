// The Spray: a sprinkle of Paint pixels around the pointer while you drag. Pure scatter maths here, so it can be tested.

/** Cells inside a disc of `radius` art pixels round (cx, cy), each kept with chance `density`. `rng` gives 0 to 1. */
export function sprayCells(cx: number, cy: number, radius: number, density: number, rng: () => number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const r = Math.max(0.5, radius);
  const lim = Math.ceil(r);
  for (let dy = -lim; dy <= lim; dy++) {
    for (let dx = -lim; dx <= lim; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      if (rng() < density) out.push({ x: cx + dx, y: cy + dy });
    }
  }
  return out;
}

/** The chance a cell of the spray gets a pixel each time the pointer moves a cell: thin enough to build up, not to fill in at once. */
export const SPRAY_DENSITY = 0.12;

/** A small seeded generator, so a spray can be repeated exactly (tests, and undo-free previews). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
