// The stream overlay: a page OBS adds as a browser source, with a see-through background, that shows what your viewers
// should see on top of your drawing (Quill reacting, the dare that is running, the prompt you pulled, a vote) and
// nothing else. The server side is the actions door's own server, on its own path with its own rules
// (src/main/overlayHandler.ts); this side feeds it. A feature you can turn off (Preferences > Features); off, there is no
// overlay, command or help, and the address answers as if it were not there.
import { defineFeature } from '../features/feature';
import { overlayChoices } from './choices';
import { streamOverlayCommands, streamOverlayMenuItems } from './commands';
import { streamOverlayHelp } from './help';
import { overlayLink } from './instance';

export const streamOverlayFeature = defineFeature({
  id: 'stream-overlay',
  name: 'Stream overlay',
  about: 'A page for OBS with a see-through background that shows Quill, the running dare and the prompt you pulled to your viewers, and nothing else. Needs the actions door.',
  optional: true,
  requires: ['stream-door'],
  commands: streamOverlayCommands,
  help: streamOverlayHelp,
  choices: overlayChoices,
  menus: [{ menu: 'sub:streamoverlay', items: streamOverlayMenuItems }],
  activate: () => overlayLink.start(),
  deactivate: () => overlayLink.stop(),
});

export { StreamOverlayPrefsRow } from './PrefsRow';
export { fromVoteView, overlayVote } from './sources';
