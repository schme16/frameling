// Reading a brush file from another program. `readBrushFile` looks at the name and the first bytes, picks the reader and
// hands back brushes that have already been through `cleanDab`. It never throws: anything wrong comes back as a plain
// message. See docs/brush-import.md for which formats are read and what does not come across.
import { readAbrFile } from './abr';
import { readGbrFile, readGihFile, readVbrFile } from './gimp';
import { BrushProblem, FORMAT_NAMES, MAX_BRUSHES_PER_FILE, MAX_FILE_BYTES, type BrushFormat, type ImportResult } from './types';

export * from './types';

/** The file endings the Add brushes picker offers, besides Frameling's own .json. */
export const IMPORT_EXTS = ['.gbr', '.gih', '.vbr', '.abr'];

const extOf = (name: string): string => {
  const m = /\.[A-Za-z0-9]+$/.exec(name);
  return m ? m[0].toLowerCase() : '';
};

const stripExt = (name: string): string => name.replace(/\.[A-Za-z0-9]+$/, '').replace(/[_]+/g, ' ').trim();

/** Which brush format this looks like, from its ending and then its first bytes. Null when it is none we know. */
export function sniff(bytes: Uint8Array, fileName: string): BrushFormat | null {
  const ext = extOf(fileName);
  const head = (n: number): string => String.fromCharCode(...bytes.subarray(0, n));
  const be32 = (at: number): number => (bytes.length >= at + 4 ? ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0 : -1);
  if (head(8) === 'GIMP-VBR') return 'vbr';
  if (ext === '.vbr') return 'vbr';
  if (ext === '.gih') return 'gih';
  if (ext === '.abr') return 'abr';
  // A .gbr has its version in the second word and (version 2) GIMP at byte 20.
  const gbr = (be32(4) === 1 || be32(4) === 2 || be32(4) === 3) && be32(0) >= 20 && be32(0) < 4096 && (be32(4) === 1 || head(24).endsWith('GIMP'));
  if (ext === '.gbr' || gbr) return 'gbr';
  // A modern Photoshop set has its version, then 8BIM sections.
  if ([6, 7, 9, 10].includes((bytes[0] << 8) | bytes[1]) && head(8).slice(4) === '8BIM') return 'abr';
  return null;
}

/** Reads a brush file. `fileName` helps pick the reader and names a brush that carries no name of its own. */
export function readBrushFile(bytes: Uint8Array, fileName: string): ImportResult {
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: 'That file is too big to be a brush file.' };
  if (bytes.length < 8) return { ok: false, error: 'That file is too small to be a brush file.' };
  const format = sniff(bytes, fileName);
  if (!format) return { ok: false, error: `Frameling could not tell what kind of brush file "${fileName.slice(0, 60)}" is. It reads GIMP (.gbr, .gih, .vbr) and Photoshop (.abr) brushes.` };
  const base = stripExt(fileName) || FORMAT_NAMES[format].what;
  try {
    const r = format === 'gbr' ? readGbrFile(bytes, base) : format === 'gih' ? readGihFile(bytes, base) : format === 'abr' ? readAbrFile(bytes, base) : readVbrFile(bytes, base);
    if (r.ok && r.brushes.length > MAX_BRUSHES_PER_FILE) return { ...r, brushes: r.brushes.slice(0, MAX_BRUSHES_PER_FILE), notes: [...r.notes, `Only the first ${MAX_BRUSHES_PER_FILE} brushes were kept.`] };
    return r;
  } catch (e) {
    if (e instanceof BrushProblem) return { ok: false, format, error: e.message };
    return { ok: false, format, error: `Frameling could not read that ${FORMAT_NAMES[format].what}. It may be damaged.` };
  }
}
