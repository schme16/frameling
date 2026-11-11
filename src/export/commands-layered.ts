// Straight to the Export dialog with PSD, PDF, Illustrator or ProRes picked.
import { registerCommands } from '../core/registry';
import { openExportDialog } from './open';

registerCommands([
  {
    id: 'file.exportPsd',
    label: 'Export Photoshop layers (PSD)...',
    category: 'File',
    description: 'This frame as a PSD with every layer kept: names, blend modes, folders.',
    help: 'export-psd',
    keywords: ['psd', 'photoshop', 'layers', 'krita', 'affinity', 'gimp', 'procreate'],
    global: true,
    run: () => openExportDialog('psd'),
  },
  {
    id: 'file.exportPdf',
    label: 'Export PDF...',
    category: 'File',
    description: 'Sharp vector pages, one per frame, with your layers as PDF layers.',
    help: 'export-pdf',
    keywords: ['pdf', 'print', 'vector', 'acrobat', 'storyboard'],
    global: true,
    run: () => openExportDialog('pdf'),
  },
  {
    id: 'file.exportIllustrator',
    label: 'Export for Illustrator (.ai)...',
    category: 'File',
    description: 'A PDF-compatible .ai file that Illustrator opens with every shape editable.',
    help: 'export-illustrator',
    keywords: ['ai', 'illustrator', 'adobe', 'vector', 'eps', 'affinity designer', 'inkscape'],
    global: true,
    run: () => openExportDialog('ai'),
  },
  {
    id: 'file.exportProres',
    label: 'Export ProRes video...',
    category: 'File',
    description: 'A ProRes 4444 .mov for video editors, with a see-through background if you like.',
    help: 'export-prores',
    keywords: ['prores', 'mov', 'quicktime', 'premiere', 'final cut', 'resolve', 'after effects', 'alpha', 'transparent video'],
    global: true,
    run: () => openExportDialog('prores'),
  },
]);
