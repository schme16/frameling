// Edit in Frameling: open the drawing inside an Interactives package, and save it back there. A feature that can be
// turned off (Preferences > Features). Exporting for Interactives stays with the other exports.
import type { Command, HelpTopic } from '../core/registry';
import { defineFeature } from '../features/feature';
import { currentLink, interactivesChoices, isPlayablePath, openPlayable, registerRoundTrip, toggleUpdate, updatePlayable } from './roundtrip';

const commands: Command[] = [
  {
    id: 'file.openPlayable',
    label: 'Open Interactives file...',
    category: 'File',
    description: 'Edit the drawing inside a .flplay from Interactives. Saving puts your changes back.',
    help: 'edit-in-frameling',
    keywords: ['interactives', 'flplay', 'edit in frameling', 'round trip', 'package', 'open'],
    run: () => void openPlayable(),
  },
  {
    id: 'file.toggleUpdatePlayable',
    label: 'Update the Interactives file when saving',
    category: 'File',
    description: 'Saving also puts your changes into the .flplay this drawing came from.',
    help: 'edit-in-frameling',
    keywords: ['interactives', 'flplay', 'sync', 'round trip'],
    enabled: (s) => !!s.doc && !!currentLink(),
    checked: () => !!currentLink()?.update,
    run: () => toggleUpdate(),
  },
  {
    id: 'file.updatePlayableNow',
    label: 'Update the Interactives file now',
    // Palette only: the File menu has the toggle, which is what most people need.
    category: 'Interactives',
    description: 'Put the drawing as it is now into the .flplay it came from, without saving anything else.',
    help: 'edit-in-frameling',
    keywords: ['interactives', 'flplay', 'sync', 'refresh'],
    enabled: () => !!currentLink(),
    run: async () => {
      const l = currentLink();
      if (l) await updatePlayable(l);
    },
  },
];

const help: HelpTopic[] = [
  {
    id: 'edit-in-frameling',
    title: 'Edit in Frameling (Interactives round trip)',
    section: 'Exporting',
    summary: 'Open an Interactives file (.flplay) to change its drawing, and Save puts the changes straight back into it.',
    keywords: ['interactives', 'flplay', 'round trip', 'edit in frameling', 'update', 'sync', 'package'],
    media: 'edit-in-frameling.png',
    body: `When you export for Interactives with **Include the editable drawing** ticked (it's on unless you turn it off), the **.flplay** file carries your Frameling drawing inside it. So you can always come back and change it.

## Change an animation that's already in Interactives

1. Choose **File > Open Interactives file...** and pick the .flplay. (In the desktop app you can also double-click a .flplay file.)
2. Frameling opens the drawing that's inside it.
3. Draw, re-time, add frames: anything you like.
4. Press **Save** (Ctrl+S). Frameling puts your changes back into the same .flplay, at the same size as before.

The first time you save, Frameling asks whether to **just update the Interactives file** or **also keep a .frameling file**. Either is fine; the drawing is safe inside the .flplay. You can change your answer in **Preferences > Behaviour**.

## Turn the updating off

**File > Update the Interactives file when saving** is ticked for drawings that came from a .flplay. Untick it to work on a copy without touching the Interactives file; Frameling remembers this for each drawing. **File > Update the Interactives file now** puts the changes in without saving anything else.

## If there's nothing to edit

A .flplay exported without the editable drawing only has the finished pictures, so Frameling can't open it for editing. Export it again from the original drawing with **Include the editable drawing** ticked.

## From Interactives

Other apps on your computer can ask Frameling to open a file with a **frameling://open?path=...** link (the desktop app sets this up when it's installed). That's how an "Edit in Frameling" button in Interactives can work.`,
  },
];

export const interactivesFeature = defineFeature({
  id: 'interactives',
  name: 'Interactives',
  about: 'Open an Interactives file (.flplay) to change the drawing inside it, and save your changes back into it.',
  optional: true,
  commands,
  help,
  choices: interactivesChoices,
  opens: isPlayablePath,
  // A drawing that came out of an Interactives file carries a small marker (see export/run.ts).
  usedBy: (doc) => !!doc.ext?.interactives,
  activate: registerRoundTrip,
});
