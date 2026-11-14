// The formats that are part of Frameling itself. Only the cards and rules are here: making each file, and the
// options it shows in the dialog, are loaded when they are used (formats/ and options/). Formats that belong to a
// feature (Interactives) are registered by that feature.
import { repairLottieSettings } from './lottie-choices';
import { registerExporter, type ExporterDef } from './registry';
import type { ExportSettings } from './types';

const PICTURES = 'Everything looks exactly as it does on the canvas: each frame is a finished picture.';
const VIDEO_HELP = 'export-video-gif-apng';

const video = (format: 'mp4' | 'webm') => ({
  prepare: (plan: Parameters<NonNullable<ExporterDef['prepare']>>[0], s: ExportSettings) => import('./formats/video-prep').then((m) => m.prepareVideo(plan, s)),
  support: (size: { width: number; height: number }) => import('./formats/video-prep').then((m) => m.videoSupport(format, size)),
  load: () => import('./formats/video'),
});

const defs: ExporterDef[] = [
  {
    info: { id: 'mp4', title: 'MP4 video', tag: 'H.264', goodFor: 'Sharing and social media. Plays nearly everywhere.', icon: 'film', ext: 'mp4', animated: true, alpha: false },
    popular: 2,
    video: true,
    baked: true,
    carry: { summary: PICTURES, help: VIDEO_HELP },
    noAlphaWhy: "MP4 videos can't be see-through. Try WebM, GIF or PNG.",
    settle: (doc, s) => import('./formats/video-prep').then((m) => m.settleMp4Sound(doc, s)),
    picked: (prev) => (prev.range === 'frame' ? { range: 'all' } : {}),
    ...video('mp4'),
  },
  {
    info: { id: 'webm', title: 'WebM video', tag: 'AV1', goodFor: 'The web, and videos with a see-through background.', icon: 'film', ext: 'webm', animated: true, alpha: true },
    video: true,
    baked: true,
    carry: { summary: PICTURES, help: VIDEO_HELP },
    noAlphaWhy: "This computer can't make see-through WebM. Try GIF, APNG or PNG sequence.",
    picked: (prev) => (prev.range === 'frame' ? { range: 'all' } : {}),
    ui: () => import('./options/video').then((m) => ({ After: m.WebmOptions })),
    ...video('webm'),
  },
  {
    info: { id: 'gif', title: 'Animated GIF', tag: 'GIF', goodFor: 'Chats, forums and anywhere a video will not play.', icon: 'image', ext: 'gif', animated: true, alpha: true },
    popular: 1,
    baked: true,
    loops: true,
    carry: { summary: PICTURES + ' GIF has only 256 colours and hard see-through edges.', help: VIDEO_HELP },
    ui: () => import('./options/playback').then((m) => ({ After: m.GifOptions })),
    load: () => import('./formats/gif'),
  },
  {
    info: { id: 'apng', title: 'Animated PNG', tag: 'APNG', goodFor: 'Sharper than a GIF, with soft see-through edges.', icon: 'image', ext: 'png', animated: true, alpha: true },
    baked: true,
    loops: true,
    carry: { summary: PICTURES, help: VIDEO_HELP },
    ui: () => import('./options/playback').then((m) => ({ After: m.ApngOptions })),
    load: () => import('./formats/apng'),
  },
  {
    info: { id: 'png', title: 'PNG picture', tag: 'This frame', goodFor: 'A single still picture you can use anywhere.', icon: 'image', ext: 'png', animated: false, alpha: true },
    carry: { summary: PICTURES },
    load: () => import('./formats/png'),
  },
  {
    info: { id: 'pngseq', title: 'PNG sequence', tag: '.zip', goodFor: 'Video editors and other tools that want one picture per frame.', icon: 'grid', ext: 'zip', animated: true, alpha: true },
    popular: 3,
    baked: true,
    stills: true,
    fileKind: () => ({ name: 'Zip file' }),
    carry: { summary: PICTURES },
    load: () => import('./formats/pngseq'),
  },
  {
    info: { id: 'svg', title: 'SVG drawing', tag: 'This frame', goodFor: 'Vector art that stays sharp at any size.', icon: 'image', ext: 'svg', animated: false, alpha: true },
    carry: {
      help: 'export-svg',
      summary: 'This frame as vector shapes, with text, blend modes, masks, clipping, colour wash and most effects kept, inside symbols too.',
      rows: { effects: 'kept', bones: 'picture' },
      nativeEffects: ['blur', 'shadow', 'adjust', 'glow', 'outline'],
    },
    load: () => import('./formats/svg'),
  },
  {
    info: { id: 'sheet', title: 'Sprite sheet', tag: 'For games', goodFor: 'Godot, Unity, Phaser, PixiJS or a web page: every frame on one picture.', icon: 'grid', ext: 'png', animated: true, alpha: true },
    popular: 4,
    folderTitle: 'Choose a folder for your sprite sheet',
    fileKind: () => ({ name: 'PNG picture' }),
    carry: { summary: PICTURES, help: 'export-sprite-sheets' },
    picked: (prev) => (prev.format !== 'sheet' ? { transparent: true } : {}),
    ui: () => import('./options/sheet').then((m) => ({ Before: m.SheetWhere, After: m.SheetLayout, summary: m.sheetSummary, exported: m.sheetExportedNote })),
    load: () => import('./formats/sheet'),
  },
  {
    info: { id: 'lottie', title: 'Lottie animation', tag: 'JSON', goodFor: 'Apps and websites: a small vector animation that plays at any size.', icon: 'play', ext: 'json', animated: true, alpha: true },
    carry: {
      help: 'export-lottie',
      summary: 'Shapes, symbols, tweens, the camera, blend modes, masks, clipping and colour wash stay vector, inside symbols too. Text becomes letter shapes (no fonts needed). Particles become little shapes, one per particle.',
      rows: { text: 'shapes', particles: 'shapes', effects: 'picture', bones: 'kept' },
      nativeEffects: ['blur', 'shadow'],
    },
    // A clip that plays backward, back and forth or N times is baked in play order with a time remap (nothing is drawn twice).
    baked: true,
    loops: true,
    extension: (s) => (s.lottieFile === 'dotlottie' ? 'lottie' : 'json'),
    fileKind: (s) => ({ name: s.lottieFile === 'dotlottie' ? 'dotLottie animation' : 'Lottie animation' }),
    repair: repairLottieSettings,
    ui: () => import('./options/lottie').then((m) => ({ Size: m.LottieOptions })),
    load: () => import('./formats/lottie'),
  },
  {
    info: { id: 'svganim', title: 'Moving SVG', tag: 'Animated SVG', goodFor: 'A web page or an <img> tag: one file that plays by itself, sharp at any size.', icon: 'image', ext: 'svg', animated: true, alpha: true },
    baked: true,
    loops: true,
    fileKind: () => ({ name: 'Animated SVG' }),
    carry: {
      help: 'export-svg-animated',
      summary: 'Shapes, symbols, tweens, the camera, text, particles, blend modes, masks, clipping, colour wash and most effects stay vector, inside symbols too.',
      rows: { effects: 'kept', bones: 'picture' },
      nativeEffects: ['blur', 'shadow', 'adjust', 'glow', 'outline'],
    },
    ui: () => import('./options/playback').then((m) => ({ After: m.SvgAnimOptions })),
    load: () => import('./formats/svganim'),
  },
  {
    info: { id: 'prores', title: 'ProRes video', tag: '.mov 4444', goodFor: 'Video editors (Premiere, Final Cut, Resolve), with a see-through background.', icon: 'film', ext: 'mov', animated: true, alpha: true },
    video: true,
    baked: true,
    fileKind: () => ({ name: 'QuickTime movie' }),
    carry: { summary: PICTURES },
    picked: (prev) => (prev.range === 'frame' ? { range: 'all' } : {}),
    support: (_size, fresh) => import('./formats/prores-run').then((m) => m.support(fresh)),
    direct: (doc, s, frame, target, signal, onProgress) => import('./formats/prores-run').then((m) => m.run(doc, s, frame, target, signal, onProgress)),
    ui: () => import('./options/notes').then((m) => ({ Notes: m.NoteFor('prores') })),
    load: () => Promise.reject(new Error('ProRes is made by the desktop app.')),
  },
  {
    info: { id: 'psd', title: 'Photoshop layers', tag: 'PSD', goodFor: 'This frame with every layer kept: names, blend modes, folders.', icon: 'layers', ext: 'psd', animated: false, alpha: true },
    fileKind: () => ({ name: 'Photoshop document' }),
    carry: {
      summary: 'This frame with every layer kept: names, blend modes, opacity, folders and clipping. Effects are baked into the layer pixels.',
      rows: { text: 'picture', particles: 'picture', effects: 'picture', mask: 'kept', folders: 'kept' },
    },
    ui: () => import('./options/notes').then((m) => ({ Notes: m.NoteFor('psd') })),
    load: () => import('./formats/psd'),
  },
  {
    info: { id: 'pdf', title: 'PDF', tag: 'Vector', goodFor: 'Printing and sharing sharp vector art. A page per frame, layers kept.', icon: 'vector', ext: 'pdf', animated: true, alpha: true },
    baked: true,
    stills: true,
    fileKind: () => ({ name: 'PDF document' }),
    carry: {
      summary: 'Sharp vector shapes with your layers as PDF layers. Text becomes letter outlines and colour wash recolours the shapes. Layers with effects, clipping, masks or bending (or holding a symbol with them inside) become pictures.',
      rows: { text: 'shapes', effects: 'picture', clip: 'picture', mask: 'picture', bones: 'picture', folders: 'kept' },
    },
    ui: () => import('./options/notes').then((m) => ({ Notes: m.NoteFor('pdf') })),
    load: () => import('./formats/pdf'),
  },
  {
    info: { id: 'ai', title: 'Illustrator', tag: '.ai', goodFor: 'Opens in Adobe Illustrator with real layers and every shape editable.', icon: 'vector', ext: 'ai', animated: true, alpha: true },
    baked: true,
    stills: true,
    singleFrame: (s) => (s.aiFrames ?? 'one') === 'one',
    extension: (s) => ((s.aiFrames ?? 'one') === 'files' ? 'zip' : 'ai'),
    fileKind: (s) => ((s.aiFrames ?? 'one') === 'files' ? { name: 'Zip file' } : { name: 'Adobe Illustrator' }),
    carry: {
      summary: 'Opens in Illustrator as its own file: your layers and folders as real layers, shapes, gradients and text editable (Illustrator needs the text\'s font installed, or it shows another one). Layers with effects, clipping, masks or bending (or holding a symbol with them inside) become pictures.',
      rows: { effects: 'picture', clip: 'picture', mask: 'picture', bones: 'picture', folders: 'kept' },
    },
    ui: () => import('./options/notes').then((m) => ({ Before: m.IllustratorFrames, Notes: m.NoteFor('ai') })),
    load: () => import('./formats/pdf'),
  },
];

for (const d of defs) registerExporter(d);
