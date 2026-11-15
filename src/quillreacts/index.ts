// Quill reacts to the audience: cheer, hop, a snack, a cuddle, a wave, and a sign you say yes to. Everything goes through
// the audience gate (src/audience), so the switch, the cooldowns, the queue and Stop apply to it, and the actions door
// (src/streamdoor) lists it with nothing more to do. A feature you can turn off (Preferences > Features); off, there
// are no actions, commands or help, and Quill is just Quill.
import { defineFeature } from '../features/feature';
import { registerReactionActions } from './actions';
import { reactChoices } from './choices';
import { quillReactCommands, quillReactMenuItems } from './commands';
import { quillReactHelp } from './help';

export const quillReactsFeature = defineFeature({
  id: 'quill-reacts',
  name: 'Quill reacts to chat',
  about: 'Lets chat make Quill cheer, hop, eat a snack, take a cuddle, wave or hold up a sign you have said yes to. Needs the actions door, and only while audience features are on.',
  optional: true,
  requires: ['stream-door'],
  commands: quillReactCommands,
  help: quillReactHelp,
  choices: reactChoices,
  menus: [{ menu: 'sub:audience', items: quillReactMenuItems }],
  activate: registerReactionActions,
});

export { REACTION_ACTIONS, SIGN_ACTION } from './actions';
export { cleanSign, SIGN_MAX } from './sign';
