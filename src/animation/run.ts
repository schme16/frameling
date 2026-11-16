// Runs a command by id, the way a click would. Kept apart so panels and buttons here do not reach into the palette.
import { getCommand } from '../core/registry';
import { runCommand } from '../ui/palette';

export function runCommandById(id: string): boolean {
  const c = getCommand(id);
  return c ? runCommand(c) : false;
}
