/**
 * Hold to tidy: keep the pen still at the end of a brush or pencil stroke and it becomes a clean line, circle, box or
 * triangle. The shapes are worked out in src/geometry/quickshape.ts; this is the timing, the preview, the undo and the words.
 *
 * It is made to be easy to say no to, because a stroke that was meant to stay wobbly must stay wobbly:
 *  - it only tidies a stroke that fits a shape tightly (anything else is left exactly as drawn);
 *  - it waits until the pen has stayed within a few pixels for a good half second, so slow, careful drawing never trips it;
 *  - the tidy is its own undo step after the stroke, so Ctrl+Z (or the Keep my line button) gives the line back, not nothing;
 *  - Escape while the clean shape is showing drops the whole stroke, as it always has;
 *  - it starts off, and asks the first time (gently, never in the middle of a stroke).
 */
import type { BrushSettings, PathShape, Shape, StrokePoint, StrokeShape } from '../core/format';
import { registerChoice, rememberedChoice, setChoice, withChoice } from '../core/choices';
import { registerCommands, registerHelp } from '../core/registry';
import { store, type State } from '../core/store';
import { toast } from '../ui/toast';
import { dragQuick, quickName, quickPath, recogniseShape, type QPt, type QuickShape } from '../geometry/quickshape';
import { drawShape } from '../core/render';
import { activeDrawing, activeLayer, EDIT_HINTS } from './edit';
import { activeIsMerge, editShapes, selected } from './merge-mode';
import { activeVectorMirror } from './mirror';
import { getToolSettings } from './settings';

// ---------------------------------------------------------------- the feel: every number that matters, named

/**
 * How long the pen has to stay still, in milliseconds, before the stroke is looked at. Most pauses while drawing are a
 * quarter of a second or less (a thought, a re-grip); a deliberate hold is a good half second. 600 is just past the
 * first and comfortably short of the second getting tiring. It is a setting (Hold time), this is its start.
 */
export const HOLD_MS_DEFAULT = 600;
export const HOLD_MS_MIN = 300;
export const HOLD_MS_MAX = 1200;

/**
 * How far the pen may wander, in screen pixels, and still count as still. A resting pen and a mouse shake by a pixel or
 * two; this is a little more than that. It is also what keeps slow drawing safe: to be slow enough to hold still for
 * 600 ms inside 3 pixels you would have to be moving under 5 pixels a second, which is not drawing (careful drawing is
 * 15 to 100 pixels a second).
 */
export const HOLD_SLOP_SCREEN = 3;

/** The words and defaults for the choice. */
export const TIDY_CHOICE = 'draw.holdToTidy';
export type TidyChoice = 'on' | 'off';

registerChoice<TidyChoice>({
  id: TIDY_CHOICE,
  title: 'Hold to tidy',
  question: 'When you hold the pen still at the end of a brush or pencil line, should it turn into a clean line, circle or box?',
  options: [
    { value: 'off', label: 'Leave my lines as I drew them', detail: 'Nothing changes. You can still tidy a line any time with Tidy into a shape.', did: 'Left your line as you drew it. Hold to tidy can turn it into a clean line, circle or box.' },
    { value: 'on', label: 'Tidy them into shapes', detail: 'Hold still for about half a second and a rough circle, box, triangle or straight line becomes a clean one. Undo gives your line back.', did: 'Tidied it into a clean shape.' },
  ],
  default: 'off',
  category: 'Drawing',
  help: 'hold-to-tidy',
  silent: false,
});

export const holdToTidyOn = (): boolean => rememberedChoice(TIDY_CHOICE) === 'on';
/** True while nobody has said yes or no: the first hold on a clear shape asks, after the stroke. */
export const holdToTidyUnasked = (): boolean => rememberedChoice(TIDY_CHOICE) === undefined;

export function holdMs(): number {
  const v = getToolSettings().quickHoldMs;
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(HOLD_MS_MAX, Math.max(HOLD_MS_MIN, v)) : HOLD_MS_DEFAULT;
}

// ---------------------------------------------------------------- knowing the pen has stopped

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/**
 * Fires once when the pen has stayed within `slop` screen pixels of one spot for `ms`. Every move that leaves the spot
 * starts the wait again from the new spot, so slow drawing never fires it.
 */
export class StillWatch {
  private ax = 0;
  private ay = 0;
  private armed = false;
  private handle: unknown = null;
  constructor(
    private ms: number,
    private slop: number,
    private fire: () => void,
    private timers: Timers = realTimers,
  ) {}

  move(x: number, y: number, zoom: number): void {
    if (this.armed && Math.hypot(x - this.ax, y - this.ay) * zoom <= this.slop) return;
    this.ax = x;
    this.ay = y;
    this.armed = true;
    if (this.handle !== null) this.timers.clear(this.handle);
    this.handle = this.timers.set(() => {
      this.handle = null;
      this.fire();
    }, this.ms);
  }

  stop(): void {
    if (this.handle !== null) this.timers.clear(this.handle);
    this.handle = null;
    this.armed = false;
  }
}

// ---------------------------------------------------------------- the shape a stroke becomes

/** The width of the clean line: the brush's size, as thick as the stroke was on average (a pen presses harder and softer). */
export function tidyWidth(brush: Pick<BrushSettings, 'size' | 'thinning'>, points: readonly Pick<StrokePoint, 'p'>[]): number {
  const mean = points.length ? points.reduce((a, p) => a + p.p, 0) / points.length : 0.5;
  const w = brush.size * (1 - brush.thinning * (1 - 2 * mean));
  return Math.max(brush.size * 0.5, Math.min(brush.size * 1.5, w));
}

/** The stroke as an outlined shape of the clean form, keeping its id, lineage, group, colour and see-through. */
export function strokeToShape(s: StrokeShape, q: QuickShape): PathShape {
  const corners = q.kind === 'rect' || q.kind === 'polygon';
  const out: PathShape = {
    id: s.id,
    type: 'path',
    paths: [quickPath(q)],
    fill: null,
    stroke: { color: s.color, width: tidyWidth(s.brush, s.points), join: corners ? 'miter' : 'round', cap: 'round' },
    opacity: s.opacity,
  };
  if (s.origin) out.origin = s.origin;
  if (s.group) out.group = s.group;
  if (s.ext) out.ext = s.ext;
  return out;
}

/** The recognised shape for a stroke's points, with the screen zoom for judging "short". */
export function shapeOfStroke(points: readonly QPt[], zoom: number): QuickShape | null {
  return recogniseShape(points, zoom);
}

/**
 * Swaps the stroke with this id for the clean shape, as one undo step of its own (the stroke itself was already drawn,
 * so undoing the tidy gives the line back). False when the stroke is no longer there to swap.
 */
export function tidyStrokeById(id: string, q: QuickShape, label = 'Tidy into a shape'): boolean {
  let done = false;
  const r = editShapes(label, (before) => {
    const i = before.findIndex((s) => s.id === id && s.type === 'stroke');
    if (i < 0) return null;
    const next = before.slice();
    next[i] = strokeToShape(before[i] as StrokeShape, q);
    done = true;
    return next;
  });
  return done && r === 'ok';
}

/** Says what happened, with a button that takes it back. Undo does the same. */
function announce(q: QuickShape): void {
  const after = store().historyIds().undo;
  toast(`Tidied into ${quickName(q)}.`, {
    duration: 6000,
    action: {
      label: 'Keep my line',
      id: 'keep-my-line',
      // Only if the tidy is still the last thing done.
      run: () => {
        if (store().historyIds().undo === after) store().undo();
      },
    },
  });
}

// ---------------------------------------------------------------- one stroke's hold

export interface HoldHooks {
  /** The stroke's points so far, in document pixels. */
  points(): QPt[];
  /** The screen should redraw the preview. */
  changed(): void;
}

/** Watches one stroke: snaps it when the pen holds still, and lets the pen reshape it until release. */
export class QuickHold {
  private watch: StillWatch;
  /** The clean shape showing now, once the pen has held still. */
  shape: QuickShape | null = null;
  /** What it first snapped to, and where the pen was then, so dragging changes it from there. */
  private base: QuickShape | null = null;
  private from: QPt | null = null;
  /** A clear shape was seen while snapping was off: remembered so the first time can ask, after the stroke. */
  peeked: QuickShape | null = null;

  constructor(
    private hooks: HoldHooks,
    private zoom: number,
    /** `snap`: show the clean shape. `peek`: only notice there was one (nobody has said yes or no yet). */
    private mode: 'snap' | 'peek',
    ms: number = holdMs(),
    timers?: Timers,
  ) {
    this.watch = new StillWatch(ms, HOLD_SLOP_SCREEN, () => this.still(), timers);
  }

  /** Every pen move, including the ones too small to add a point. */
  moved(p: QPt & { shift?: boolean }): void {
    if (this.shape && this.base && this.from) {
      this.shape = dragQuick(this.base, this.from, p, !!p.shift);
      this.hooks.changed();
      return;
    }
    this.last = { x: p.x, y: p.y };
    this.watch.move(p.x, p.y, this.zoom);
  }
  private last: QPt = { x: 0, y: 0 };

  private still(): void {
    const q = shapeOfStroke(this.hooks.points(), this.zoom);
    if (!q) return;
    if (this.mode === 'peek') {
      this.peeked = q;
      return;
    }
    this.shape = q;
    this.base = q;
    this.from = { ...this.last };
    this.hooks.changed();
  }

  /** True once the pen has held and the clean shape is showing. */
  get snapped(): boolean {
    return this.shape !== null;
  }

  stop(): void {
    this.watch.stop();
  }
}

/** What the preview draws: the clean shape in the stroke's own colour and thickness, with a small label by the pen. */
export function drawQuickPreview(g: CanvasRenderingContext2D, stroke: StrokeShape, q: QuickShape, zoom: number): void {
  drawShape(g, strokeToShape(stroke, q));
  const at = q.kind === 'line' ? q.b : q.kind === 'polygon' ? q.pts[0] : { x: q.cx, y: q.cy };
  const px = 1 / zoom;
  g.save();
  g.font = `${12 * px}px system-ui, sans-serif`;
  g.textBaseline = 'middle';
  const words = `${quickName(q)[0].toUpperCase()}${quickName(q).slice(1)}`;
  const w = g.measureText(words).width;
  const x = at.x + 14 * px;
  const y = at.y - 14 * px;
  g.fillStyle = 'rgba(20,18,30,0.82)';
  g.beginPath();
  g.roundRect(x - 6 * px, y - 10 * px, w + 12 * px, 20 * px, 6 * px);
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillText(words, x, y);
  g.restore();
}

// ---------------------------------------------------------------- after the stroke

/**
 * Called when a stroke has been drawn. If the pen held and the clean shape was showing, the stroke is swapped for it
 * (a step of its own). If nobody has chosen yet and the pen held on a clear shape, ask, gently. Returns true when
 * it tidied.
 */
export function afterStroke(strokeId: string, hold: QuickHold | null): boolean {
  if (!hold) return false;
  hold.stop();
  if (hold.shape) {
    const q = hold.shape;
    if (tidyStrokeById(strokeId, q)) {
      announce(q);
      return true;
    }
    return false;
  }
  const seen = hold.peeked;
  if (seen && holdToTidyUnasked()) {
    // Nothing is done now (the line stays as drawn); Change on the toast asks the question, and a Yes tidies this line.
    withChoice<TidyChoice>(
      TIDY_CHOICE,
      (v) => {
        if (v === 'on') {
          if (tidyStrokeById(strokeId, seen)) announce(seen);
        }
      },
      { gently: { undo: () => undefined } },
    );
  }
  return false;
}

/** May a stroke started now be tidied? Not on merge layers (the line is already joined into the paint) or with mirror drawing. */
export function canTidyHere(): boolean {
  const { layer, problem } = activeLayer();
  return !problem && !!layer && layer.kind === 'vector' && !activeIsMerge() && !activeVectorMirror();
}

/** The mode a new stroke should watch in: snap, peek (to ask the first time), or none. */
export function holdModeNow(): 'snap' | 'peek' | null {
  if (!canTidyHere()) return null;
  if (holdToTidyOn()) return 'snap';
  return holdToTidyUnasked() ? 'peek' : null;
}

// ---------------------------------------------------------------- commands

const hasStrokeSelected = (s: State): boolean => {
  void s;
  return selected().some((x) => x.type === 'stroke');
};

/** Tidies every picked brush line that clearly is a shape. Returns how many were. */
export function tidySelected(): number {
  const picked = selected().filter((x): x is StrokeShape => x.type === 'stroke');
  if (!picked.length) return 0;
  const zoom = store().get().ui.zoom || 1;
  const made = new Map<string, QuickShape>();
  for (const s of picked) {
    const q = shapeOfStroke(s.points, zoom);
    if (q) made.set(s.id, q);
  }
  if (!made.size) return 0;
  const r = editShapes('Tidy into a shape', (before) => before.map((s) => (s.type === 'stroke' && made.has(s.id) ? (strokeToShape(s, made.get(s.id)!) as Shape) : s)));
  if (r !== 'ok' && r !== 'nothing') {
    toast(EDIT_HINTS[r]);
    return 0;
  }
  return made.size;
}

registerCommands([
  {
    id: 'draw.holdToTidy',
    label: 'Hold to tidy lines into shapes',
    category: 'Draw',
    description: 'Keep the pen still at the end of a brush or pencil line and it becomes a clean line, circle, box or triangle. Undo gives your line back.',
    help: 'hold-to-tidy',
    keywords: ['quickshape', 'quick shape', 'snap', 'perfect circle', 'perfect line', 'straighten', 'tidy', 'hold', 'shape recognition', 'clean shape', 'procreate'],
    checked: () => holdToTidyOn(),
    run: () => {
      const on = holdToTidyOn();
      setChoice(TIDY_CHOICE, on ? 'off' : 'on');
      toast(on ? 'Hold to tidy is off. Your lines stay as you draw them.' : 'Hold to tidy is on. Keep the pen still at the end of a line, circle or box.');
    },
  },
  {
    id: 'arrange.tidyStroke',
    label: 'Tidy into a shape',
    category: 'Arrange',
    description: 'Turn the picked brush lines into the clean line, circle, box or triangle they were drawn as. A line that is not clearly one is left alone.',
    help: 'hold-to-tidy',
    keywords: ['quickshape', 'snap', 'perfect circle', 'perfect line', 'straighten', 'clean up', 'recognise shape', 'make into circle'],
    enabled: (s) => hasStrokeSelected(s) && activeDrawing()?.kind === 'vector',
    run: () => {
      const n = tidySelected();
      if (n) toast(n === 1 ? 'Tidied into a clean shape.' : `Tidied ${n} lines into clean shapes.`);
      else toast('That doesn’t look clearly like a line, circle, box or triangle, so it stays as you drew it.');
    },
  },
]);

registerHelp({
  id: 'hold-to-tidy',
  title: 'Hold to tidy: perfect circles, boxes and lines',
  section: 'Drawing',
  media: 'hold-to-tidy.mp4',
  summary: 'Keep the pen still at the end of a brush or pencil line and it becomes a clean line, circle, box or triangle.',
  keywords: ['quickshape', 'quick shape', 'snap to shape', 'perfect circle', 'straighten', 'tidy', 'hold', 'recognise shape'],
});
