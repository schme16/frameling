// The command: open or close Stream control. It is only there while a streaming feature
// is on, like the audience commands, so somebody who never streams does not see them.
import { registerCommands, registerHelpTopics, type Command } from '../core/registry';
import { currentChoice, withChoice } from '../core/choices';
import { removeOwned, withOwner } from '../core/owners';
import { addKeptOutHelp, onFeaturesChange } from '../features/host';
import { streamingOn } from '../features/streamFamily';
import { toast } from '../ui/toast';
import { TOP_CHOICE } from './choices';
import { streamboardHelp } from './help';
import { isBoardOpen, stopBoard, subscribeBoard } from './link';
import { store } from '../core/store';

const OWNER = 'streamboard';
const HELP = 'stream-control';
const bridge = () => window.frameling?.streamboard;

// A menu tick is read from the command, so tell the menus when the board comes or goes.
subscribeBoard(() => store().setUi({}));

/** Opens Stream control (asking the first time whether it stays on top), or brings it forward. */
export function openBoard(): void {
  const api = bridge();
  if (!api) {
    toast('Stream control needs the Frameling desktop app.', { kind: 'info' });
    return;
  }
  withChoice(TOP_CHOICE, () => void api.open(currentChoice(TOP_CHOICE) === 'top'));
}

export function closeBoard(): void {
  void bridge()?.close();
  stopBoard();
}

export const boardCommands: Command[] = [
  {
    id: 'streamboard.toggle',
    label: 'Stream control',
    category: 'Audience',
    keys: ['Mod+Alt+I'],
    description: 'A window of big buttons for your second screen: start a vote, pull a prompt, switch audience participation on or off, and stop everything. It works while you keep drawing. Press Arrange in it to move the buttons.',
    help: HELP,
    keywords: ['stream control', 'streamer tools', 'buttons', 'board', 'second screen', 'second monitor', 'other screen', 'control panel', 'vote', 'guess', 'prompt', 'obs', 'popout', 'pop out', 'window', 'stream', 'streamer', 'live', 'twitch', 'arrange buttons', 'move buttons'],
    global: true,
    checked: isBoardOpen,
    enabled: () => !!bridge(),
    reason: () => 'Stream control needs the Frameling desktop app.',
    run: () => (isBoardOpen() ? closeBoard() : openBoard()),
  },
];

let shown = false;
addKeptOutHelp(() => (shown ? [] : streamboardHelp));

/** Puts the commands and their help in while any streaming feature is on, and takes them out (and closes the board) while all are tucked away. */
export function syncBoardCommands(): void {
  const want = streamingOn();
  if (want === shown) return;
  shown = want;
  if (want) {
    withOwner(OWNER, () => {
      registerCommands(boardCommands);
      registerHelpTopics(streamboardHelp);
    });
  } else {
    removeOwned(OWNER);
    if (isBoardOpen()) closeBoard();
  }
}

export function installBoardCommands(): void {
  syncBoardCommands();
  onFeaturesChange(syncBoardCommands);
}
