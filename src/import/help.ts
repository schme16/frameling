import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'import-sequence',
    media: 'import-sequence.png',
    title: 'Bringing in a folder or zip of pictures',
    section: 'Files',
    summary: 'Pictures made somewhere else, or Frameling\'s own PNG sequence, come in as the frames of one animation. It says what it found before it does anything.',
    keywords: ['import', 'png sequence', 'image sequence', 'folder', 'zip', 'frames', 'pictures', 'render', 'scan', 'numbered', 'frame2', 'sort', 'round trip', 'jpg', 'webp'],
  },
  {
    id: 'import-svg',
    media: 'import-svg.png',
    title: 'Bringing in an SVG or a logo',
    section: 'Files',
    summary: 'An SVG from Illustrator, Inkscape or Figma comes in as vector shapes on layers, ready to animate. Anything it can\'t carry is listed.',
    keywords: ['import', 'svg', 'vector', 'logo', 'illustrator', 'inkscape', 'figma', 'icon', 'paths', 'gradient', 'text', 'svgz', 'open'],
  },
  {
    id: 'import-layered',
    media: 'import-layered.png',
    title: 'Opening a Photoshop, Krita or OpenRaster file',
    section: 'Files',
    summary: 'A layered .psd or .ora file opens with every layer on its own, and Photoshop text stays text you can edit. What can\'t come across is listed.',
    keywords: ['import', 'psd', 'photoshop', 'ora', 'openraster', 'krita', 'gimp', 'procreate', 'layers', 'groups', 'blend', 'open', 'kra', 'text', 'font', 'editable'],
  },
  {
    id: 'import-vectorcraft',
    media: 'import-vectorcraft.png',
    title: 'Bringing in a VectorCraft file',
    section: 'Files',
    summary: 'A .vectorcraft drawing comes in as vector shapes on layers, with its gradients, text, artboards and colours. Anything it can\'t carry is listed.',
    keywords: ['import', 'vectorcraft', 'vector', 'artboard', 'swatches', 'gradient', 'text', 'shapes', 'open', 'poster', 'illustrator'],
  },
  {
    id: 'import-photocraft',
    media: 'import-photocraft.png',
    title: 'Bringing in a Photocraft file',
    section: 'Files',
    summary: 'A .pcraft or .photocraft file comes in with every picture layer on its own: names, order, opacity, blend modes and hiding kept. Anything it can\'t carry is listed.',
    keywords: ['import', 'photocraft', 'pcraft', 'layers', 'raster', 'tiles', 'zstd', 'open', 'blend', 'groups'],
  },
]);
