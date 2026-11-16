// The little picture of a drawing, for lists of files (Open recent, the welcome sheet). Frameling writes it into the
// file when it saves (`preview.png`, a few KB), so it travels with the file. Reading it never reads the whole file: the
// zip's directory at the end says where it is. A file saved by an older Frameling has none; once such a file has been
// opened, a picture made then is kept in the app's own folder, keyed by the file's size and time so a changed file never
// shows an old picture. No Electron in here, the folder is handed in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { isPng, peekZipEntry } from '../shared/zipTail';
import { pathKey } from './paths';

export type PreviewResult = { state: 'picture'; url: string } | { state: 'none' } | { state: 'missing' };

/** A picture bigger than this is not a preview, whatever the file says. */
export const MAX_PREVIEW_BYTES = 120_000;

const dataUrl = (png: Uint8Array) => 'data:image/png;base64,' + Buffer.from(png).toString('base64');

/** The file's own preview picture, or null when it has none (or it is not readable as one). Reads a few KB, never the drawing. */
export function embeddedPreview(file: string): Uint8Array | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const handle = fd;
    const piece = peekZipEntry(
      (pos, len) => {
        const buf = Buffer.alloc(Math.max(0, Math.min(len, size - pos)));
        const n = fs.readSync(handle, buf, 0, buf.length, pos);
        return new Uint8Array(buf.buffer, buf.byteOffset, n);
      },
      size,
      'preview.png',
      MAX_PREVIEW_BYTES,
    );
    if (!piece) return null;
    const png = piece.method === 8 ? new Uint8Array(zlib.inflateRawSync(piece.data, { maxOutputLength: MAX_PREVIEW_BYTES * 4 })) : piece.data;
    return isPng(png) && png.length <= MAX_PREVIEW_BYTES * 4 ? png : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------- the app's own copies, for files with no picture of their own

/** The name a file's kept picture has: which file, then its size and time, so a changed file never matches an old picture. */
export function cacheName(key: string, size: number, mtimeMs: number): string {
  return `${crypto.createHash('sha1').update(key).digest('hex').slice(0, 20)}-${size}-${Math.round(mtimeMs)}.png`;
}

/** Which kept pictures to throw away: any whose file is no longer on the list (the first part of the name is the file). */
export function staleCopies(names: string[], keepKeys: string[]): string[] {
  const keep = new Set(keepKeys.map((k) => crypto.createHash('sha1').update(k).digest('hex').slice(0, 20)));
  return names.filter((n) => !keep.has(n.split('-')[0]));
}

export function keepPreview(dir: string, file: string, png: Uint8Array): void {
  if (!isPng(png) || png.length > MAX_PREVIEW_BYTES) return;
  const st = fs.statSync(file);
  const key = pathKey(file);
  fs.mkdirSync(dir, { recursive: true });
  // One kept picture per file: older ones for the same file go.
  const prefix = cacheName(key, 0, 0).split('-')[0];
  for (const n of fs.readdirSync(dir)) if (n.startsWith(prefix + '-')) fs.rmSync(path.join(dir, n), { force: true });
  const tmp = path.join(dir, `.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, png);
  fs.renameSync(tmp, path.join(dir, cacheName(key, st.size, st.mtimeMs)));
}

export function pruneCopies(dir: string, keepKeys: string[]): void {
  try {
    for (const n of staleCopies(fs.readdirSync(dir), keepKeys)) fs.rmSync(path.join(dir, n), { force: true });
  } catch {
    // Nothing kept yet.
  }
}

// What was read for a file, until the file changes: opening the list again is instant.
const seen = new Map<string, { size: number; mtimeMs: number; result: PreviewResult }>();

/** What to show for a file: its own picture, else the one kept for it, else nothing (and "missing" when the file has gone). */
export function previewOf(file: string, dir: string): PreviewResult {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { state: 'missing' };
  }
  const key = pathKey(file);
  const had = seen.get(key);
  if (had && had.size === st.size && had.mtimeMs === st.mtimeMs) return had.result;
  let result: PreviewResult = { state: 'none' };
  const own = embeddedPreview(file);
  if (own) result = { state: 'picture', url: dataUrl(own) };
  else {
    try {
      const kept = fs.readFileSync(path.join(dir, cacheName(key, st.size, st.mtimeMs)));
      if (isPng(kept) && kept.length <= MAX_PREVIEW_BYTES) result = { state: 'picture', url: dataUrl(kept) };
    } catch {
      // No kept picture.
    }
  }
  seen.set(key, { size: st.size, mtimeMs: st.mtimeMs, result });
  return result;
}

/** Forgets what was read for a file (after a kept picture is added for it). */
export function forgetSeen(file: string): void {
  seen.delete(pathKey(file));
}
