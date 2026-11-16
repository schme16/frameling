// Bringing a brush file from another program in: read it, show what it holds, and add the ones you keep to your brushes.
import { toast } from '../../ui/toast';
import { readBrushFile, MAX_FILE_BYTES, plural, type ImportedBrush } from './index';
import { showBrushImport } from './Dialog';

/** What the library calls to add the kept brushes; says how many went in. */
export type Land = (picked: ImportedBrush[], group: string) => number;

export async function importBrushBytes(bytes: Uint8Array, fileName: string, land: Land): Promise<boolean> {
  const r = readBrushFile(bytes, fileName);
  if (!r.ok) {
    toast(r.error, { kind: 'warn', duration: 9000 });
    return false;
  }
  showBrushImport(r, fileName, (picked, group) => {
    const n = land(picked, group);
    const whole = picked.filter((b) => !b.dropped.length && !b.changed.length).length;
    const rest = n - whole;
    toast(`Added ${plural(n, 'brush', 'brushes')}${n > 1 && rest > 0 ? `; ${whole} came in whole and ${rest} with something left out or changed` : ''}.`, { kind: 'success' });
  });
  return true;
}

export async function importBrushFile(file: File, land: Land): Promise<boolean> {
  if (file.size > MAX_FILE_BYTES) {
    toast('That file is too big to be a brush file.', { kind: 'warn' });
    return false;
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    toast('That file could not be opened.', { kind: 'warn' });
    return false;
  }
  return importBrushBytes(bytes, file.name, land);
}
