// The remote door's rules on the page, pure so every one is tested on its own: what a request may say, what it may press,
// and when the app is too busy to be driven. Pressing and choosing follow the Scripts panel's rules exactly (appRules.ts):
// the door reaches what a script reaches, and nothing more.
import type { AppSet } from '../plugins/appRules';
import { cleanAppSet, isRunnable } from '../plugins/appRules';
import { LIMITS } from '../scripts/model';

/** The most steps one run may have. A run is one Undo step, so this also bounds what one Undo takes back. */
export const MAX_STEPS = 200;
export const LABEL_MAX = 60;

export type RunStep = { command: string } | { set: AppSet };
export interface CleanRun {
  steps: RunStep[];
  label: string;
}
export type Cleaned<T> = { ok: true; value: T } | { ok: false; reason: 'invalid' | 'refused'; message: string };

// Control characters, zero-width and direction-changing marks, line and paragraph separators.
const ODD = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g');
/** One short line with nothing odd in it, or '' for none. What a caller names a run, and what the log shows. */
export const cleanLabel = (v: unknown, max = LABEL_MAX): string => (typeof v === 'string' ? v.replace(ODD, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `{ steps: [{ command: "edit.duplicate" }, { set: { frame: 3 } }], label?: "Make a row" }`. Nothing is pressed until every
 * step has been checked, so a bad last step cannot leave the first ones done.
 */
export function cleanRun(raw: unknown): Cleaned<CleanRun> {
  if (!isObj(raw)) return { ok: false, reason: 'invalid', message: 'Send { "steps": [ { "command": "edit.duplicate" }, ... ] }.' };
  const list = raw.steps;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, reason: 'invalid', message: '"steps" has to be a list with at least one step in it.' };
  if (list.length > MAX_STEPS) return { ok: false, reason: 'invalid', message: `A run has at most ${MAX_STEPS} steps. Split it into more than one run.` };
  const steps: RunStep[] = [];
  for (const [i, s] of list.entries()) {
    const at = `Step ${i + 1}`;
    if (!isObj(s)) return { ok: false, reason: 'invalid', message: `${at} has to be { "command": "..." } or { "set": { ... } }.` };
    const kinds = ['command', 'set'].filter((k) => s[k] !== undefined);
    if (kinds.length !== 1) return { ok: false, reason: 'invalid', message: `${at} needs exactly one of "command" or "set".` };
    if (kinds[0] === 'command') {
      const id = s.command;
      if (typeof id !== 'string' || !id || id.length > 80) return { ok: false, reason: 'invalid', message: `${at}: "command" has to be a command id, like "edit.duplicate".` };
      if (!isRunnable(id)) return { ok: false, reason: 'refused', message: `${at}: the remote door can't press "${cleanLabel(id, 40)}". It reaches what a script reaches: files, exports, accounts, settings, Undo and the audience features are not on the list.` };
      steps.push({ command: id });
    } else {
      if (!isObj(s.set)) return { ok: false, reason: 'invalid', message: `${at}: "set" has to be an object like { "frame": 3 }.` };
      try {
        steps.push({ set: cleanAppSet(s.set) });
      } catch (e) {
        return { ok: false, reason: 'invalid', message: `${at}: ${e instanceof Error ? e.message : 'that could not be read.'}` };
      }
    }
  }
  return { ok: true, value: { steps, label: cleanLabel(raw.label) } };
}

export interface CleanScript {
  code: string;
  name: string;
}

/** `{ code: "...", name?: "Make a row" }`. */
export function cleanScript(raw: unknown): Cleaned<CleanScript> {
  if (!isObj(raw)) return { ok: false, reason: 'invalid', message: 'Send { "code": "await frameling.app.run(\'view.fit\')" }.' };
  if (typeof raw.code !== 'string' || !raw.code.trim()) return { ok: false, reason: 'invalid', message: '"code" has to be the text of a script.' };
  if (raw.code.length > LIMITS.code) return { ok: false, reason: 'invalid', message: `A script can be at most ${LIMITS.code.toLocaleString('en')} characters.` };
  return { ok: true, value: { code: raw.code, name: cleanLabel(raw.name, 40) || 'Remote script' } };
}

/** What is in the way, as the page sees it. */
export interface BusyInput {
  /** A pointer button is down on the page: someone is part way through a stroke or a drag. */
  pointerDown: boolean;
  /** A dialog, the palette, Preferences or Help is open. */
  dialogOpen: boolean;
  /** A script from the Scripts panel (or an earlier remote one) is running. */
  scriptRunning: boolean;
  /** Another remote run is part way through. */
  runInProgress: boolean;
}

export interface Busy {
  detail: 'stroke' | 'dialog' | 'script' | 'another-request';
  message: string;
}

/**
 * Why a request that changes the drawing must wait, or null when it may go ahead. A request is refused, never queued: the
 * caller knows what it was waiting for, a queue would make it run later against a drawing that has moved on, and a person
 * mid-stroke would have their pen interrupted. The caller gets the reason and is told to try again.
 */
export function busyReason(b: BusyInput): Busy | null {
  if (b.runInProgress) return { detail: 'another-request', message: 'Another request is still running. Wait for it to finish, then try again.' };
  if (b.scriptRunning) return { detail: 'script', message: 'A script is running. Wait for it to finish, then try again.' };
  if (b.pointerDown) return { detail: 'stroke', message: 'Someone is drawing right now, so Frameling will not change the picture under their pen. Try again in a moment.' };
  if (b.dialogOpen) return { detail: 'dialog', message: 'A dialog is open in Frameling. Close it (or ask the person to), then try again.' };
  return null;
}

/** How long a caller is told to wait before asking again. */
export const RETRY_MS = 1000;

export interface DocLike {
  width: number;
  height: number;
  fps: number;
  length: number;
  layers: { id: string; name: string; kind: string; visible: boolean; cels: { start: number; length: number; drawingId: string }[] }[];
  drawings: Record<string, { kind: string; shapes?: unknown[] }>;
}

/**
 * What a caller learns about the open drawing: its size and what is in it, with counts for shapes. No picture data, no name
 * and no file path: it is a summary to check what a run did, not a copy of the drawing (a script can read that).
 */
export function summarize(doc: DocLike) {
  return {
    width: doc.width,
    height: doc.height,
    fps: doc.fps,
    frames: doc.length,
    layers: doc.layers.map((l) => ({
      id: l.id,
      name: cleanLabel(l.name, 80),
      kind: l.kind,
      visible: l.visible,
      cels: l.cels.length,
      shapes: l.cels.reduce((n, c) => n + (doc.drawings[c.drawingId]?.shapes?.length ?? 0), 0),
    })),
  };
}

/** One line for the log: what a run did, in plain words, from what was cleaned (never from what was sent). */
export function describeRun(steps: RunStep[], labelOf: (id: string) => string | undefined): string {
  const cmds = steps.flatMap((s) => ('command' in s ? [s.command] : []));
  const sets = steps.length - cmds.length;
  const name = (id: string) => labelOf(id) ?? id;
  if (steps.length === 1 && cmds.length === 1) return `Pressed ${name(cmds[0])}`;
  if (steps.length === 1) return 'Chose the frame, layer, selection or colour';
  const bits: string[] = [];
  if (cmds.length) bits.push(cmds.length <= 3 ? cmds.map(name).join(', then ') : `${cmds.length} commands`);
  if (sets) bits.push(`${sets} ${sets === 1 ? 'choice' : 'choices'}`);
  return `Ran ${steps.length} steps: ${bits.join(' and ')}`;
}
