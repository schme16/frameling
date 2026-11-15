// Connect Twitch: sign in with a short code, hear about channel point rewards, cheers, follows, subs and raids, and let
// the streamer choose which action each one makes happen. It is one AudienceDoorDef on the audience gate (src/audience),
// so the gate opens it with the master switch and shuts it on Stop, and every event it hears goes through the gate like
// any other. A feature you can turn off (Preferences > Features); off, there is no door, no command and no row. The
// connection and the sign-in live in the desktop side: src/main/twitch*.ts.
import { registerAudienceDoor } from '../audience';
import { defineFeature } from '../features/feature';
import { watchTwitch } from './actions';
import { twitchChoices } from './choices';
import { twitchCommands } from './commands';
import { twitchHelp } from './help';
import { twitchLink } from './instance';

let stops: (() => void)[] = [];

export const twitchFeature = defineFeature({
  id: 'stream-twitch',
  name: 'Connect Twitch',
  about: 'Signs in to Twitch with a short code, so channel point rewards, cheers, follows, subs and raids can make Quill and your audience tools react. No other program needed.',
  optional: true,
  commands: twitchCommands,
  help: twitchHelp,
  choices: twitchChoices,
  menus: [{ menu: 'sub:twitch', items: ['twitch.connect', 'twitch.cancel', 'twitch.disconnect', 'twitch.links'] }],
  activate: () => {
    registerAudienceDoor({ id: 'door.twitch', label: 'Twitch', open: () => twitchLink.open(), close: () => twitchLink.close() });
    stops = [twitchLink.listen(), watchTwitch()];
  },
  deactivate: () => {
    for (const s of stops) s();
    stops = [];
    twitchLink.close();
  },
});

export { TwitchPrefsRow } from './PrefsRow';
