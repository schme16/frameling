// Lip sync: guess mouths from a sound, write them on a mouth layer, fix them by hand. The first built-in feature
// that can be turned off (Preferences > Features); the descriptor says everything it registers.
import { lazyPanel } from '../core/lazy';
import { defineFeature } from '../features/feature';
import { lipsyncCommands } from './commands';
import { lipsyncHelp } from './help';

export const lipsyncFeature = defineFeature({
  id: 'lipsync',
  name: 'Lip sync',
  about: 'Matches a character\'s mouth to a voice recording, then lets you fix any mouth by hand.',
  optional: true,
  requires: ['audio'],
  commands: lipsyncCommands,
  panels: [{ id: 'lipsync', title: 'Lip sync', icon: 'mouth', component: lazyPanel(() => import('./LipSyncPanel').then((m) => m.LipSyncPanel)), zone: 'right', order: 70, help: 'lip-sync' }],
  help: lipsyncHelp,
  templates: ['lip-sync'],
  menus: [{ menu: 'Animate', items: ['-', 'lipsync.auto', 'lipsync.autoWords', 'lipsync.nameFrames'] }],
  sections: {
    lipsync: { blurb: 'Match mouth shapes to a voice recording.', group: 'animate', keywords: ['mouth', 'voice', 'talking', 'phonemes'] },
  },
  usedBy: (doc) => !!doc.ext?.lipsync,
});
