/**
 * What the app remembers between launches out of the shared UI state: the brush, the stroke and fill colours, how
 * playback loops, and the onion skin. The rest of the UI state is about where you are right now (the playhead, what is
 * selected, the layer, the zoom, whether it is playing) and is never kept. Pure: reading, checking and applying; the
 * saving itself is `src/tools/rememberUi.ts`, which stores this inside the tool settings.
 */
import type { BrushSettings } from './format';
import type { OnionSettings, UiState } from './store';

export interface RememberedUi {
  color: string;
  fillColor: string | null;
  strokeOn: boolean;
  brush: BrushSettings;
  loopPlayback: boolean;
  pingPong: boolean;
  onion: OnionSettings;
}

/** The UI fields that are kept, in one place so the saving and the tests agree. */
export const REMEMBERED_KEYS = ['color', 'fillColor', 'strokeOn', 'brush', 'loopPlayback', 'pingPong', 'onion'] as const;

/** The most onion frames either side the header offers. */
export const MAX_ONION_FRAMES = 8;

export function rememberedOf(ui: UiState): RememberedUi {
  return { color: ui.color, fillColor: ui.fillColor, strokeOn: ui.strokeOn, brush: ui.brush, loopPlayback: ui.loopPlayback, pingPong: !!ui.pingPong, onion: ui.onion };
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Keeps the fields of `raw` that are the right shape (numbers held to their range) and starts the rest from `base`. */
function brushFrom(raw: unknown, base: BrushSettings): BrushSettings | undefined {
  const r = record(raw);
  if (!r) return undefined;
  return {
    size: num(r.size, 1, 400) ?? base.size,
    thinning: num(r.thinning, -1, 1) ?? base.thinning,
    smoothing: num(r.smoothing, 0, 1) ?? base.smoothing,
    streamline: num(r.streamline, 0, 1) ?? base.streamline,
    taperStart: num(r.taperStart, 0, 400) ?? base.taperStart,
    taperEnd: num(r.taperEnd, 0, 400) ?? base.taperEnd,
    capStart: bool(r.capStart) ?? base.capStart,
    capEnd: bool(r.capEnd) ?? base.capEnd,
  };
}

function onionFrom(raw: unknown, base: OnionSettings): OnionSettings | undefined {
  const r = record(raw);
  if (!r) return undefined;
  const out: OnionSettings = {
    enabled: bool(r.enabled) ?? base.enabled,
    before: Math.round(num(r.before, 0, MAX_ONION_FRAMES) ?? base.before),
    after: Math.round(num(r.after, 0, MAX_ONION_FRAMES) ?? base.after),
    opacity: num(r.opacity, 0, 1) ?? base.opacity,
    beforeColor: isHex(r.beforeColor) ? r.beforeColor : base.beforeColor,
    afterColor: isHex(r.afterColor) ? r.afterColor : base.afterColor,
    tint: bool(r.tint) ?? base.tint,
  };
  if (bool(r.keysOnly) !== undefined) out.keysOnly = r.keysOnly as boolean;
  if (bool(r.boards) !== undefined) out.boards = r.boards as boolean;
  return out;
}

/**
 * What a saved value says, as far as it can be trusted. Anything missing or the wrong shape is simply left out, so
 * an old, damaged or hand-edited file falls back to the starting value for that one field and keeps the rest.
 */
export function readRemembered(raw: unknown, base: RememberedUi): Partial<RememberedUi> {
  const r = record(raw);
  if (!r) return {};
  const out: Partial<RememberedUi> = {};
  if (isHex(r.color)) out.color = r.color;
  if (r.fillColor === null || isHex(r.fillColor)) out.fillColor = r.fillColor as string | null;
  const strokeOn = bool(r.strokeOn);
  if (strokeOn !== undefined) out.strokeOn = strokeOn;
  const brush = brushFrom(r.brush, base.brush);
  if (brush) out.brush = brush;
  const loop = bool(r.loopPlayback);
  if (loop !== undefined) out.loopPlayback = loop;
  const ping = bool(r.pingPong);
  if (ping !== undefined) out.pingPong = ping;
  const onion = onionFrom(r.onion, base.onion);
  if (onion) out.onion = onion;
  return out;
}

/** The UI with the remembered values put in. `keepOnionOn` false starts with the onion skin off whatever was saved. */
export function applyRemembered(ui: UiState, saved: Partial<RememberedUi>, keepOnionOn = true): UiState {
  const next: UiState = { ...ui };
  if (saved.color !== undefined) next.color = saved.color;
  if (saved.fillColor !== undefined) next.fillColor = saved.fillColor;
  if (saved.strokeOn !== undefined) next.strokeOn = saved.strokeOn;
  if (saved.brush) next.brush = saved.brush;
  if (saved.loopPlayback !== undefined) next.loopPlayback = saved.loopPlayback;
  if (saved.pingPong !== undefined) next.pingPong = saved.pingPong;
  if (saved.onion) next.onion = keepOnionOn ? saved.onion : { ...saved.onion, enabled: false };
  return next;
}

/** True when nothing that is kept has changed (the same values, by reference, which is what an immer-style store gives). */
export function sameRemembered(a: RememberedUi, b: RememberedUi): boolean {
  return REMEMBERED_KEYS.every((k) => a[k] === b[k]);
}
