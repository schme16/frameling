// Opens the Export dialog set to export several artboards.
import { openExportDialog } from '../export/open';
import { setArtboardExport, type ArtboardExportMode } from './export';

export function openArtboardExport(mode: ArtboardExportMode = 'each'): void {
  setArtboardExport({ mode, ids: null });
  openExportDialog(mode === 'atlas' ? 'sheet' : undefined);
}
