// The options of the chalk and charcoal tool: which medium and which paper, and each medium's own size, edge and
// pressure, kept in the browser's storage so a medium comes back the way you left it.
import { createStore, readRaw, writeJson } from '../ui/mini';
import { isMedium, MEDIA, MEDIUM_IDS, type DryId } from './maths';
import { isPaper, type PaperKind } from './paper';

export interface DryOptions {
  /** Width in art pixels. */
  size: number;
  /** 0 (soft all the way in) to 1 (a hard edge). */
  hardness: number;
  /** 0.05 to 1. How hard you press, for a mouse; with a pen, the pen's pressure scales it. */
  press: number;
}

export interface DrySettings {
  medium: DryId;
  paper: PaperKind;
  tools: Record<DryId, DryOptions>;
}

export const SIZE_RANGE = { min: 1, max: 80 };
export const PRESS_RANGE = { min: 0.05, max: 1 };

const defaults = (): Record<DryId, DryOptions> => Object.fromEntries(MEDIA.map((m) => [m.id, { size: m.size, hardness: m.hardness, press: m.press }])) as Record<DryId, DryOptions>;

export const DEFAULT_DRY: DrySettings = { medium: 'compressed-charcoal', paper: 'medium', tools: defaults() };

const KEY = 'frameling.dryMedia.v1';
const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Saved settings made safe: anything missing or odd takes its default. */
export function cleanDry(raw: unknown): DrySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { medium?: unknown; paper?: unknown; tools?: Record<string, Partial<DryOptions>> };
  const base = defaults();
  const tools = {} as Record<DryId, DryOptions>;
  for (const id of MEDIUM_IDS) {
    const d = base[id];
    const s = r.tools?.[id] ?? {};
    tools[id] = { size: Math.round(num(s.size, SIZE_RANGE.min, SIZE_RANGE.max, d.size)), hardness: num(s.hardness, 0, 1, d.hardness), press: num(s.press, PRESS_RANGE.min, PRESS_RANGE.max, d.press) };
  }
  return { medium: isMedium(r.medium) ? r.medium : DEFAULT_DRY.medium, paper: isPaper(r.paper) ? r.paper : DEFAULT_DRY.paper, tools };
}

const store = createStore<DrySettings>(cleanDry(readRaw<unknown>(KEY, null)));

export const getDry = (): DrySettings => store.get();
export const useDry = <S,>(selector: (s: DrySettings) => S): S => store.use(selector);

function save(next: DrySettings): DrySettings {
  writeJson(KEY, next);
  return next;
}

export const setMedium = (medium: DryId): void => store.set((s) => save({ ...s, medium }));
export const setPaper = (paper: PaperKind): void => store.set((s) => save({ ...s, paper }));
export function setDryTool(id: DryId, patch: Partial<DryOptions>): void {
  store.set((s) => save(cleanDry({ ...s, tools: { ...s.tools, [id]: { ...s.tools[id], ...patch } } })));
}
export function resetDry(): void {
  store.set(() => save(cleanDry(null)));
}
