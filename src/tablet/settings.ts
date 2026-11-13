// Pen and tablet settings, kept in the browser's storage so they are there next time. Browsers don't say which pen is
// in use (the pointer id changes every time the pen leaves range, and USB device names need a permission prompt), so
// there is one Pen profile and one Mouse and touch profile, and the tools remember their own pen options.
import { createStore, readJson, writeJson, type MiniStore } from '../ui/mini';
import { BARREL_ACTIONS, type BarrelAction } from './buttons';
import { CURVE_PRESETS, cleanCurve, cleanRange, type Curve } from './curve';
import type { StabMode } from './stabilizer';

/** Tools that draw by dragging, and so can use a pen's pressure and tilt and the stabilizer. */
export type PenTool = 'brush' | 'pencil' | 'eraser' | 'spray' | 'shade' | 'dither';
export const PEN_TOOLS: PenTool[] = ['brush', 'pencil', 'eraser', 'spray', 'shade', 'dither'];

export interface ToolPen {
  /** Pressing harder makes the mark bigger. */
  size: boolean;
  /** Pressing harder makes the mark darker (a whole line, on a vector layer). */
  opacity: boolean;
  /** Pressing harder lays down more paint (the spray). */
  flow: boolean;
  /** Leaning the pen makes the mark bigger, like the side of a pencil. */
  tilt: boolean;
  /** How much the stabilizer steadies the line, 0 (off) to 100. */
  stabilizer: number;
  stabMode: StabMode;
}

export interface PenDevice {
  curve: Curve;
  min: number;
  max: number;
  /** How much leaning changes a mark, 0 to 100. */
  tiltAmount: number;
  /** The eraser end of the pen erases while it is down. */
  eraserEnd: boolean;
  barrel1: BarrelAction;
  barrel2: BarrelAction;
  /** The two barrel buttons come through the other way round on this tablet, so swap what they do. */
  swapButtons: boolean;
}

export type OneFinger = 'draw' | 'pan' | 'off';

export interface TouchDevice {
  /** What one finger does. */
  oneFinger: OneFinger;
  /** Two fingers pan and zoom the page. */
  twoFingers: boolean;
  /** Ignore fingers and palms while a pen is near the screen. */
  palmRejection: boolean;
}

export interface PenSettings {
  pen: PenDevice;
  touch: TouchDevice;
  tools: Record<PenTool, ToolPen>;
  /** A pen has been seen at least once, so the tool options show the pen section. */
  seen: boolean;
}

// A light steadying on every tool to start with: enough to take the wobble out of a slow line, not enough to feel
// like the line is lagging behind the pen. Each tool's own options can change it.
export const DEFAULT_STABILIZER = 12;

const tool = (o: Partial<ToolPen> = {}): ToolPen => ({ size: false, opacity: false, flow: false, tilt: false, stabilizer: DEFAULT_STABILIZER, stabMode: 'string', ...o });

export const DEFAULT_PEN: PenSettings = {
  pen: { curve: CURVE_PRESETS.normal, min: 0, max: 1, tiltAmount: 60, eraserEnd: true, barrel1: 'eyedropper', barrel2: 'pan', swapButtons: false },
  touch: { oneFinger: 'draw', twoFingers: true, palmRejection: true },
  tools: { brush: tool(), pencil: tool(), eraser: tool(), spray: tool({ flow: true }), shade: tool(), dither: tool() },
  seen: false,
};

export const PEN_KEY = 'frameling.pen.v1';

const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const oneOf = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);

/** Saved settings made safe: anything missing or odd falls back to the default. */
export function cleanPen(raw: unknown): PenSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const d = DEFAULT_PEN;
  const p = r.pen ?? {};
  const t = r.touch ?? {};
  const range = cleanRange(p.min, p.max);
  const actions = BARREL_ACTIONS.map((a) => a.id);
  const tools = {} as Record<PenTool, ToolPen>;
  const rt = (r.tools ?? {}) as Record<string, Record<string, unknown> | undefined>;
  for (const k of PEN_TOOLS) {
    const s = rt[k] ?? {};
    const def = d.tools[k];
    tools[k] = {
      size: bool(s.size, def.size),
      opacity: bool(s.opacity, def.opacity),
      flow: bool(s.flow, def.flow),
      tilt: bool(s.tilt, def.tilt),
      stabilizer: Math.round(num(s.stabilizer, def.stabilizer, 0, 100)),
      stabMode: oneOf(s.stabMode, ['string', 'average'] as const, def.stabMode),
    };
  }
  return {
    pen: {
      curve: cleanCurve(p.curve as Partial<Curve> | undefined, d.pen.curve),
      min: range.min,
      max: range.max,
      tiltAmount: Math.round(num(p.tiltAmount, d.pen.tiltAmount, 0, 100)),
      eraserEnd: bool(p.eraserEnd, d.pen.eraserEnd),
      barrel1: oneOf(p.barrel1, actions, d.pen.barrel1),
      barrel2: oneOf(p.barrel2, actions, d.pen.barrel2),
      swapButtons: bool(p.swapButtons, d.pen.swapButtons),
    },
    touch: {
      oneFinger: oneOf(t.oneFinger, ['draw', 'pan', 'off'] as const, d.touch.oneFinger),
      twoFingers: bool(t.twoFingers, d.touch.twoFingers),
      palmRejection: bool(t.palmRejection, d.touch.palmRejection),
    },
    tools,
    seen: typeof (r as { seen?: unknown }).seen === 'boolean' ? ((r as { seen?: boolean }).seen as boolean) : false,
  };
}

export const penStore: MiniStore<PenSettings> = createStore<PenSettings>(cleanPen(readJson<unknown>(PEN_KEY, null)));

function save(next: PenSettings): void {
  penStore.set(next);
  writeJson(PEN_KEY, next);
}

export const getPen = (): PenSettings => penStore.get();

export function setPenDevice(patch: Partial<PenDevice>): void {
  save(cleanPen({ ...getPen(), pen: { ...getPen().pen, ...patch } }));
}
export function setTouch(patch: Partial<TouchDevice>): void {
  save(cleanPen({ ...getPen(), touch: { ...getPen().touch, ...patch } }));
}
export function setToolPen(id: PenTool, patch: Partial<ToolPen>): void {
  const cur = getPen();
  save(cleanPen({ ...cur, tools: { ...cur.tools, [id]: { ...cur.tools[id], ...patch } } }));
}
export function resetPen(): void {
  save({ ...DEFAULT_PEN, seen: getPen().seen });
}
/** Remembers that a pen has been used, so the tool options show their pen section. Once only. */
export function markPenSeen(): void {
  if (!getPen().seen) save({ ...getPen(), seen: true });
}
