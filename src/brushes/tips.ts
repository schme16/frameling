// Brush tips in use: picking one, changing it, and making a brush from a selection. The picture of the options is
// TipOptions.tsx; what a tip draws is in src/geometry. Everything here works on the brush in use (`ui.brush`), so a saved
// brush picks its tip up with the rest of its settings.
import { registerChoice, withChoice } from '../core/choices';
import type { BrushSettings, BrushTip, StampShape, TipKind } from '../core/format';
import { store } from '../core/store';
import { activeLayer, activeDrawing } from '../tools/edit';
import { getToolSettings, setToolSettings } from '../tools/settings';
import { pickTool } from '../tools/pick';
import { showPanel } from '../ui/dock';
import { toast } from '../ui/toast';
import { activePixelDrawing, activePixelGrid, pixelSelection } from '../select/pixel-state';
import { gridPixels } from '../core/pixelBounds';
import { defaultTip, STAMPS, TIPS } from '../geometry/tip';
import { MAX_STAMP, hasColours, pixelStampFrom, readPixelStamp, vectorStampFrom, type PixelStamp } from './stamps';
import { choiceWord } from '../words/choices';

export type PixelStampColours = 'own' | 'mine';

registerChoice<PixelStampColours>({
  id: 'brush.pixelStampColours',
  title: choiceWord('choice.brush.pixelStampColours.title'),
  question: choiceWord('choice.brush.pixelStampColours.question'),
  options: [
    { value: 'own', label: choiceWord('choice.brush.pixelStampColours.own.label'), detail: choiceWord('choice.brush.pixelStampColours.own.detail'), did: choiceWord('choice.brush.pixelStampColours.own.did') },
    { value: 'mine', label: choiceWord('choice.brush.pixelStampColours.mine.label'), detail: choiceWord('choice.brush.pixelStampColours.mine.detail'), did: choiceWord('choice.brush.pixelStampColours.mine.did') },
  ],
  default: 'own',
  category: 'Drawing',
  help: 'brush-tips',
});

function setBrush(f: (b: BrushSettings) => BrushSettings): void {
  store().setUi((u) => ({ brush: f(u.brush) }));
}

export const currentTip = (): BrushTip | undefined => store().get().ui.brush.tip;

/** The custom stamp last made, so picking Stamp again brings it back rather than losing it. */
let lastCustom: number[][] | null = null;

/** Gives the brush a tip of this kind with its usual settings (null = a plain line). */
export function setTipKind(kind: TipKind | null): void {
  setBrush((b) => {
    if (!kind) {
      const { tip: _t, ...rest } = b;
      return rest;
    }
    if (b.tip?.kind === kind) return b;
    const tip = defaultTip(kind);
    if (kind === 'stamp' && lastCustom) return { ...b, tip: { ...tip, shape: 'custom', custom: lastCustom, angle: 'upright' } };
    return { ...b, tip };
  });
}

/** Changes some settings of the tip in use. Nothing happens on a plain line. */
export function patchTip(patch: Partial<BrushTip>): void {
  setBrush((b) => (b.tip ? { ...b, tip: { ...b.tip, ...patch } } : b));
}

/** Picks the stamp shape, and turns the stamps the way that shape usually goes. */
export function setStampShape(shape: StampShape): void {
  const usual = STAMPS.find((s) => s.id === shape)?.angle ?? 'upright';
  patchTip(shape === 'custom' ? { shape } : { shape, angle: usual });
}

/** The next (or previous) tip: Plain, then each kind. */
export function stepTip(by: 1 | -1): void {
  const order: (TipKind | null)[] = [null, ...TIPS.map((t) => t.id)];
  const now = currentTip()?.kind ?? null;
  const i = order.indexOf(now);
  const next = order[(i + by + order.length) % order.length];
  setTipKind(next);
  toast(next ? (TIPS.find((t) => t.id === next)?.label ?? 'Tip') : 'Plain tip', { duration: 1400 });
}

function showOptions(): void {
  pickTool('brush');
  showPanel('tool-options');
}

const warn = (message: string): false => {
  toast(message, { kind: 'warn' });
  return false;
};

/** Makes a brush from what is selected: a stamp on a drawing layer, a small picture on a pixel layer. Says what happened. */
export function makeBrushFromSelection(): boolean {
  const { layer } = activeLayer();
  if (!layer) return warn('Pick a layer with something selected on it first.');
  if (layer.kind === 'pixel') return makePixelBrush();
  if (layer.kind !== 'vector') return warn('Brushes can be made from a drawing layer or a pixel layer.');
  return makeVectorBrush();
}

function makeVectorBrush(): boolean {
  const { ui } = store().get();
  const d = activeDrawing();
  const ids = new Set(ui.selection);
  const picked = d && d.kind === 'vector' ? d.shapes.filter((s) => ids.has(s.id)) : [];
  if (!picked.length) return warn('Select the shapes you want to stamp first (the Select tool, V), then make the brush.');
  const r = vectorStampFrom(picked);
  if (!r) return warn('There is nothing in that selection to make a brush from. Text and symbols can\'t be stamps.');
  lastCustom = r.rings;
  const before = ui.brush;
  const size = Math.min(120, Math.max(4, Math.round(r.side)));
  store().setUi((u) => ({ brush: { ...u.brush, size, thinning: 0, tip: { ...defaultTip('stamp'), shape: 'custom', custom: r.rings, angle: 'upright', spacing: 1.25, jitter: 0.15, scatter: 0.1 } } }));
  showOptions();
  const left = r.skipped ? ` ${r.skipped} could not be used.` : '';
  toast(`Made a brush from your selection. Draw to stamp it along a line.${left}`, {
    kind: 'success',
    action: { label: 'Undo', run: () => store().setUi({ brush: before }) },
  });
  return true;
}

function makePixelBrush(): boolean {
  const a = activePixelGrid();
  const m = pixelSelection();
  if (!a || !m) return warn('Select some pixels first (the Select tool), then make the brush.');
  const dr = activePixelDrawing();
  const pixels = dr ? gridPixels(dr, a.width, a.height) : new Uint8ClampedArray(a.width * a.height * 4);
  const first = pixelStampFrom(pixels, a.width, m, false);
  if (!first.ok) return warn(first.why === 'big' ? `That selection is too big for a brush. Brushes can be up to ${MAX_STAMP} by ${MAX_STAMP} pixels.` : 'Nothing is drawn in that selection, so there is no brush to make. Select some pixels with colour in them.');
  const before = getToolSettings().pixelStamp;
  const finish = (keep: boolean) => {
    const r = pixelStampFrom(pixels, a.width, m, keep);
    if (!r.ok) return;
    setToolSettings({ pixelStamp: r.stamp });
    showOptions();
    toast(r.stamp.keep ? 'Made a brush from your selection. Click to stamp it; drag to lay copies side by side.' : 'Made a brush from your selection, painting in your colour.', {
      kind: 'success',
      action: { label: 'Undo', run: () => setToolSettings({ pixelStamp: before }) },
    });
  };
  // More than one colour in it: ask once whether it keeps them, then remember.
  withChoice<PixelStampColours>('brush.pixelStampColours', (v) => finish(v === 'own'), { matters: hasColours(first.stamp) });
  return true;
}

/** The pixel brush made from a selection, if there is one. */
export const pixelBrushStamp = (): PixelStamp | null => readPixelStamp(getToolSettings().pixelStamp);

/** Back to the square or round pixel brush. */
export function clearPixelStamp(): void {
  setToolSettings({ pixelStamp: null });
}

/** Switches a picture brush between its own colours and the colour you picked. */
export function setPixelStampKeep(keep: boolean): void {
  const st = pixelBrushStamp();
  if (st) setToolSettings({ pixelStamp: { ...st, keep: keep && hasColours(st) } });
}
