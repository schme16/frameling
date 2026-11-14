/**
 * The paint bucket's options: a small module-level state (the Tool options panel and the tool both read it), a
 * React hook, and the options component. No JSX here (plain `.ts`), so it uses createElement.
 */
import { createElement as h, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from '../core/store';
import { findLayer } from '../core/doc';
import '../geometry/fill.css';
import { DrawModeToggle } from './options/DrawModeToggle';
import { Slider } from '../canvas/controls';
import { usePixelSettings } from '../pixel/settings';

export type GapPreset = 'none' | 'small' | 'medium' | 'large';

export interface FillOptions {
  /** How big a gap in the lines still counts as closed. */
  gap: GapPreset;
  /** Put the new paint above the lines instead of tucked under them (vector layers). */
  onTop: boolean;
  /** Recolour every pixel of the clicked colour, not just the connected area (pixel layers). */
  allOfColour: boolean;
  /** See lines on every visible layer, not just the selected one (paint on its own layer under the line art). */
  allLayers: boolean;
  /** Pixel layers: how alike a colour has to be to count as the clicked one, 0 (exact) to 100 percent. */
  tolerance: number;
}

/** A Colour match percentage as a per channel difference, 0 to 255, the same scale the Magic wand uses. */
export function toleranceBytes(percent: number): number {
  return (Math.max(0, Math.min(100, percent)) / 100) * 255;
}

/**
 * The widest gap each preset closes, in document pixels (so it means the same thing at any zoom). They are scaled
 * a little with the brush size, because a chunky brush leaves chunkier gaps.
 */
export const GAP_PRESETS: Record<GapPreset, { label: string; width: number; tip: string }> = {
  none: { label: 'None', width: 0, tip: 'Only fill areas whose lines really meet' },
  small: { label: 'Small', width: 10, tip: 'Close gaps about as wide as a pencil line' },
  medium: { label: 'Medium', width: 24, tip: 'Close gaps a few lines wide' },
  large: { label: 'Large', width: 48, tip: 'Close big gaps. Tiny shapes may merge with their neighbours' },
};
const ORDER: GapPreset[] = ['none', 'small', 'medium', 'large'];

/** The gap width for a preset at the current brush size, in document pixels. */
export function gapWidth(preset: GapPreset, brushSize: number): number {
  const base = GAP_PRESETS[preset].width;
  if (!base) return 0;
  const k = Math.max(0.75, Math.min(2, Math.sqrt(Math.max(1, brushSize) / 8)));
  return Math.round(base * k);
}

let state: FillOptions = { gap: 'small', onTop: false, allOfColour: false, allLayers: false, tolerance: 0 };
const listeners = new Set<() => void>();

export function getFillOptions(): FillOptions {
  return state;
}
export function setFillOptions(patch: Partial<FillOptions>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** The options, re-rendering when they change. */
export function useFillOptions(): FillOptions {
  return useSyncExternalStore(subscribe, getFillOptions);
}

function check(label: string, tip: string, on: boolean, change: (v: boolean) => void): ReactNode {
  return h(
    'label',
    { className: 'fl-fill-check', title: tip, key: label },
    h('input', { type: 'checkbox', checked: on, onChange: (e) => change(e.target.checked) }),
    h('span', null, label),
  );
}

/** The Tool options panel content for the paint bucket. */
export function FillOptionsPanel(): ReactNode {
  const o = useFillOptions();
  const kind = useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind ?? 'vector');
  const pixel = kind === 'pixel';
  const mirrorOn = usePixelSettings((s) => s.symmetry !== 'off');
  return h(
    'div',
    { className: 'fl-fill-options' },
    pixel
      ? [
          check(
            'Use lines from all layers',
            'Fill areas closed in by whatever is drawn on any other visible layer. Handy for keeping colour on its own layer under your line art.',
            o.allLayers,
            (v) => setFillOptions({ allLayers: v }),
          ),
          h(Slider, {
            key: 'match',
            label: 'Colour match',
            value: o.tolerance,
            min: 0,
            max: 100,
            format: (v: number) => (v === 0 ? 'Exact colour' : `Close colours (${v}%)`),
            onChange: (v: number) => setFillOptions({ tolerance: v }),
            hint: 'How alike a colour has to be to get filled too. Exact fills only the very same colour (tolerance).',
          }),
          check('Fill all of this colour', 'Recolour every pixel with the colour you click, even where it is not joined up', o.allOfColour, (v) => setFillOptions({ allOfColour: v })),
        ]
      : [
          h(DrawModeToggle, { key: 'mode' }),
          h(
            'div',
            { className: 'fl-fill-group', key: 'gap' },
            h('div', { className: 'fl-fill-label', id: 'fl-fill-gap-label' }, 'Close gaps'),
            h(
              'div',
              { className: 'fl-fill-seg', role: 'radiogroup', 'aria-labelledby': 'fl-fill-gap-label', 'data-quest': 'close-gaps' },
              ORDER.map((p) =>
                h(
                  'button',
                  {
                    key: p,
                    type: 'button',
                    role: 'radio',
                    'aria-checked': o.gap === p,
                    className: 'fl-fill-seg-btn',
                    title: GAP_PRESETS[p].tip,
                    onClick: () => setFillOptions({ gap: p }),
                  },
                  GAP_PRESETS[p].label,
                ),
              ),
            ),
            h('div', { className: 'fl-fill-note' }, 'Lets you fill shapes whose lines do not quite meet.'),
          ),
          check('Fill on top', 'Put the colour above your lines instead of behind them', o.onTop, (v) => setFillOptions({ onTop: v })),
          check(
            'Use lines from all layers',
            'Fill areas closed in by lines on any visible layer. Handy for keeping colour on its own layer under your line art.',
            o.allLayers,
            (v) => setFillOptions({ allLayers: v }),
          ),
          mirrorOn && h('div', { className: 'fl-fill-note', key: 'mirror' }, "Mirror drawing doesn't reach the bucket. It fills just where you click."),
        ],
  );
}
