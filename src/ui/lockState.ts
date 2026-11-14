// The lock, live: is the tool rail or the panels locked now, saying no when something is refused, and Quill's one
// gentle word the first time something moves by accident. The pure parts (what a lock is, the words) are in dockLock.ts.
import { dock, locksOf, setLock } from './dock';
import { isLockedIn, lockedReason, looksAccidental, type Doing, type LockKind } from './dockLock';
import { line } from './mascot/lines';
import { getPrefs } from './prefs';
import { readRaw, writeJson } from './mini';
import { toast } from './toast';
import { inHarness } from '../pixel/harness';

export const isLocked = (kind: LockKind): boolean => isLockedIn(locksOf(dock.get()), kind);

/** Nothing about the tool rail moves, resizes or is rearranged while this says so. */
export const railLocked = (): boolean => isLocked('tools');
/** Nothing about the panels and windows moves, resizes or is rearranged while this says so. */
export const panelsLocked = (): boolean => isLocked('panels');

let told = { key: '', at: 0 };
const REPEAT_MS = 2500;

/** Unlocks from a message's button. Closing the Change the tools panel when locking is in toolRail.ts (setRailLock). */
function unlock(kind: LockKind): void {
  setLock(kind, false);
  toast(kind === 'tools' ? 'The tools are unlocked.' : 'The panels are unlocked.', { duration: 1800, quill: null });
}

/**
 * Says why something was refused, with an Unlock button. The same refusal twice in a moment (a drag keeps trying) is
 * said once.
 */
export function refuse(kind: LockKind, doing: Doing): void {
  const key = `${kind}.${doing}`;
  const now = Date.now();
  if (told.key === key && now - told.at < REPEAT_MS) return;
  told = { key, at: now };
  toast(lockedReason(kind, doing), { kind: 'info', quill: null, sound: null, action: { label: 'Unlock', run: () => unlock(kind), id: 'unlock' } });
}

/** For tests: forget what was just said, so the same refusal is said again. */
export const forgetRefusals = (): void => void (told = { key: '', at: 0 });

/** True, after saying why, when the kind is locked. Put it at the top of anything that would move or change. */
export function refuseIfLocked(kind: LockKind, doing: Doing): boolean {
  if (!isLocked(kind)) return false;
  refuse(kind, doing);
  return true;
}

/** How the last pointer drag went, for telling a slip from a decision. Set by the dock's drag runner. */
export const lastDrag = { ms: 0, px: 0 };

const TAUGHT_KEY = 'frameling.lockTaught.v1';

/**
 * The first time something is moved and it looks like a slip, Quill says the rail or the panels can be locked, with a
 * button that does it. Once ever. Quiet while Quill is off, so turning him back on brings it back.
 */
export function teachLock(kind: LockKind, lock: () => void): boolean {
  if (isLocked(kind) || !looksAccidental(lastDrag)) return false;
  if (!getPrefs().showQuill || inHarness() || readRaw<unknown>(TAUGHT_KEY, null)) return false;
  writeJson(TAUGHT_KEY, 'told');
  toast(line('lock.teach', { what: kind }), {
    kind: 'info',
    quill: 'think',
    duration: 9000,
    action: {
      label: 'Lock it',
      id: 'lock-it',
      run: () => {
        lock();
        toast(kind === 'tools' ? "Locked. Unlock the tools any time from the rail's right-click menu." : "Locked. Unlock the panels any time from a panel's right-click menu.", { duration: 3500, quill: null });
      },
    },
  });
  return true;
}
