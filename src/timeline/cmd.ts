/** Small bridge between buttons and the command registry, so a button and its shortcut can never drift apart. */
import { getCommand } from '../core/registry';
import { runCommand } from '../ui/palette';
import { shortcutLabel } from '../ui/keys';

/** Runs a registered command the way a click would. */
export function runCmd(id: string): void {
  const c = getCommand(id);
  if (c) runCommand(c);
}

/** A tooltip: the command's own words, with its shortcut in brackets. */
export function tip(id: string, text?: string): string {
  const c = getCommand(id);
  const keys = c ? shortcutLabel(c) : '';
  const base = text ?? c?.description ?? c?.label ?? '';
  return keys ? `${base} (${keys})` : base;
}

/** The shortcut for a menu hint. */
export function keyHint(id: string): string | undefined {
  const c = getCommand(id);
  return (c && shortcutLabel(c)) || undefined;
}
