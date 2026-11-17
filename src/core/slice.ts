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

// ---------------------------------------------------------------- progressive drawing
//
// Slices through the caches (above) only work while the caches can hold every picture the view needs. A drawing with a lot of
// tooth, zoomed in, needs more than they hold, so the pictures of the first lines are gone before the last are made and the
// work never finishes. A progressive run does not rely on them: it draws the first few top-level units (a shape, or a whole
// pixel or tile drawing) onto a canvas that is kept between runs, and the next run skips the units already on it and carries
// on. So the work is finished after a fixed number of runs, whatever the caches keep.
interface Progress {
  skip: number;
  done: number;
  /** Units drawn in this run (the first is always allowed). */
  drawn: number;
  deadline: number;
  stopped: boolean;
  nest: number;
}
let prog: Progress | null = null;

/**
 * Runs `draw` (a redraw that goes through drawDrawing) skipping the first `from` units and stopping at the first unit that
 * starts after `ms` is spent, though always doing at least one. `done` is how many units are on the canvas now (pass it as
 * `from` next time), `complete` is whether the drawing ran to its end.
 */
export function runProgressive(ms: number, from: number, draw: () => void): { done: number; complete: boolean } {
  const p: Progress = { skip: from, done: from, drawn: 0, deadline: performance.now() + ms, stopped: false, nest: 0 };
  prog = p;
  try {
    draw();
  } finally {
    prog = null;
  }
  return { done: p.done, complete: !p.stopped };
}

/** Asked by drawDrawing before each top-level unit: draw it, skip it (already on the canvas) or stop (time is spent). */
export function unitBegin(): 'draw' | 'skip' | 'stop' {
  const p = prog;
  if (!p) return 'draw';
  if (p.nest > 0) {
    p.nest++;
    return 'draw';
  }
  if (p.skip > 0) {
    p.skip--;
    return 'skip';
  }
  if (p.stopped || (p.drawn > 0 && performance.now() >= p.deadline)) {
    p.stopped = true;
    return 'stop';
  }
  p.nest = 1;
  p.drawn++;
  return 'draw';
}

/** Called when a unit that was drawn is finished. */
export function unitEnd(): void {
  const p = prog;
  if (!p) return;
  if (--p.nest === 0) p.done++;
}
