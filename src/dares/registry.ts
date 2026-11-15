// Puts the dares on the audience gate, keeps which ones the streamer switched off, and lets the streamer try one by hand.
import { audience, registerAudienceAction, type AudienceContext } from '../audience';
import { store } from '../core/store';
import { readJson, writeJson } from '../ui/mini';
import { allDares, dareById, type DareDef } from './catalogue';
import { releaseAll } from './fx';

const KEY = 'frameling.dares.v1';

/** The ids the streamer has switched off. Remembered across runs. */
const switchedOff = new Set<string>(readJson<{ off: string[] }>(KEY, { off: [] }).off.filter((x) => typeof x === 'string'));

const save = () => writeJson(KEY, { off: [...switchedOff] });

export const isDareEnabled = (id: string): boolean => !switchedOff.has(id);

/** Switches one dare off or on. Off: the gate refuses it, drops it from the queue, and stops it if it is running. */
export function setDareEnabled(id: string, enabled: boolean): void {
  if (!dareById(id)) return;
  if (enabled) switchedOff.delete(id);
  else switchedOff.add(id);
  save();
  audience.setActionEnabled(id, enabled);
  if (!enabled) for (const ctl of [...(live.get(id) ?? [])]) ctl.abort();
}

/** The runs of each dare that are going right now, so switching it off can stop them. */
const live = new Map<string, Set<AbortController>>();

/** Wraps a dare's run so it can be stopped on its own, as well as by kill. Always returns a promise. */
export function runDare(def: DareDef<any>, payload: unknown, ctx: AudienceContext): Promise<void> {
  const child = new AbortController();
  const link = () => child.abort();
  if (ctx.signal.aborted) child.abort();
  else ctx.signal.addEventListener('abort', link, { once: true });
  const set = live.get(def.id) ?? new Set();
  set.add(child);
  live.set(def.id, set);
  // Run now, not on the next tick: an edit and an abort both land in the same breath as the request.
  let ran: Promise<void>;
  try {
    ran = Promise.resolve(def.run(payload, { ...ctx, signal: child.signal }));
  } catch (e) {
    ran = Promise.reject(e);
  }
  return ran.finally(() => {
    set.delete(child);
    ctx.signal.removeEventListener('abort', link);
  });
}

/** Registers every dare on the gate. Call from the feature's `activate`, so they go when it does. */
export function registerDares(): void {
  for (const def of allDares) {
    registerAudienceAction<any>({
      id: def.id,
      label: def.label,
      kind: def.kind,
      cooldown: def.cooldown,
      touchesDrawing: def.family === 'drawing',
      parse: def.parse,
      run: (payload, ctx) => runDare(def, payload, ctx),
    });
    if (switchedOff.has(def.id)) audience.setActionEnabled(def.id, false);
  }
}

// ---------------------------------------------------------------- trying one by hand

const tries = new Set<AbortController>();

/**
 * The streamer fires a dare at themselves, to see it. It does not go through the audience gate (no queue, no
 * cooldown, nothing counted, audience features need not be on), and it is the streamer's own hand, so a drawing dare
 * runs even with the interrupt switch off. It is still ONE edit step, and Stop ends it. Returns false for an unknown id.
 */
export function tryDare(id: string): boolean {
  const def = dareById(id);
  if (!def) return false;
  const parsed = def.parse ? def.parse(undefined) : undefined;
  if (def.parse && (parsed === null || parsed === undefined)) return false;
  const ctl = new AbortController();
  tries.add(ctl);
  let used = false;
  const ctx: AudienceContext = {
    signal: ctl.signal,
    ...(def.family === 'drawing'
      ? {
          edit: (label: string, recipe: Parameters<NonNullable<AudienceContext['edit']>>[1]) => {
            if (ctl.signal.aborted) throw new Error('Stopped.');
            if (used) throw new Error('A dare changes the drawing once, as one undo step.');
            used = true;
            store().update(label, recipe);
          },
        }
      : {}),
  };
  void runDare(def, parsed, ctx)
    .catch(() => undefined)
    .finally(() => tries.delete(ctl));
  return true;
}

/** Puts everything back at once: every try, every lasting effect, every banner. */
export function stopDares(): void {
  for (const ctl of [...tries]) ctl.abort();
  tries.clear();
  releaseAll();
}

/** Watches the gate: kill, or the switch going off, puts everything back in the same moment. Returns the way to stop watching. */
export function watchGate(): () => void {
  let lastOn = audience.isOn();
  let lastKills = audience.snapshot().counts.kills;
  return audience.subscribe(() => {
    const s = audience.snapshot();
    const stopped = (lastOn && !s.on) || s.counts.kills !== lastKills;
    lastOn = s.on;
    lastKills = s.counts.kills;
    if (stopped) stopDares();
  });
}

export function _resetDaresForTests(): void {
  switchedOff.clear();
  stopDares();
}
