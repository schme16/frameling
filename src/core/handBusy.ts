// Is there a hand on the canvas right now: a stroke, a drag, a pan, a transform. Work that can wait asks before it
// runs, so it never stalls the line somebody is in the middle of drawing.
//
// The one that matters is autosave. Its clock does not care that your pen is down, and on a big document a save is
// tens of milliseconds on the main thread, which lands in a stroke as a visible hitch. Waiting for the release costs
// nothing: strokes are a second or two, and the copy is just as good a moment later.

let busy = false;
let waiting: (() => void)[] = [];

/** Is a gesture happening on the canvas. */
export const handIsBusy = (): boolean => busy;

/** The canvas says so: true when a gesture starts, false when it ends. */
export function setHandBusy(on: boolean): void {
  if (busy === on) return;
  busy = on;
  if (on) return;
  const due = waiting;
  waiting = [];
  for (const job of due) job();
}

/** Runs the job now if the canvas is free, otherwise the moment the gesture ends. */
export function whenHandIsFree(job: () => void): void {
  if (!busy) {
    job();
    return;
  }
  waiting.push(job);
}

/** Tests only: back to nothing waiting and no hand down. */
export function resetHandBusy(): void {
  busy = false;
  waiting = [];
}
