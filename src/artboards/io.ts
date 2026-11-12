/**
 * Artboards in the `.frameling` file. The open artboard's content is the document's own fields, as in any file; the
 * others sit in `artboards[].content`, their layers read by the same reader as the stage's and their sounds stored
 * in the zip beside the rest. Pure bytes in and out, like file.ts (which passes its readers in).
 */
import type { Zippable } from 'fflate';
import type { Artboard, ArtboardContent, ClipFlow, Doc, DocPalette, DrawingDiff, Guide, Layer } from '../core/format';
import { packAudio, unpackAudio } from '../io/audio-file';
import { readClip } from '../core/clipPlay';
import { readOverrides, variationForSave } from './variationsIo';

/** The artboards for doc.json, with each set-aside artboard's sound bytes added to the zip. Empty when there are none. */
export function packArtboards(doc: Doc, files: Zippable, diffs?: Map<string, DrawingDiff>): { artboards?: unknown[]; activeArtboard?: string } {
  if (!doc.artboards?.length) return {};
  const artboards = doc.artboards.map((a) => {
    if (a.variationOf) return variationForSave(a, files, diffs);
    if (!a.content?.audio?.length) return a;
    return { ...a, content: { ...a.content, audio: packAudio({ audio: a.content.audio } as Doc, files) } };
  });
  return { artboards, ...(doc.activeArtboard ? { activeArtboard: doc.activeArtboard } : {}) };
}

export interface ArtboardReaders {
  readLayers: (raw: any[]) => Layer[];
  readFlow: (raw: unknown, clips: { id: string }[]) => ClipFlow | undefined;
  readGuides: (raw: unknown) => Guide[] | undefined;
  readPalette?: (raw: unknown) => { palette?: DocPalette };
  /** The layers of the open artboard (the file's own), for reading what a variation of it adds. */
  top?: Layer[];
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

/**
 * The artboards, checked. One that can't be read is left out with a warning. If the open one is missing, the
 * document's own content becomes an artboard of its own, so nothing is lost.
 */
export function readArtboards(raw: any, entries: Record<string, Uint8Array>, warnings: string[], r: ArtboardReaders): { artboards?: Artboard[]; activeArtboard?: string } {
  if (!Array.isArray(raw.artboards) || !raw.artboards.length) return {};
  const out: Artboard[] = [];
  const ids = new Set<string>();
  let active: string | null = null;
  const pending: { v: Artboard; raw: unknown }[] = [];
  const wanted = typeof raw.activeArtboard === 'string' ? raw.activeArtboard : null;
  for (const a of raw.artboards) {
    if (!isObj(a) || typeof a.id !== 'string' || !a.id || ids.has(a.id)) {
      warnings.push('An artboard could not be read and was left out.');
      continue;
    }
    const base: Artboard = { id: a.id, name: str(a.name, 'Artboard').slice(0, 120) || 'Artboard', x: Math.round(num(a.x, 0)), y: Math.round(num(a.y, 0)) };
    if (typeof a.exportName === 'string' && a.exportName.trim()) base.exportName = a.exportName.trim().slice(0, 120);
    if (typeof a.variationOf === 'string' && a.variationOf && a.variationOf !== a.id) {
      // A variation: only its changes are stored. They are read once every original has been.
      ids.add(a.id);
      const v: Artboard = { ...base, variationOf: a.variationOf, overrides: {} };
      out.push(v);
      pending.push({ v, raw: a.overrides });
      continue;
    }
    const isActive = !isObj(a.content) && !active && (!wanted || wanted === a.id);
    if (isActive) {
      active = a.id;
      ids.add(a.id);
      out.push(base);
      continue;
    }
    const content = readContent(a.content, entries, warnings, r);
    if (!content) {
      warnings.push(`The artboard "${base.name}" could not be read and was left out.`);
      continue;
    }
    ids.add(a.id);
    out.push({ ...base, content });
  }
  if (!active) {
    // Nothing named the open one: the document's own content is still there, so it gets an artboard.
    let id = 'artboard-open';
    while (ids.has(id)) id += '_';
    out.unshift({ id, name: 'Artboard', x: 0, y: 0 });
    active = id;
  }
  for (const { v, raw: rawOv } of pending) {
    const src = out.find((x) => x.id === v.variationOf && !x.variationOf);
    const layers = src ? (src.content?.layers ?? r.top ?? []) : [];
    v.overrides = readOverrides(rawOv, r, (id) => layers.find((l) => l.id === id)?.kind, { entries, warnings });
  }
  return { artboards: out, activeArtboard: active };
}

function readContent(c: unknown, entries: Record<string, Uint8Array>, warnings: string[], r: ArtboardReaders): ArtboardContent | null {
  if (!isObj(c) || !Array.isArray(c.layers)) return null;
  const width = num(c.width, 0);
  const height = num(c.height, 0);
  if (width < 1 || height < 1) return null;
  let layers: Layer[];
  try {
    layers = r.readLayers(c.layers);
  } catch {
    return null;
  }
  const clips = Array.isArray(c.clips) ? c.clips.filter((x: any) => isObj(x) && typeof x.id === 'string').map(readClip) : [];
  const out: ArtboardContent = {
    width,
    height,
    background: typeof c.background === 'string' ? c.background : null,
    length: Math.max(1, Math.round(num(c.length, 1))),
    layers,
    clips,
    markers: Array.isArray(c.markers) ? c.markers.filter((x: any) => isObj(x) && typeof x.id === 'string') : [],
  };
  const flow = r.readFlow(c.flow, clips);
  if (flow) out.flow = flow;
  const audio = unpackAudio(c.audio, entries, warnings);
  if (audio) out.audio = audio;
  const guides = r.readGuides(c.guides);
  if (guides) out.guides = guides;
  if (isObj(c.inOut) && Number.isFinite(c.inOut.start) && Number.isFinite(c.inOut.end)) {
    const a = Math.max(0, Math.min(out.length - 1, Math.round(c.inOut.start)));
    const b = Math.max(0, Math.min(out.length - 1, Math.round(c.inOut.end)));
    out.inOut = { start: Math.min(a, b), end: Math.max(a, b) };
  }
  if (isObj(c.perspective) && Array.isArray(c.perspective.points)) {
    const points = c.perspective.points.filter((p: any) => isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 2).map((p: any) => ({ x: p.x as number, y: p.y as number }));
    if (points.length) out.perspective = { points };
  }
  return out;
}
