// The global keyboard dispatcher: one keydown listener that turns shortcuts into commands.
//
// Rules: typing in a text field never fires a command unless the command is `global`. While a big overlay is open
// only `global` commands work. A held Space is the canvas's pan key, so nothing fires while it's down.
import { allCommands, type Command } from '../core/registry';
import { syncDynamicCommands } from './dynamic';
import { activeOverrides, buildKeymap, comboFromEvent, comboToString } from './keys';
import { anyOverlayOpen } from './overlays';
import { commandEnabled, runCommand } from './palette';
import { getPrefs } from './prefs';
import { playCue } from './sounds';

let spaceHeld = false;
let capturing = 0;
let cache: { count: number; keymap: Record<string, string[]>; map: Map<string, Command[]> } | null = null;

export const isSpaceHeld = () => spaceHeld;

/** The shortcut recorder in Preferences calls this while it waits for a key, so the dispatcher stays quiet. */
export function holdKeyboard(): () => void {
  capturing++;
  return () => void (capturing = Math.max(0, capturing - 1));
}

/** Current shortcut -> commands map (built lazily, rebuilt when commands or the person's choices change). */
export function currentKeymap(): Map<string, Command[]> {
  syncDynamicCommands();
  const cmds = allCommands();
  const keymap = activeOverrides();
  if (!cache || cache.count !== cmds.length || cache.keymap !== keymap) cache = { count: cmds.length, keymap, map: buildKeymap(cmds, keymap) };
  return cache.map;
}

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/i.test((t as HTMLInputElement).type);
  return false;
}

function keyboardFocused(t: HTMLElement): boolean {
  try {
    return t.matches(':focus-visible');
  } catch {
    return document.activeElement === t;
  }
}

const PRESSABLE_ROLES = /^(button|tab|menuitem|menuitemcheckbox|menuitemradio|option|radio|checkbox|switch|link|treeitem)$/;
const MOVING_ROLES = /^(slider|spinbutton|tab|radio|option|menuitem|menuitemcheckbox|menuitemradio|treeitem|separator)$/;
const MOVE_KEYS = /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/;

/**
 * True when the focused control needs this key itself: Enter on a button presses the button (not Play), and the
 * arrows on a slider, tab or list move it (not the selection on the canvas). Keys with Ctrl/Cmd or Alt always go to
 * the shortcuts.
 */
export function controlWantsKey(t: EventTarget | null, e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (!(t instanceof HTMLElement) || e.ctrlKey || e.metaKey || e.altKey) return false;
  const role = t.getAttribute('role') ?? '';
  const tag = t.tagName;
  if (e.key === 'Enter') {
    // Only when it was reached with the keyboard: after clicking a tool with the mouse, Enter still means Play.
    if (!keyboardFocused(t)) return false;
    if (tag === 'BUTTON' || tag === 'SUMMARY' || (tag === 'A' && t.hasAttribute('href'))) return true;
    if (tag === 'INPUT' && /^(button|submit|reset|checkbox|radio|color|file|image)$/i.test((t as HTMLInputElement).type)) return true;
    return PRESSABLE_ROLES.test(role);
  }
  if (MOVE_KEYS.test(e.key)) {
    if (tag === 'INPUT' && /^(range|radio)$/i.test((t as HTMLInputElement).type)) return true;
    return MOVING_ROLES.test(role);
  }
  return false;
}

/** Handles one keydown. Returns true when a command took it. */
export function dispatchKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.isComposing || capturing) return false;
  if (e.key === ' ') {
    spaceHeld = true;
    return false;
  }
  if (spaceHeld) return false;
  const combo = comboFromEvent(e);
  if (!combo) return false;
  const found = currentKeymap().get(comboToString(combo));
  if (!found) return false;
  if (controlWantsKey(e.target, e)) return false;
  const typing = isTypingTarget(e.target);
  const overlay = anyOverlayOpen();
  const candidates = found.filter((c) => (c.global || (!typing && !overlay)));
  // Only a command that can run right now takes the key. Otherwise the next binding, or the browser, gets it
  // (arrow-key nudges must not swallow arrows when nothing is selected).
  const cmd = candidates.find(commandEnabled);
  if (!cmd) {
    // Undo with nothing left to undo: a soft bonk, so you know the key did land.
    if (candidates.some((c) => c.id === 'edit.undo')) playCue('nothingToUndo');
    return false;
  }
  e.preventDefault();
  runCommand(cmd);
  return true;
}

export function installKeyboard(): () => void {
  const down = (e: KeyboardEvent) => void dispatchKey(e);
  const up = (e: KeyboardEvent) => {
    if (e.key === ' ') spaceHeld = false;
  };
  const blur = () => void (spaceHeld = false);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}

/** For tests. */
export function resetKeyboard(): void {
  spaceHeld = false;
  capturing = 0;
  cache = null;
}
