// Edit in Frameling: open the drawing inside an Interactives package, and save it back there. A feature that can be
// turned off (Preferences > Features). Its export sits with the other exports in the dialog, and goes away with the feature.
import type { Command, HelpTopic } from '../core/registry';
import { openExportDialog } from '../export/open';
import { defineFeature } from '../features/feature';
import { interactivesEnabled } from '../features/flags';
import { interactivesExporter } from './exporter';
import { currentLink, interactivesChoices, isPlayablePath, openPlayable, registerRoundTrip, toggleUpdate, updatePlayable } from './roundtrip';

const commands: Command[] = [
  {
    id: 'file.exportInteractives',
    label: 'Export for Interactives...',
    category: 'File',
    description: 'Make one file to drop onto an Interactives page, with your clips and markers in it.',
    help: 'export-interactives',
    keywords: ['interactives', 'flplay', 'package', 'playable', 'web', 'course', 'layer'],
    global: true,
    run: () => openExportDialog('interactives'),
  },
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
    id: 'export-interactives',
    title: 'Using animations in Interactives',
    section: 'Exporting',
    media: 'export-interactives.png',
    summary: 'Make one file to drop onto an Interactives page, then play your clips with clicks, timelines and scripts.',
    keywords: ['interactives', 'flplay', 'package', 'playable', 'course', 'web', 'layer', 'clips', 'markers', 'atlas'],
  },
  {
    id: 'edit-in-frameling',
    title: 'Edit in Frameling (Interactives round trip)',
    section: 'Exporting',
    summary: 'Open an Interactives file (.flplay) to change its drawing, and Save puts the changes straight back into it.',
    keywords: ['interactives', 'flplay', 'round trip', 'edit in frameling', 'update', 'sync', 'package'],
    media: 'edit-in-frameling.png',
  },
];

export const interactivesFeature = defineFeature({
  id: 'interactives',
  name: 'Interactives',
  about: 'Export for Interactives (.flplay), open one to change the drawing inside it, and save your changes back into it.',
  optional: true,
  // Off for everyone for now: see flag.ts. Hidden means nothing is registered or listed, and the code stays.
  hidden: () => !interactivesEnabled(),
  commands,
  help,
  exporters: [interactivesExporter],
  choices: interactivesChoices,
  opens: isPlayablePath,
  // A drawing that came out of an Interactives file carries a small marker (see export/run.ts).
  usedBy: (doc) => !!doc.ext?.interactives,
  activate: registerRoundTrip,
});
