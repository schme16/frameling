import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'export-psd',
    title: 'Photoshop layers (PSD)',
    section: 'Exporting',
    media: 'export-psd.png',
    summary: 'Export the frame you are on as a PSD with every layer kept, for Photoshop, Krita, Affinity Photo, GIMP or Procreate.',
    keywords: ['psd', 'photoshop', 'layers', 'krita', 'affinity', 'gimp', 'procreate', 'photopea'],
  },
  {
    id: 'export-pdf',
    title: 'PDF',
    section: 'Exporting',
    media: 'export-pdf.png',
    summary: 'Sharp vector pages for printing and sharing: one page per frame, with your layers as PDF layers.',
    keywords: ['pdf', 'print', 'vector', 'acrobat', 'storyboard', 'pages'],
  },
  {
    id: 'export-illustrator',
    title: 'Illustrator (.ai)',
    section: 'Exporting',
    media: 'export-pdf.png',
    summary: 'A .ai file that Adobe Illustrator opens as its own, with your layers and folders as real Illustrator layers, every shape editable and your text as live text.',
    keywords: ['ai', 'illustrator', 'adobe', 'vector', 'layers', 'artboards', 'gradients', 'affinity designer', 'inkscape', 'coreldraw'],
  },
  {
    id: 'export-prores',
    title: 'ProRes video',
    section: 'Exporting',
    media: 'export-prores.png',
    summary: 'A ProRes 4444 .mov for video editors like Premiere, Final Cut and DaVinci Resolve, with a see-through background if you like.',
    keywords: ['prores', 'mov', 'quicktime', '4444', 'alpha', 'premiere', 'final cut', 'resolve', 'after effects', 'ffmpeg', 'transparent video'],
  },
]);
