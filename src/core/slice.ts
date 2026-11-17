/**
 * Time slicing for a slow redraw. Some pictures (paper tooth on a chalk or charcoal line, an effect on one shape) cost
 * tens of milliseconds each to work out, and a zoomed in view needs a new one of each for every view. A redraw run
 * through `runSliced` builds new pictures only until its time is spent, then skips the rest and says it was cut short.
 * The pictures it did make are kept (their caches see to that), so the next run starts further on, and a few short runs
 * finish what one long run would have done in a single frame. A run never skips its first build, so every run moves on.
 */
let deadline = 0;
let built = 0;
let cut = false;

/** Runs `draw` with `ms` to spend on new pictures. True when it finished, false when it was cut short. */
export function runSliced(ms: number, draw: () => void): boolean {
  deadline = performance.now() + ms;
  built = 0;
  cut = false;
  try {
    draw();
  } finally {
    deadline = 0;
  }
  return !cut;
}

/** Asked before working out a picture that is not kept yet: true to go ahead (always, outside a sliced run). */
export function mayBuild(): boolean {
  if (!deadline) return true;
  if (built > 0 && performance.now() >= deadline) {
    cut = true;
    return false;
  }
  built++;
  return true;
}

/** Whether a sliced run is going now. */
export function slicing(): boolean {
  return deadline !== 0;
}
