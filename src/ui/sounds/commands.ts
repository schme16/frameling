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
    body: `Frameling can make a few soft sounds, so you hear that something happened without looking. They're **on** to start with, and quiet.

## Turn them off or on

Open **Preferences** (**Ctrl+,**), choose **General** and switch **Sounds** off or on. While they're on, a **Volume** slider shows, with a **Try** button that plays each sound once. Or use **View, Sounds on or off**.

## What you'll hear

- **A quest step done**: a little two-note ting.
- **A quest finished**: a happy rising chime with a sparkle.
- **An export finished**: a calm "done".
- **Can't do that**: two low soft notes, when a message says no or something went wrong.
- **Nothing left to undo**: a gentle wooden tock when you press **Ctrl+Z** with nothing to take back.
- **Frame step**: a tiny paper flick when you step with **,** and **.** (never while it's playing).
- **Quill's goodbye**: a little sad falling tune when you hide Quill.

## Calm and quiet

- Sounds never pile up: holding a key or a burst of messages plays one now and then, not a buzz.
- With **Reduce motion** on (or when your computer asks apps to be calm), the just-for-fun frame flick stays quiet. The sounds that tell you something still play.
- Every sound is made by Frameling itself, very short and quiet. Your animation's own [sound](help:sound) is separate and has its own volume.`,
  },
  {
    id: 'shortcut-sets',
    title: 'Keys from other tools (shortcut sets)',
    section: 'Settings',
    media: 'shortcut-sets.png',
    summary: 'Use the keys you already know: Frameling, familiar from Flash / Animate, or familiar from pixel tools.',
    keywords: ['keys', 'keymap', 'shortcuts', 'hotkeys', 'flash', 'animate', 'aseprite', 'pixel', 'familiar', 'set', 'preset'],
    body: `Coming from another tool? Pick a shortcut set and your fingers already know the way.

## Pick one

Open **Preferences** (**Ctrl+,**), choose **Keyboard**, and pick a **Shortcut set** at the top. Or find "Shortcut set" in the [command palette](help:command-palette).

- **Frameling**: the keys Frameling starts with. Good if you're new to animation tools.
- **Familiar from Flash / Animate**: **F5** adds a frame, **F6** a new drawing that copies this one, **F7** an empty one, **Shift+F5** removes a frame. **Ctrl+E** draws inside a symbol. Tools: **Y** pencil, **N** line, **K** paint bucket, **L** lasso, **M** bone. **Ctrl+J** is canvas size, and **Ctrl+Up** and **Ctrl+Down** move things forward and back.
- **Familiar from pixel tools (Aseprite-like)**: **B** pencil, **U** rectangle, **Shift+U** ellipse, **M** select, **Q** lasso. **X** swaps the colours. **Alt+N** adds a frame (a copy), **Alt+C** removes one, **F3** shows the onion skin. **Shift+N** adds a pixel layer, **Ctrl+D** deselects.

## Your own changes stay

Anything you changed yourself sits on top of the set, so switching sets never loses it. **Reset all** takes you back to the set's keys. A key the set gives to one command is taken off whatever had it before, so nothing clashes.

See [Keyboard shortcuts](help:keyboard-shortcuts) to change any single key.`,
  },
]);
