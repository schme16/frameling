// Puts the pen modifiers on the audience gate, keeps which ones the streamer switched off, and lets the streamer try one
// by hand. The shape is the dares' (../dares/registry.ts): the same one-resource claim from ../dares/fx.ts, so a new
// modifier takes over from the old one and they never pile up, and the same three ways to end (time runs out, the gate
// aborts it, the streamer presses Put it back), all of which take the modifier away in the same breath.
import { audience, registerAudienceAction } from '../audience';
import { dareMs } from '../dares/catalogue';
import { hold, release } from '../dares/fx';
import { readJson, writeJson } from '../ui/mini';
import { toast } from '../ui/toast';
import { penEffect, type PenEffect } from './active';
import { PEN_COOLDOWN, PEN_KIND, penModById, penMods, type PenModDef } from './catalogue';

const KEY = 'frameling.penmods.v1';

/** The ids the streamer has switched off. Remembered across runs. */
const switchedOff = new Set<string>(readJson<{ off: string[] }>(KEY, { off: [] }).off.filter((x) => typeof x === 'string'));

const save = () => writeJson(KEY, { off: [...switchedOff] });

export const isPenModEnabled = (id: string): boolean => !switchedOff.has(id);

/** The runs going right now, so switching one off, or Put it back, can end them. */
const live = new Map<string, Set<AbortController>>();

/** Switches one modifier off or on. Off: the gate refuses it, drops it from the queue, and ends it if it is on. */
export function setPenModEnabled(id: string, enabled: boolean): void {
  if (!penModById(id)) return;
  if (enabled) switchedOff.delete(id);
  else switchedOff.add(id);
  save();
  audience.setActionEnabled(id, enabled);
  if (!enabled) for (const ctl of [...(live.get(id) ?? [])]) ctl.abort();
}

/** What a modifier says when it starts, in words, so nobody wonders why the pen feels odd. */
const said = (m: string) => void toast(m, { duration: 4500, quill: null, sound: null });

/**
 * Puts a modifier on the pen for as long as it lasts, then takes it off. The effect is a NEW object each time: ending it
 * takes it away only if it is still this one, so an end can never undo something newer.
 */
export function runPenMod(def: PenModDef, signal: AbortSignal): Promise<void> {
  const child = new AbortController();
  const link = () => child.abort();
  if (signal.aborted) child.abort();
  else signal.addEventListener('abort', link, { once: true });
  const set = live.get(def.id) ?? new Set();
  set.add(child);
  live.set(def.id, set);
  return hold('pen', { id: def.id, label: def.label, ms: dareMs(def.factor) }, child.signal, () => {
    const mine: PenEffect = { ...def.effect };
    penEffect.set(mine);
    said(`${def.label}: ${def.feel} The chip at the top right ends it.`);
    return () => {
      if (penEffect.get() === mine) penEffect.set(null);
    };
  }).finally(() => {
    set.delete(child);
    signal.removeEventListener('abort', link);
  });
}

/** Registers every modifier on the gate. Call from the feature's `activate`, so they go when it does. */
export function registerPenMods(): void {
  for (const def of penMods) {
    registerAudienceAction({
      id: def.id,
      label: def.label,
      kind: PEN_KIND,
      cooldown: PEN_COOLDOWN,
      // They change the strokes you go on to draw, which are permanent, so the "interrupt your drawing" switch gates them.
      touchesDrawing: true,
      run: (_: undefined, ctx) => runPenMod(def, ctx.signal),
    });
    if (switchedOff.has(def.id)) audience.setActionEnabled(def.id, false);
  }
}

/**
 * The streamer puts one on themselves, to see it. It does not go through the gate (no queue, no cooldown, nothing
 * counted, audience features need not be on), and it is the streamer's own hand, so it runs even with the interrupt switch
 * off. Put it back ends it. Returns false for an unknown id.
 */
export function tryPenMod(id: string): boolean {
  const def = penModById(id);
  if (!def) return false;
  const ctl = new AbortController();
  tries.add(ctl);
  void runPenMod(def, ctl.signal)
    .catch(() => undefined)
    .finally(() => tries.delete(ctl));
  return true;
}
const tries = new Set<AbortController>();

/** Takes the modifier off right now, whoever started it, and puts the pen back exactly as it was. */
export function stopPenMods(): void {
  for (const set of live.values()) for (const ctl of [...set]) ctl.abort();
  for (const ctl of [...tries]) ctl.abort();
  tries.clear();
  release('pen');
  penEffect.set(null);
}

/** Watches the gate: kill, or audience features going off, takes the modifier off in the same moment. Returns the way to stop watching. */
export function watchGate(): () => void {
  let lastOn = audience.isOn();
  let lastKills = audience.snapshot().counts.kills;
  return audience.subscribe(() => {
    const s = audience.snapshot();
    const stopped = (lastOn && !s.on) || s.counts.kills !== lastKills;
    lastOn = s.on;
    lastKills = s.counts.kills;
    if (stopped) stopPenMods();
  });
}

export function _resetPenModsForTests(): void {
  switchedOff.clear();
  stopPenMods();
}
