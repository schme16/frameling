// The options of the soft paint tools (size, hardness, flow), one set per tool, kept in the browser's storage.
import { createStore, readRaw, writeJson } from '../ui/mini';
import type { SoftKind } from './maths';

export interface SoftOptions {
  /** Width in art pixels. */
  size: number;
  /** 0 (soft all the way in) to 1 (a hard edge). Smudge keeps a fixed soft edge. */
  hardness: number;
  /** 0.05 to 1. How much paint a pass lays down; for the highlighter and smudge, how strong it is. */
  flow: number;
}

export interface SoftSettings {
  tools: Record<SoftKind, SoftOptions>;
  /** The airbrush keeps building up while you hold still. */
  holdBuilds: boolean;
}

export const SIZE_RANGE = { min: 1, max: 120 };
export const FLOW_RANGE = { min: 0.05, max: 1 };

export const DEFAULT_SOFT: SoftSettings = {
  tools: {
    airbrush: { size: 28, hardness: 0, flow: 0.3 },
    'soft-brush': { size: 16, hardness: 0.5, flow: 1 },
    'soft-eraser': { size: 16, hardness: 0.3, flow: 1 },
    highlighter: { size: 20, hardness: 0.9, flow: 0.8 },
    smudge: { size: 16, hardness: 0.3, flow: 0.6 },
  },
  holdBuilds: true,
};

const KEY = 'frameling.softPaint.v1';
const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Saved settings made safe: anything missing or odd takes its default. */
export function cleanSoft(raw: unknown): SoftSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { tools?: Record<string, Partial<SoftOptions>>; holdBuilds?: unknown };
  const tools = {} as Record<SoftKind, SoftOptions>;
  for (const k of Object.keys(DEFAULT_SOFT.tools) as SoftKind[]) {
    const d = DEFAULT_SOFT.tools[k];
    const s = r.tools?.[k] ?? {};
    tools[k] = { size: Math.round(num(s.size, SIZE_RANGE.min, SIZE_RANGE.max, d.size)), hardness: num(s.hardness, 0, 1, d.hardness), flow: num(s.flow, FLOW_RANGE.min, FLOW_RANGE.max, d.flow) };
  }
  return { tools, holdBuilds: typeof r.holdBuilds === 'boolean' ? r.holdBuilds : DEFAULT_SOFT.holdBuilds };
}

const store = createStore<SoftSettings>(cleanSoft(readRaw<unknown>(KEY, null)));

export const getSoft = (): SoftSettings => store.get();
export const useSoft = <S,>(selector: (s: SoftSettings) => S): S => store.use(selector);

export function setSoftTool(kind: SoftKind, patch: Partial<SoftOptions>): void {
  store.set((s) => {
    const next = cleanSoft({ ...s, tools: { ...s.tools, [kind]: { ...s.tools[kind], ...patch } } });
    writeJson(KEY, next);
    return next;
  });
}

export function setHoldBuilds(on: boolean): void {
  store.set((s) => {
    const next = { ...s, holdBuilds: on };
    writeJson(KEY, next);
    return next;
  });
}

export function resetSoft(): void {
  store.set(cleanSoft(null));
  writeJson(KEY, store.get());
}
