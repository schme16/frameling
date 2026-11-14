// The Interactives export card. Only the card and its rules are here; the file is made by export/formats/interactives.ts
// when it is used, and the options load with the dialog.
import type { ExporterDef } from '../export/registry';
import { clipsTooLong, MAX_BAKED } from '../export/playableClips';

export const interactivesExporter: ExporterDef = {
  info: { id: 'interactives', title: 'Interactives', tag: '.flplay', goodFor: 'Drop it into an Interactives page, then play it with clicks, timelines and scripts.', icon: 'play', ext: 'flplay', animated: true, alpha: true },
  popular: 5,
  docNotes: (doc, range) =>
    clipsTooLong(doc, range).map((c) => `The clip "${c.name}" plays ${c.how}, which comes to ${c.frames.toLocaleString('en')} frames, more than the ${MAX_BAKED.toLocaleString('en')} Interactives can hold written out. It stays forward in the package.`),
  fileKind: () => ({ name: 'Interactives package' }),
  carry: {
    summary: 'Everything looks exactly as it does on the canvas: each frame is a finished picture. Clips, markers and the clip flow come along for Interactives to play.',
    help: 'export-interactives',
  },
  // Sprites for games nearly always want a see-through background, and Interactives scales pixel art up itself, crisply,
  // so the art's own size keeps the file small.
  picked: (prev, { art }) => (prev.format !== 'interactives' ? { transparent: true, ...(art ? { scale: art } : {}) } : {}),
  opened: ({ art }) => ({ transparent: true, ...(art ? { scale: art } : {}) }),
  ui: () => import('./ExportOptions').then((m) => ({ Before: m.InteractivesOptions })),
  load: () => import('../export/formats/interactives'),
};
