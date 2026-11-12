// Text shapes: the Text tool, typing on the canvas, the Text panel, text animations and Convert to shapes. A feature that
// can be turned off (Preferences > Features). The shape kind (draw, hit, export, file reading) is registered for good by
// kind.ts, so a drawing that holds text still draws, exports and saves with the feature off; what goes is the tool, the
// panel, editing on the canvas and the commands.
import { lazyPanel } from '../core/lazy';
import { store } from '../core/store';
import { defineFeature } from '../features/feature';
import { picked } from '../ui/panelInfo';
import './kind';
import { textCommands } from './commands';
import { preloadFonts } from './fonts';
import { textHelp } from './help';
import { textTool } from './tool';

// Text in a drawing needs its fonts whether or not the feature is on.
preloadFonts(() => store().setUi({}));

export const textFeature = defineFeature({
  id: 'text',
  name: 'Text',
  about: 'Words on your drawing that stay editable and can be animated.',
  optional: true,
  commands: textCommands,
  panels: [{ id: 'text', title: 'Text', icon: 'text', component: lazyPanel(() => import('./TextPanel').then((m) => m.TextPanel)), zone: 'right', order: 37, help: 'text' }],
  tools: [textTool],
  help: textHelp,
  templates: ['title-card', 'loading-spinner'],
  sections: {
    text: {
      blurb: 'Font, size, alignment and text animations for the selected text.',
      group: 'properties',
      section: true,
      selection: true,
      relevant: (s) => s.ui.tool === 'text' || picked(s).some((x) => x.type === 'text'),
      idle: 'Pick the Text tool or select text',
      keywords: ['font', 'type', 'words', 'typewriter'],
    },
  },
  usedBy: (doc) => Object.values(doc.drawings).some((d) => d.kind === 'vector' && d.shapes.some((s) => s.type === 'text')),
});
