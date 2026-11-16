// Waiting for a thing to be true, instead of sleeping for how long we guess it takes.
//
// A fixed sleep is a guess about duration. It passes alone and fails when ~25 test workers share the CPU (tiles.export
// needed 21 to 28 ms idle and 82 to 106 ms under load, against a fixed 80 ms). These helpers poll the real condition
// with a generous ceiling: the quiet case returns at once, and a genuine failure still fails, just later.
//
// The ceiling stays under the test timeout (vitest.config.ts, 120 s) so a stuck wait reports "timed out waiting for
// <label>" rather than a bare test timeout.

/** How long a wait may take before it counts as a real failure. Generous on purpose, for a busy machine. */
export const WAIT_CEILING_MS = 45_000;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Polls until `read()` gives something `done` accepts, and returns it. After the ceiling it returns the last read
 * anyway, so the caller's own expect() says what was wrong (a command that really does nothing still fails).
 */
export async function settled<T>(read: () => T, done: (v: T) => boolean, opts: { ceilingMs?: number; stepMs?: number } = {}): Promise<T> {
  const end = Date.now() + (opts.ceilingMs ?? WAIT_CEILING_MS);
  let v = read();
  while (!done(v) && Date.now() < end) {
    await pause(opts.stepMs ?? 10);
    v = read();
  }
  return v;
}

/** Polls until the condition holds, then resolves. Throws "timed out waiting" after the ceiling. */
export async function waitUntil(cond: () => boolean, label = 'the condition', opts: { ceilingMs?: number; stepMs?: number } = {}): Promise<void> {
  const ok = await settled(cond, (v) => v, opts);
  if (!ok) throw new Error(`timed out waiting for ${label}`);
}
