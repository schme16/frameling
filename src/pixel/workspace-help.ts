// Help for the Pixel workspace, its pixel bar and the Preview panel.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'pixel-workspace',
    order: 2,
    media: 'pixel-workspace.png',
    title: 'The Pixel workspace',
    section: 'Pixel art',
    summary: 'A layout made for pixel art: only the pixel tools, a big palette, a real-size preview and a bar of quick switches.',
    keywords: ['pixel workspace', 'layout', 'sprite', 'aseprite', 'pixel mode', 'game art'],
  },
  {
    id: 'pixel-aseprite-habits',
    media: 'pixel-aseprite-habits.png',
    title: 'Aseprite habits',
    section: 'Pixel art',
    summary: 'Hold Alt to pick a colour, + for a bigger brush, [ and ] along the palette, 1 to 6 to zoom, Tab to hide the panels.',
    keywords: ['aseprite', 'alt eyedropper', 'brush size keys', 'plus minus', 'palette keys', 'zoom keys', 'hide panels', 'tab', 'habits', 'shortcuts'],
  },
  {
    id: 'pixel-bar',
    media: 'pixel-bar.png',
    title: 'The pixel bar',
    section: 'Pixel art',
    summary: 'The strip over the canvas in the Pixel workspace: size, shape, pixel perfect, mirror, onion skin, tile mode, grid and palette colour.',
    keywords: ['pixel bar', 'context bar', 'brush size', 'brush shape', 'symmetry', 'quick toggles'],
  },
  {
    id: 'pixel-preview',
    media: 'pixel-preview.mp4',
    title: 'Preview (real size)',
    section: 'Pixel art',
    summary: 'Watch your animation play at real size, crisp, in a loop, while you draw.',
    keywords: ['preview', 'real size', 'actual size', '1x', '2x', 'mini view', 'sprite preview', 'loop'],
  },
  {
    id: 'pixel-preview-boards',
    media: 'pixel-preview-boards.mp4',
    title: 'Preview on several boards',
    section: 'Pixel art',
    summary: 'Frames on boards play in order with a strip of boards; sprites on a sheet get a picker.',
    keywords: ['preview', 'boards', 'board strip', 'sprite picker', 'sheet', 'frames on boards', 'sprites on a sheet', 'artboards'],
  },
]);
