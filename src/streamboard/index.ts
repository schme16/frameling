// Stream control: a window of big buttons for a second screen, for the things somebody needs mid-stream. Every button is
// a face on a command that already exists, so the board cannot drift from the rest of the app as features are added. The
// pure parts are tiles.ts (what each button is), layout.ts (where they sit) and model.ts (what the board is told); the
// drawing window's end of the link is link.ts, and the board's own page is page.tsx (built apart, like the picture window).
import { registerStreamboardChoices } from './choices';
import { installBoardCommands, syncBoardCommands } from './commands';
import { installBoardLink } from './link';

export function installStreamboard(): void {
  registerStreamboardChoices();
  installBoardLink();
  installBoardCommands();
}

export { syncBoardCommands };
