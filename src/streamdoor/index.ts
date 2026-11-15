// The actions door: a little server on this computer that Streamer.bot, Firebot, a Stream Deck or a script can call to
// make a short list of safe things happen. It is one AudienceDoorDef on the audience gate (src/audience), so the gate
// opens it with the master switch and shuts it on Stop. A feature you can turn off (Preferences > Streaming); off, there
// is no server, no action, no command and no row. The server is in the desktop side: src/main/actionsDoor.ts.
import { registerAudienceDoor } from '../audience';
import { defineFeature } from '../features/feature';
import { registerDoorActions } from './actions';
import { doorChoices } from './choices';
import { streamDoorCommands } from './commands';
import { streamDoorHelp } from './help';
import { doorLink } from './instance';

let stopListening: (() => void) | null = null;

export const streamDoorFeature = defineFeature({
  id: 'stream-door',
  name: 'Actions door',
  about: 'Lets Streamer.bot, Firebot or a Stream Deck ask Frameling for a few safe things, like showing a message. Only from this computer.',
  optional: true,
  commands: streamDoorCommands,
  help: streamDoorHelp,
  choices: doorChoices,
  menus: [{ menu: 'sub:streamdoor', items: ['streamdoor.settings', 'streamdoor.copyAddress', 'streamdoor.copyKey', 'streamdoor.roll'] }],
  activate: () => {
    registerAudienceDoor({ id: 'door.local', label: 'Local actions', open: () => doorLink.open(), close: () => doorLink.close() });
    registerDoorActions();
    stopListening = doorLink.listen();
  },
  deactivate: () => {
    stopListening?.();
    stopListening = null;
  },
});

export { StreamDoorPrefsRow } from './PrefsRow';
