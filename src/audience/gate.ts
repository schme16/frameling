/**
 * THE GATE. Everything an audience can do to Frameling goes through here, and nowhere else.
 *
 * Who this is for: any feature that lets people outside the window (viewers, a chat bot, a Stream Deck) make something
 * happen. Quill reacts, dares, the prompt jar, votes, pen modifiers, the actions door. None of them invent their own
 * safety. They register what they can do, and the gate decides when, and whether, it runs.
 *
 * The two halves
 *
 *   1. A FEATURE registers the things it can do (the allowlist):
 *
 *        registerAudienceAction({ id: 'quill.cheer', label: 'Quill cheers', kind: 'quill', cooldown: 8000,
 *                                 run: () => quillCheer() });
 *
 *   2. A DOOR (the thing that hears from outside) hands what it heard to the gate, by id:
 *
 *        const verdict = submitAudience('quill.cheer');          // { ok: true, outcome: 'ran' } or { ok: false, reason }
 *
 *      A door that opens a connection registers itself, so the kill button can close it:
 *
 *        registerAudienceDoor({ id: 'door.local', label: 'Local actions', open: startServer, close: stopServer });
 *
 * What the gate guarantees (so a feature does not have to):
 *
 *   - Master switch. Off after install. While it is off, nothing runs and every door is closed.
 *   - Allowlist. An id nobody registered is refused. A payload with no `parse` function is never passed on.
 *   - Cooldown per kind. After an action of a kind starts, no other action of that kind is taken until the cooldown
 *     (the action's own, scaled by the strictness the streamer chose) has passed. Refused, not queued.
 *   - Global rate limit. At most `maxPerMinute` actions start in any minute and at least `minGapMs` apart. Anything
 *     over that waits in the queue and starts in order as soon as it may.
 *   - Queue. Short, oldest first, visible to the streamer, emptied with one click. Waiting too long drops an item.
 *   - Bulk. A view-only action many people send at once and that is only counted (a vote) says `bulk: true`: it skips
 *     the cooldown, the gap and the queue (they would turn a vote into ten voters a minute), and keeps a ceiling of
 *     `BULK_PER_SECOND` a second instead. It still obeys the switch, the allowlist, `parse`, its own switch and kill.
 *   - Kill. Clears the queue, aborts every running effect (`ctx.signal`), closes every door, switches the master
 *     switch off. Anything can still be switched back on by hand. It stops both kinds of action, below.
 *   - Two kinds of action. Most only change the view, Quill or on-screen words. One that reaches the DOCUMENT (a dare
 *     that smudges a layer, a pen modifier) must say `touchesDrawing: true`. A second switch, "Let the audience
 *     interrupt your drawing", is off by default; while it is off the gate refuses those outright as `unavailable`
 *     (counted, and the audience is told nothing more), and a door must not list them. Whatever such an action does
 *     to the document goes through `ctx.edit(label, recipe)`, which is ONE undo step: it can be called once per run,
 *     never after kill, and it is the only way a run gets at the document. Queue, cooldowns and rate limit apply to
 *     these exactly as to the rest.
 *
 * What the gate keeps: COUNTS only (how many ran, how many were refused and why, how many of each kind). Never who
 * asked. The gate does not read a payload, and a queued item is shown by its label alone. A feature must not put a
 * viewer's name in a payload that outlives the action, and must not write one to the document, a file or a log.
 *
 * This file has no browser, Electron or React in it, and takes the clock as a parameter, so every rule is tested with
 * a fake clock (test/audience/gate.test.ts). The app's one gate, wired to the real clock, is in ./index.ts.
 */

/**
 * How the gate says no. `off`: the master switch. `unknown`: not on the allowlist. `unavailable`: it reaches the
 * drawing and the streamer has not allowed that. `invalid`: the payload did not pass `parse`.
 */
export type RejectReason = 'off' | 'unknown' | 'unavailable' | 'invalid' | 'cooldown' | 'queue-full';

export type Verdict =
  | { ok: true; outcome: 'ran' }
  | { ok: true; outcome: 'queued'; position: number }
  | { ok: false; reason: RejectReason; /** For `cooldown`: how long until the same kind is taken again. */ retryInMs?: number };

/** Handed to `run`. */
export interface AudienceContext {
  /**
   * Changes the document as ONE undo step (one Undo takes it back), and is the only way to touch the document. There only
   * for an action marked `touchesDrawing`. Call it once per run: a second call, or one after kill, throws. If an effect
   * needs several changes, make them in one recipe.
   */
  edit?: (label: string, recipe: (doc: Draft<Doc>) => void) => void;
  /**
   * Aborted when the streamer presses kill, or switches audience features off. An effect that lasts (a banner for 30
   * seconds) returns a promise, listens to this, and puts everything back when it fires. Use `lasts()` for the wait.
   */
  signal: AbortSignal;
}

export interface AudienceActionDef<P = undefined> {
  /**
   * True when running it can change the document. Then it is refused (`unavailable`) unless the streamer has allowed
   * interruptions, and it gets `ctx.edit`, which makes the change one Undo step. Leave it out for anything that only
   * changes the view, moves Quill or shows words.
   */
  touchesDrawing?: boolean;
  /**
   * For an action whose whole point is that MANY people send it in a short time, and each is cheap and only counted
   * (a vote). It skips the kind's cooldown, the gap between actions and the queue, and runs the moment it is taken, so
   * a hundred people can vote in the same minute. It is still refused when the switch is off, when it is switched off,
   * when `parse` says no, and after kill; it still counts in `ran` and `byKind`; and a hard ceiling of `BULK_PER_SECOND`
   * a second applies, whatever the strictness. It can never touch the drawing: registering it with `touchesDrawing` throws.
   */
  bulk?: boolean;
  /** Stable, `area.name` in lower case, like a command id: `quill.cheer`, `dare.flipView`. */
  id: string;
  /** Plain words, shown in the queue and the counts ("Quill cheers"). */
  label: string;
  /** The group the cooldown is shared by: `quill`, `dare`, `prompt`, `vote`, `pen`, `door`. Lower case. */
  kind: string;
  /** Milliseconds before another action of this kind is taken. Defaults to 10 seconds. The streamer's strictness scales it. */
  cooldown?: number;
  /**
   * Checks what came from outside and returns the cleaned payload, or null to refuse it. Without this function the
   * action gets no payload at all. It runs before anything is queued, so rubbish never waits in line. Keep names out.
   */
  parse?(raw: unknown): P | null;
  /**
   * Does the thing. Runs at most once per accepted request, never while the switch is off. Throwing or rejecting is
   * counted and otherwise ignored. If it returns a promise, the effect counts as running until it settles, and kill
   * aborts `ctx.signal`. Only the view, Quill and on-screen text may change here, never the document, except an
   * ordinary undoable stroke (rule 1 of the streamer plan).
   */
  run(payload: P, ctx: AudienceContext): void | Promise<void>;
}

/** A way in from outside. The gate opens it with the switch and closes it on kill. `open` and `close` must be safe to call twice. */
export interface AudienceDoorDef {
  id: string;
  /** Plain words ("Local actions"), shown on the On air pill. */
  label: string;
  open(): void;
  close(): void;
}

/** How careful the gate is. All times in milliseconds. */
export interface GateLimits {
  /** At least this long between any two actions starting. */
  minGapMs: number;
  /** At most this many actions start in any 60 seconds. */
  maxPerMinute: number;
  /** How many can wait. A full queue refuses. */
  maxQueue: number;
  /** Multiplies every action's cooldown. */
  cooldownScale: number;
  /** A waiting item older than this is dropped, because by now nobody wants it. */
  maxWaitMs: number;
}

export type Strictness = 'relaxed' | 'balanced' | 'strict';

export const STRICTNESS: Record<Strictness, GateLimits> = {
  relaxed: { minGapMs: 1500, maxPerMinute: 20, maxQueue: 20, cooldownScale: 0.5, maxWaitMs: 60_000 },
  balanced: { minGapMs: 3000, maxPerMinute: 10, maxQueue: 10, cooldownScale: 1, maxWaitMs: 45_000 },
  strict: { minGapMs: 6000, maxPerMinute: 4, maxQueue: 5, cooldownScale: 2, maxWaitMs: 30_000 },
};

export const DEFAULT_COOLDOWN_MS = 10_000;

/** The most `bulk` requests taken in any one second. Past it the gate says `cooldown`, so a flood costs almost nothing. */
export const BULK_PER_SECOND = 100;

/** Reads `STRICTNESS` by a name that may be anything (an old or hand-edited setting): unknown names get balanced. */
export function limitsFor(name: unknown): GateLimits {
  return name === 'relaxed' || name === 'strict' ? STRICTNESS[name] : STRICTNESS.balanced;
}

/** What the gate has kept. Counts only: nothing here says who. */
export interface AudienceCounts {
  /** Every request that reached the gate, taken or not. */
  received: number;
  ran: number;
  /** Requests that had to wait (they also count under `ran` or `expired` or `cleared` later). */
  queued: number;
  rejected: Record<RejectReason, number>;
  /** Dropped from the queue for waiting too long. */
  expired: number;
  /** Dropped from the queue by the streamer, kill or the switch. */
  cleared: number;
  /** Ran but threw or rejected. */
  failed: number;
  kills: number;
  /** How many of each kind ran. */
  byKind: Record<string, number>;
}

export interface QueuedView {
  /** Counts up for ever in a session; lets a list keep its place. */
  ticket: number;
  /** The action's label, never anything from the payload. */
  label: string;
  kind: string;
  /** When it joined, on the gate's clock (Date.now() in the app). */
  at: number;
}

export interface GateSnapshot {
  on: boolean;
  /** The streamer allows actions that reach the drawing. */
  drawingAllowed: boolean;
  queue: QueuedView[];
  /** Effects that are still running (promises not yet settled). */
  running: number;
  counts: AudienceCounts;
  limits: GateLimits;
  doors: { id: string; label: string }[];
  /** `available` is what a door may list: false for a `touchesDrawing` action while interruptions are not allowed. */
  actions: { id: string; label: string; kind: string; cooldown: number; touchesDrawing: boolean; available: boolean; /** False when the streamer switched this one off (see `setActionEnabled`). */ enabled: boolean; /** True when it reads a payload (it has a `parse`), so a door may offer to send words with it. */ takesDetails: boolean; /** True for a counted-only action many people send at once (a vote). */ bulk: boolean }[];
}

/** The parts of the outside world the gate needs. */
export interface GateEnv {
  now(): number;
  /** Calls `fn` after `ms`. Returns the way to cancel it. */
  later(fn: () => void, ms: number): () => void;
  /** The limits in force right now (read on every request, so a new strictness acts at once). */
  limits(): GateLimits;
  /** One undo step on the document. Without it (tests, a plain page) a `touchesDrawing` action gets no `ctx.edit`. */
  edit?(label: string, recipe: (doc: Draft<Doc>) => void): void;
}

import type { Draft } from 'immer';
import type { Doc } from '../core/format';

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;
const KIND_RE = /^[a-z][a-z0-9-]*$/;

export function emptyCounts(): AudienceCounts {
  return { received: 0, ran: 0, queued: 0, rejected: { off: 0, unknown: 0, unavailable: 0, invalid: 0, cooldown: 0, 'queue-full': 0 }, expired: 0, cleared: 0, failed: 0, kills: 0, byKind: {} };
}

/** Resolves after `ms`, or sooner when `signal` aborts. For an effect that lasts: `await lasts(30_000, ctx.signal)`, then put things back. */
export function lasts(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const t = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Pure: when may the next action start? `lastRunAt` is when the latest one started (null for none), `runs` are the
 * start times in the last minute, oldest first. Returns the gate-clock time, which is `now` or earlier when it may go now.
 */
export function nextRunAt(now: number, lastRunAt: number | null, runs: number[], limits: Pick<GateLimits, 'minGapMs' | 'maxPerMinute'>): number {
  let at = lastRunAt === null ? -Infinity : lastRunAt + limits.minGapMs;
  const cap = Math.max(1, Math.floor(limits.maxPerMinute));
  const recent = runs.filter((t) => t > now - 60_000);
  if (recent.length >= cap) at = Math.max(at, recent[recent.length - cap] + 60_000);
  return at;
}

/** Pure: is this kind still cooling down? Returns the milliseconds left, or 0. */
export function cooldownLeft(now: number, lastOfKind: number | undefined, cooldownMs: number): number {
  if (lastOfKind === undefined) return 0;
  return Math.max(0, lastOfKind + cooldownMs - now);
}

interface Waiting {
  ticket: number;
  def: AudienceActionDef<unknown>;
  payload: unknown;
  at: number;
}

export interface Gate {
  registerAction<P = undefined>(def: AudienceActionDef<P>): () => void;
  registerDoor(def: AudienceDoorDef): () => void;
  /** What a door calls with what it heard. Never throws. `raw` is untrusted and only reaches the action through its `parse`. */
  submit(id: string, raw?: unknown): Verdict;
  isOn(): boolean;
  /** Switches one action off or on by hand. Off: refused as `unavailable`, dropped from the queue, and any run of it is stopped. Remembered by the caller, not here. */
  setActionEnabled(id: string, enabled: boolean): void;
  isActionEnabled(id: string): boolean;
  /** Allows or forbids actions that reach the drawing. Forbidding drops the waiting ones and stops the running ones of that kind. */
  setDrawingAllowed(allowed: boolean): void;
  /** Switching off is the same as kill, without the count: queue cleared, effects aborted, doors closed. */
  setOn(on: boolean): void;
  /** The big red button. */
  kill(): void;
  /** Empties the queue only. Returns how many were waiting. */
  clearQueue(): number;
  /** Starts whatever may start now. The timer calls it; tests call it after moving the clock. */
  pump(): void;
  resetCounts(): void;
  /** Tells listeners to look again (the limits the env reports changed). */
  refresh(): void;
  snapshot(): GateSnapshot;
  subscribe(fn: () => void): () => void;
}

export function createGate(env: GateEnv): Gate {
  const actions = new Map<string, AudienceActionDef<unknown>>();
  const doors = new Map<string, AudienceDoorDef>();
  const lastByKind = new Map<string, number>();
  const running = new Set<AbortController>();
  const runningDrawing = new Set<AbortController>();
  const listeners = new Set<() => void>();
  let queue: Waiting[] = [];
  let runs: number[] = [];
  let lastRunAt: number | null = null;
  let bulkTimes: number[] = [];
  let on = false;
  let drawingOk = false;
  const switchedOff = new Set<string>();
  let ticket = 0;
  let counts = emptyCounts();
  let cancelWake: (() => void) | null = null;
  let snap: GateSnapshot | null = null;

  const changed = () => {
    snap = null;
    for (const f of [...listeners]) {
      try {
        f();
      } catch {
        // A broken listener must not stop the gate.
      }
    }
  };

  const callDoor = (d: AudienceDoorDef, what: 'open' | 'close') => {
    try {
      d[what]();
    } catch {
      // A door that fails to close is the door's fault; the switch is still off and nothing is let through.
    }
  };

  function start(w: Waiting, now: number, paced = true): void {
    // A bulk request is not part of the pace: it neither waits for it nor moves it.
    if (paced) {
      lastRunAt = now;
      runs = runs.filter((t) => t > now - 60_000);
      runs.push(now);
    }
    counts.ran++;
    counts.byKind[w.def.kind] = (counts.byKind[w.def.kind] ?? 0) + 1;
    const ctl = new AbortController();
    const ctx: AudienceContext = { signal: ctl.signal };
    if (w.def.touchesDrawing && env.edit) {
      let used = false;
      ctx.edit = (label, recipe) => {
        if (ctl.signal.aborted) throw new Error('Stopped: the audience action can no longer change the drawing.');
        if (used) throw new Error('An audience action changes the drawing once, as one undo step.');
        used = true;
        env.edit!(label, recipe);
      };
    }
    if (w.def.touchesDrawing) runningDrawing.add(ctl);
    try {
      const r = w.def.run(w.payload, ctx);
      if (r && typeof (r as Promise<void>).then === 'function') {
        running.add(ctl);
        (r as Promise<void>).then(
          () => {
            running.delete(ctl);
            runningDrawing.delete(ctl);
            changed();
          },
          () => {
            running.delete(ctl);
            runningDrawing.delete(ctl);
            counts.failed++;
            changed();
          },
        );
      } else runningDrawing.delete(ctl);
    } catch {
      runningDrawing.delete(ctl);
      counts.failed++;
    }
  }

  function wake(): void {
    cancelWake?.();
    cancelWake = null;
    if (!on || !queue.length) return;
    const now = env.now();
    const lim = env.limits();
    const at = Math.max(nextRunAt(now, lastRunAt, runs, lim), now);
    // Also wake to drop the oldest if it expires first.
    const expire = queue[0].at + lim.maxWaitMs;
    const when = Math.min(at, Math.max(expire, now));
    cancelWake = env.later(pump, Math.max(0, when - now));
  }

  function pump(): void {
    if (!on) return;
    const now = env.now();
    const lim = env.limits();
    let moved = false;
    // Drop what waited too long.
    const fresh = queue.filter((w) => now - w.at < lim.maxWaitMs);
    if (fresh.length !== queue.length) {
      counts.expired += queue.length - fresh.length;
      queue = fresh;
      moved = true;
    }
    while (queue.length && nextRunAt(now, lastRunAt, runs, lim) <= now) {
      const w = queue.shift()!;
      moved = true;
      // Taken off the allowlist while it waited (a feature was switched off): drop it.
      if (actions.get(w.def.id) !== w.def || (w.def.touchesDrawing && !drawingOk) || switchedOff.has(w.def.id)) {
        counts.cleared++;
        continue;
      }
      start(w, now);
    }
    wake();
    if (moved) changed();
  }

  function shutDown(): void {
    on = false;
    cancelWake?.();
    cancelWake = null;
    counts.cleared += queue.length;
    queue = [];
    for (const ctl of [...running]) ctl.abort();
    running.clear();
    runningDrawing.clear();
    for (const d of doors.values()) callDoor(d, 'close');
  }

  const gate: Gate = {
    registerAction(def) {
      if (!def || typeof def.run !== 'function') throw new Error('An audience action needs a run function.');
      if (!ID_RE.test(def.id)) throw new Error(`Audience action id "${def.id}" must be like "area.name", in lower case.`);
      if (!KIND_RE.test(def.kind)) throw new Error(`Audience action "${def.id}" needs a kind in lower case, like "quill" or "dare".`);
      if (!def.label?.trim()) throw new Error(`Audience action "${def.id}" needs a label in plain words.`);
      if (def.bulk && def.touchesDrawing) throw new Error(`Audience action "${def.id}" is bulk, so it cannot touch the drawing.`);
      if (def.cooldown !== undefined && !(Number.isFinite(def.cooldown) && def.cooldown >= 0)) throw new Error(`Audience action "${def.id}" has a cooldown that is not a number of milliseconds.`);
      if (actions.has(def.id)) throw new Error(`Audience action "${def.id}" is already registered.`);
      const stored = def as unknown as AudienceActionDef<unknown>;
      actions.set(def.id, stored);
      changed();
      return () => {
        if (actions.get(def.id) !== stored) return;
        actions.delete(def.id);
        // What waited on it goes too, so nothing runs after its feature is gone.
        const left = queue.filter((w) => w.def !== stored);
        counts.cleared += queue.length - left.length;
        queue = left;
        wake();
        changed();
      };
    },

    registerDoor(def) {
      if (!def?.id || typeof def.open !== 'function' || typeof def.close !== 'function') throw new Error('An audience door needs an id, open and close.');
      if (doors.has(def.id)) throw new Error(`Audience door "${def.id}" is already registered.`);
      doors.set(def.id, def);
      // A door never opens by itself: only while the switch is on.
      if (on) callDoor(def, 'open');
      changed();
      return () => {
        if (doors.get(def.id) !== def) return;
        callDoor(def, 'close');
        doors.delete(def.id);
        changed();
      };
    },

    submit(id, raw) {
      counts.received++;
      const reject = (reason: RejectReason, retryInMs?: number): Verdict => {
        counts.rejected[reason]++;
        changed();
        return retryInMs === undefined ? { ok: false, reason } : { ok: false, reason, retryInMs };
      };
      if (!on) return reject('off');
      const def = typeof id === 'string' ? actions.get(id) : undefined;
      if (!def) return reject('unknown');
      if ((def.touchesDrawing && !drawingOk) || switchedOff.has(def.id)) return reject('unavailable');
      let payload: unknown;
      if (def.parse) {
        try {
          const p = def.parse(raw);
          if (p === null || p === undefined) return reject('invalid');
          payload = p;
        } catch {
          return reject('invalid');
        }
      }
      const now = env.now();
      if (def.bulk) {
        bulkTimes = bulkTimes.filter((t) => t > now - 1000);
        if (bulkTimes.length >= BULK_PER_SECOND) return reject('cooldown', bulkTimes[0] + 1000 - now);
        bulkTimes.push(now);
        start({ ticket: ++ticket, def, payload, at: now }, now, false);
        changed();
        return { ok: true, outcome: 'ran' };
      }
      const lim = env.limits();
      const left = cooldownLeft(now, lastByKind.get(def.kind), (def.cooldown ?? DEFAULT_COOLDOWN_MS) * lim.cooldownScale);
      if (left > 0) return reject('cooldown', left);
      const w: Waiting = { ticket: ++ticket, def, payload, at: now };
      // Order is kept: nothing jumps a queue.
      if (!queue.length && nextRunAt(now, lastRunAt, runs, lim) <= now) {
        lastByKind.set(def.kind, now);
        start(w, now);
        changed();
        return { ok: true, outcome: 'ran' };
      }
      if (queue.length >= lim.maxQueue) return reject('queue-full');
      lastByKind.set(def.kind, now);
      queue.push(w);
      counts.queued++;
      wake();
      changed();
      return { ok: true, outcome: 'queued', position: queue.length };
    },

    isOn: () => on,

    setOn(next) {
      if (next === on) return;
      if (next) {
        on = true;
        for (const d of doors.values()) callDoor(d, 'open');
      } else shutDown();
      changed();
    },

    setActionEnabled(id, enabled) {
      if (enabled === !switchedOff.has(id)) return;
      if (enabled) switchedOff.delete(id);
      else {
        switchedOff.add(id);
        const left = queue.filter((w) => w.def.id !== id);
        counts.cleared += queue.length - left.length;
        queue = left;
        wake();
      }
      changed();
    },

    isActionEnabled: (id) => !switchedOff.has(id),

    setDrawingAllowed(allowed) {
      if (allowed === drawingOk) return;
      drawingOk = allowed;
      if (!allowed) {
        const left = queue.filter((w) => !w.def.touchesDrawing);
        counts.cleared += queue.length - left.length;
        queue = left;
        for (const ctl of [...runningDrawing]) {
          ctl.abort();
          running.delete(ctl);
        }
        runningDrawing.clear();
        wake();
      }
      changed();
    },

    kill() {
      counts.kills++;
      shutDown();
      changed();
    },

    clearQueue() {
      const n = queue.length;
      if (!n) return 0;
      counts.cleared += n;
      queue = [];
      wake();
      changed();
      return n;
    },

    pump,

    resetCounts() {
      counts = emptyCounts();
      changed();
    },

    refresh: () => changed(),

    snapshot() {
      return (snap ??= {
        on,
        drawingAllowed: drawingOk,
        queue: queue.map((w) => ({ ticket: w.ticket, label: w.def.label, kind: w.def.kind, at: w.at })),
        running: running.size,
        // Copied, so a held snapshot never changes under a view.
        counts: { ...counts, rejected: { ...counts.rejected }, byKind: { ...counts.byKind } },
        limits: env.limits(),
        doors: [...doors.values()].map((d) => ({ id: d.id, label: d.label })),
        actions: [...actions.values()].map((a) => ({ id: a.id, label: a.label, kind: a.kind, cooldown: a.cooldown ?? DEFAULT_COOLDOWN_MS, touchesDrawing: a.touchesDrawing === true, available: (!a.touchesDrawing || drawingOk) && !switchedOff.has(a.id), enabled: !switchedOff.has(a.id), takesDetails: typeof a.parse === 'function', bulk: a.bulk === true })),
      });
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
  return gate;
}
