// What a drawing remembers about exporting, as plain maths on data: how it was last exported, and a few named ways out
// ("the sprite sheet", "the web video"). Kept light on purpose: opening a file reads this without loading any exporter.
import type { DocExports, SavedExport, SavedSettings } from '../core/format';

/** A drawing keeps this many named ways; enough for a sheet, a GIF, a video and a few more. */
export const MAX_WAYS = 12;
export const MAX_WAY_NAME = 40;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keeps strings, numbers, yes/no and nested plain objects; drops everything else (and anything too deep). */
function plain(raw: Record<string, unknown>, depth = 0): SavedSettings {
  const out: SavedSettings = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' || typeof v === 'boolean' || v === null) out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (isObj(v) && depth < 3) out[k] = plain(v, depth + 1);
  }
  return out;
}

/** Export settings as they are saved. Whether the loop was set by hand is not remembered: a clip sets it again. */
export function plainSettings(settings: object): SavedSettings {
  const out = plain(settings as Record<string, unknown>);
  delete out.loopTouched;
  return out;
}

/** Settings read from a file, or null when they say nothing usable (no format). */
export function readSavedSettings(raw: unknown): SavedSettings | null {
  if (!isObj(raw) || typeof raw.format !== 'string' || !raw.format) return null;
  return plain(raw);
}

/** The same settings give the same text, whatever order their keys came in. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export const sameSettings = (a: SavedSettings, b: SavedSettings): boolean => stable(plainSettings(a)) === stable(plainSettings(b));

/** A way's name, trimmed and kept short. */
export const cleanName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, MAX_WAY_NAME);

/** The saved choices of a file, checked: ways with no name or settings go, ways with the same id keep the first, and the list is capped. */
export function readExports(raw: unknown): { exports?: DocExports } {
  if (!isObj(raw)) return {};
  const out: DocExports = {};
  const last = isObj(raw.last) ? readSavedSettings(raw.last.settings) : null;
  const ways: SavedExport[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.ways)) {
    for (const w of raw.ways) {
      if (!isObj(w) || typeof w.id !== 'string' || !w.id || seen.has(w.id)) continue;
      const name = typeof w.name === 'string' ? cleanName(w.name) : '';
      const settings = readSavedSettings(w.settings);
      if (!name || !settings) continue;
      seen.add(w.id);
      ways.push({ id: w.id, name, settings });
      if (ways.length >= MAX_WAYS) break;
    }
  }
  if (last) {
    const way = isObj(raw.last) && typeof raw.last.way === 'string' && seen.has(raw.last.way) ? raw.last.way : undefined;
    out.last = way ? { settings: last, way } : { settings: last };
  }
  if (ways.length) out.ways = ways;
  return out.last || out.ways ? { exports: out } : {};
}

/** Records how the drawing was just exported. A way with exactly these settings is noted as the one used. Same as before gives the same object back. */
export function withLast(cur: DocExports | undefined, settings: SavedSettings): DocExports {
  const plainNow = plainSettings(settings);
  const way = cur?.ways?.find((w) => sameSettings(w.settings, plainNow))?.id;
  const last = way ? { settings: plainNow, way } : { settings: plainNow };
  if (cur?.last && sameSettings(cur.last.settings, plainNow) && cur.last.way === way) return cur;
  return { ...cur, last };
}

/** Whether a name is already taken by another way (the same name in other letters counts). */
export function wayNamed(cur: DocExports | undefined, name: string): SavedExport | undefined {
  const n = cleanName(name).toLowerCase();
  return cur?.ways?.find((w) => w.name.toLowerCase() === n);
}

/** Saves the settings as a way. The same name replaces that way's settings (so a way can be updated); a new name adds one. Null when the name is empty or the list is full. */
export function withWay(cur: DocExports | undefined, name: string, settings: SavedSettings, newId: () => string): { exports: DocExports; way: SavedExport } | null {
  const clean = cleanName(name);
  if (!clean) return null;
  const plainNow = plainSettings(settings);
  const old = wayNamed(cur, clean);
  if (!old && (cur?.ways?.length ?? 0) >= MAX_WAYS) return null;
  const way: SavedExport = { id: old?.id ?? newId(), name: old?.name ?? clean, settings: plainNow };
  const ways = old ? (cur?.ways ?? []).map((w) => (w.id === old.id ? way : w)) : [...(cur?.ways ?? []), way];
  return { exports: { ...cur, ways, last: { settings: plainNow, way: way.id } }, way };
}

/** Takes a way away. What was last exported stays, no longer marked as that way. */
export function withoutWay(cur: DocExports | undefined, id: string): DocExports | undefined {
  if (!cur?.ways?.some((w) => w.id === id)) return cur;
  const ways = cur.ways.filter((w) => w.id !== id);
  const next: DocExports = { ...cur };
  if (ways.length) next.ways = ways;
  else delete next.ways;
  if (next.last?.way === id) next.last = { settings: next.last.settings };
  return next.last || next.ways ? next : undefined;
}

/** Gives a way a new name. Null when the name is empty or another way has it. */
export function withRenamedWay(cur: DocExports | undefined, id: string, name: string): DocExports | null {
  const clean = cleanName(name);
  const taken = wayNamed(cur, clean);
  if (!cur?.ways || !clean || (taken && taken.id !== id)) return null;
  return { ...cur, ways: cur.ways.map((w) => (w.id === id ? { ...w, name: clean } : w)) };
}

/** The name of the way that was last used, if the last export was one. */
export const lastWayName = (cur: DocExports | undefined): string | null => cur?.ways?.find((w) => w.id === cur.last?.way)?.name ?? null;
