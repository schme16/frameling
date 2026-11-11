// "Edit in Frameling": an Interactives package (.flplay) can carry the editable drawing inside it. This takes it out,
// and remembers per drawing which package it came from and whether saving should update it. Pure apart from storage.
import { strFromU8, unzipSync } from 'fflate';
import type { PlayableManifest } from '../export/playable';
import { PLAYABLE_FORMAT } from '../export/types';
import { FileProblem } from '../io/file';

export interface PlayableSource {
  manifest: Pick<PlayableManifest, 'name' | 'scale' | 'pixelArt' | 'background' | 'width' | 'height' | 'fps' | 'frameCount'>;
  /** The .frameling file inside, or null when it was exported without it. */
  source: Uint8Array | null;
}

const MAX = 1024 * 1024 * 1024;

/** Reads a .flplay's manifest and the drawing inside it. Throws FileProblem in plain words. */
export function readPlayable(bytes: Uint8Array): PlayableSource {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX && (f.name === 'manifest.json' || f.name.endsWith('.frameling')) });
  } catch {
    throw new FileProblem("That doesn't look like an Interactives file from Frameling, so it could not be opened.");
  }
  let m: Partial<PlayableManifest>;
  try {
    m = JSON.parse(strFromU8(files['manifest.json']));
  } catch {
    throw new FileProblem("That doesn't look like an Interactives file from Frameling, so it could not be opened.");
  }
  if (m?.format !== PLAYABLE_FORMAT) throw new FileProblem("That doesn't look like an Interactives file from Frameling, so it could not be opened.");
  const name = typeof m.source === 'string' && /^[A-Za-z0-9_.-]+\.frameling$/.test(m.source) ? m.source : null;
  return {
    manifest: { name: String(m.name ?? 'Untitled'), scale: typeof m.scale === 'number' && m.scale > 0 ? m.scale : 1, pixelArt: !!m.pixelArt, background: typeof m.background === 'string' ? m.background : null, width: Number(m.width) || 0, height: Number(m.height) || 0, fps: Number(m.fps) || 0, frameCount: Number(m.frameCount) || 0 },
    source: name && files[name] ? files[name] : null,
  };
}

/** What a drawing remembers about the package it goes back into. */
export interface PlayableLink {
  path: string;
  /** Save also updates the package. */
  update: boolean;
  scale: number;
  /** The package's frames were see-through. */
  transparent: boolean;
}

const KEY = 'frameling.playableLinks.v1';
const MAX_LINKS = 100;

function all(): Record<string, PlayableLink & { at: number }> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function getLink(docId: string): PlayableLink | null {
  const l = all()[docId];
  return l && typeof l.path === 'string' ? { path: l.path, update: l.update !== false, scale: Number(l.scale) || 1, transparent: !!l.transparent } : null;
}

export function setLink(docId: string, link: PlayableLink | null): void {
  const list = all();
  if (link) list[docId] = { ...link, at: Date.now() };
  else delete list[docId];
  // Only the newest few: old drawings forget where they came from.
  const keep = Object.entries(list)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_LINKS);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    // Remembered for this visit only.
  }
}
