// State that lives outside the store but belongs to one drawing (the timeline's zoom, the picked bone...). Each place
// that holds some says how to put it back with `onFreshDrawing`, and every load of a different drawing runs them all,
// so a new or opened drawing never inherits the last one's leftovers. See src/io/fresh.ts for where it is hooked up.
const resets = new Set<() => void>();

/** Registers how to put one piece of drawing-bound state back to a new window's. Returns a way to stop. */
export function onFreshDrawing(reset: () => void): () => void {
  resets.add(reset);
  return () => void resets.delete(reset);
}

/** Puts every registered piece of drawing-bound state back to a new window's. */
export function resetDrawingState(): void {
  for (const r of resets) r();
}
