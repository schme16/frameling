// The Export dialog and every exporter behind it (video, GIF, Lottie, PDF, PSD, ProRes, Godot...) load on first use.
import { lazyModule } from '../core/lazy';
import type { FormatId } from './types';

export const loadExportDialog = lazyModule(() => import('./ExportDialog'), { warm: true });

export function openExportDialog(format?: FormatId): void {
  void loadExportDialog().then((m) => m.openExportDialog(format));
}

export function exportAgain(): void {
  void loadExportDialog().then((m) => m.exportAgain());
}

export function exportAll(): void {
  void loadExportDialog().then((m) => m.exportAll());
}
