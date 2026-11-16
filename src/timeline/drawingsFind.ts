// "Find a drawing" is a command that can run before the Drawings panel is on screen, so it leaves a note here and the
// panel takes it when it shows (or sees the tick change).
let wanted = false;

/** Asks for the cursor to go to the Drawings panel's search box. */
export function wantFind(): void {
  wanted = true;
}

/** True once for each request. */
export function consumeFind(): boolean {
  const w = wanted;
  wanted = false;
  return w;
}
