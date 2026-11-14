// Commands and help for the sounds and the shortcut sets (both live in Preferences).
import { registerCommands, registerHelpTopics } from '../../core/registry';
import { KEYMAP_SETS, keymapSet } from '../keymapSets';
import { getPrefs, setPrefs } from '../prefs';
import { toast } from '../toast';
import { previewCue } from '.';

registerCommands([
  {
    id: 'view.toggleSounds',
    label: 'Sounds on or off',
    category: 'View',
    description: 'Soft little sounds for quest steps, finished exports and "no".',
    help: 'sounds',
    keywords: ['sound', 'audio', 'chime', 'beep', 'mute', 'quiet', 'noise', 'effects'],
    checked: () => getPrefs().sounds,
    run: () => {
      const on = !getPrefs().sounds;
      setPrefs({ sounds: on });
      if (on) previewCue('step');
      toast(on ? 'Sounds are on.' : 'Sounds are off.', { kind: 'info' });
    },
  },
  ...KEYMAP_SETS.map((s) => ({
    id: `keys.set.${s.id}`,
    label: `Shortcut set: ${s.label}`,
    category: 'Help',
    description: s.blurb,
    help: 'shortcut-sets',
    keywords: ['keys', 'keymap', 'shortcuts', 'hotkeys', 'flash', 'animate', 'aseprite', 'pixel', 'familiar'],
    checked: () => keymapSet(getPrefs().keymapSet).id === s.id,
    run: () => {
      setPrefs({ keymapSet: s.id });
      toast(`Now using ${s.label} shortcuts.${Object.keys(getPrefs().keymap).length ? ' Your own changes are kept.' : ''}`, { kind: 'success' });
    },
  })),
]);

registerHelpTopics([
  {
    id: 'sounds',
    title: 'Sounds',
    section: 'Settings',
    media: 'sounds.png',
    summary: 'Soft little sounds that tell you something happened. On to start with; easy to switch off.',
    keywords: ['sound', 'audio', 'chime', 'beep', 'mute', 'quiet', 'volume', 'noise', 'effects'],
  },
  {
    id: 'shortcut-sets',
    title: 'Keys from other tools (shortcut sets)',
    section: 'Settings',
    media: 'shortcut-sets.png',
    summary: 'Use the keys you already know: Frameling, familiar from Flash / Animate, or Aseprite keys.',
    keywords: ['keys', 'keymap', 'shortcuts', 'hotkeys', 'flash', 'animate', 'aseprite', 'pixel', 'familiar', 'set', 'preset'],
  },
]);
