/**
 * Sound clips in the `.frameling` zip. In memory a clip holds the bytes of the file it came from; in the zip the bytes
 * sit in `audio/<id>.<ext>` (stored, not squeezed: they are already compressed) and `doc.json` holds the entry name
 * in `data` instead. Pure bytes in and out, like file.ts.
 */
import type { Zippable } from 'fflate';
import type { AudioClip, Doc } from '../core/format';

const EXT_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/webm': 'webm',
};

/** The file ending for a sound's media type ("wav", "mp3"...). */
export function audioExt(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? 'bin';
}

const ENTRY = /^audio\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/;
const safeName = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');

/** Adds each clip's bytes to the zip and returns the clips for doc.json (undefined when there are none). */
export function packAudio(doc: Doc, files: Zippable): Record<string, unknown>[] | undefined {
  if (!doc.audio?.length) return undefined;
  const used = new Set<string>();
  return doc.audio.map((c) => {
    const ext = audioExt(c.mime);
    let name = `audio/${safeName(c.id)}.${ext}`;
    while (used.has(name)) name = name.replace(/\.[a-z0-9]+$/, `_.${ext}`);
    used.add(name);
    files[name] = [c.data, { level: 0 }];
    return { ...c, data: name };
  });
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Reads the clips back. A clip whose bytes are missing is left out, with a warning in plain words. */
export function unpackAudio(raw: unknown, entries: Record<string, Uint8Array>, warnings: string[]): AudioClip[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: AudioClip[] = [];
  const ids = new Set<string>();
  for (const c of raw) {
    if (!isObj(c) || typeof c.id !== 'string' || ids.has(c.id)) {
      warnings.push('A sound could not be read and was left out.');
      continue;
    }
    const name = typeof c.name === 'string' && c.name ? c.name : 'Sound';
    const entry = typeof c.data === 'string' && ENTRY.test(c.data) ? entries[c.data] : undefined;
    if (!entry || !entry.length) {
      warnings.push(`The sound "${name}" is missing from the file and was left out.`);
      continue;
    }
    ids.add(c.id);
    const clip: AudioClip = { id: c.id, name, start: Math.round(num(c.start, 0)), data: entry, mime: typeof c.mime === 'string' && c.mime ? c.mime : 'audio/wav' };
    if (typeof c.volume === 'number' && Number.isFinite(c.volume)) clip.volume = Math.min(1, Math.max(0, c.volume));
    if (c.muted === true) clip.muted = true;
    if (typeof c.duration === 'number' && Number.isFinite(c.duration) && c.duration > 0) clip.duration = c.duration;
    out.push(clip);
  }
  return out.length ? out : undefined;
}
