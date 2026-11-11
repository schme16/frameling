/**
 * Pixel art commands: flip and turn the drawing, add an outline, the palette lock and "Reduce to palette", mirror
 * drawing, and changing the document palette (which can recolour the pixels that use a colour).
 */
import type { Draft } from 'immer';
import { registerChoice, withChoice } from '../core/choices';
import type { Doc, DocPalette, PixelDrawing } from '../core/format';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { parseHex } from '../canvas/colors';
import { hint } from '../canvas/controller';
import { activeDrawing, activeLayer, editActiveDrawing, EDIT_HINTS } from '../tools/edit';
import { docPalette, paletteRgb, reduceToPalette, remapColor, usesColor } from './palette';
import { getPixelSettings, setPixelSettings, type SymmetryMode } from './settings';
import { activePixelLayer } from './tools';
import { flipH, flipV, outline, rotateQuarter, type Img } from './transform';
import { dropFloating, isFloating, pixelSelection, setPixelSelection } from '../select/pixel-state';
import { applyInSelection, type PixelOp, type SelectionKind } from '../select/ops';

// ---------------------------------------------------------------- the document palette

/** Replaces the document palette (one undo step; `coalesce` merges a burst of edits). */
export function setDocPalette(p: DocPalette, label = 'Change palette', coalesce?: string): void {
  store().update(label, (d) => void (d.palette = p as Draft<DocPalette>), coalesce ? { coalesce } : {});
}

export type RecolourChoice = 'recolour' | 'palette-only';

registerChoice<RecolourChoice>({
  id: 'palette.recolour',
  title: 'Changing a palette colour',
  question: 'You changed a colour in the palette. Should the pixels already painted in that colour change too?',
  options: [
    { value: 'recolour', label: 'Change the pixels too', detail: 'Every pixel of the old colour, on every pixel layer and frame, becomes the new colour. Great for trying out colour schemes.' },
    { value: 'palette-only', label: 'Just the palette', detail: 'Your drawing stays as it is. Only the palette changes.' },
  ],
  default: 'recolour',
  category: 'Pixel art',
  help: 'palette',
});

/** Every pixel of `from` turned into `to`, on every pixel drawing in the document. Pure, for tests. */
export function recolourDoc(doc: Draft<Doc>, from: string, to: string): number {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return 0;
  let n = 0;
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'pixel') continue;
    const out = remapColor(d.pixels as Uint8ClampedArray, [a[0], a[1], a[2]], [b[0], b[1], b[2]]);
    if (out) {
      (d as Draft<PixelDrawing>).pixels = out;
      n++;
    }
  }
  return n;
}

/** Changes one palette colour, and (asked the first time) the pixels painted in it. One undo step. */
export function changePaletteColor(index: number, color: string): void {
  const doc = store().get().doc;
  const p = docPalette(doc);
  const old = p.colors[index];
  if (!old || old.toLowerCase() === color.toLowerCase()) return;
  const next: DocPalette = { ...p, colors: p.colors.map((c, i) => (i === index ? color : c)) };
  const [r, g, b] = rgb3(old);
  const usesOld = Object.values(doc.drawings).some((d) => d.kind === 'pixel' && usesColor(d.pixels, r, g, b));
  const apply = (recolour: boolean) =>
    store().update('Change palette colour', (d) => {
      d.palette = next as Draft<DocPalette>;
      if (recolour) recolourDoc(d, old, color);
    });
  if (!usesOld) return apply(false);
  withChoice<RecolourChoice>('palette.recolour', (v) => apply(v === 'recolour'));
}

const rgb3 = (c: string): [number, number, number] => {
  const v = parseHex(c) ?? [0, 0, 0, 255];
  return [v[0], v[1], v[2]];
};

// ---------------------------------------------------------------- whole drawing operations

/**
 * What a pixel operation would make of a drawing: on the selected pixels when there's a selection (`kind` says how,
 * see src/select/ops.ts), else on the whole drawing. Also the selection afterwards (it turns with the pixels).
 */
export function pixelsAfter(d: Img, op: PixelOp, kind: SelectionKind = 'clip'): { pixels: Uint8ClampedArray; mask: ReturnType<typeof pixelSelection> } | null {
  const m = pixelSelection();
  if (m && m.width === d.width && m.height === d.height) return applyInSelection(d, m, kind, op);
  const out = op(d);
  return out ? { pixels: out, mask: null } : null;
}

/** Runs a pixel operation on the active drawing (or just its selected pixels), with friendly words when there's nothing to work on. */
export function editPixels(label: string, op: PixelOp, kind: SelectionKind = 'clip'): boolean {
  // Pixels being moved land first, so the operation sees them where they are.
  if (isFloating()) dropFloating();
  const { layer, problem } = activeLayer();
  if (problem) {
    hint(EDIT_HINTS[problem]);
    return false;
  }
  if (!layer || layer.kind !== 'pixel') {
    hint(`${label} works on pixel layers. Pick a pixel layer in the timeline first.`);
    return false;
  }
  const d = activeDrawing();
  if (!d || d.kind !== 'pixel') {
    hint('There is nothing drawn on this frame yet.');
    return false;
  }
  const res = pixelsAfter(d, op, kind);
  if (!res) return false;
  const out = res.pixels;
  const r = editActiveDrawing(label, 'pixel', (dr) => void (dr.pixels = out));
  if (r !== 'ok') hint(EDIT_HINTS[r]);
  else if (res.mask) setPixelSelection(res.mask);
  return r === 'ok';
}

const pixelOnly = () => !!activePixelLayer();

export function addOutline(where: 'outside' | 'inside'): boolean {
  const c = parseHex(store().get().ui.color);
  if (!c) return false;
  const layer = activePixelLayer();
  const pal = layer?.paletteLock ? docPalette(store().get().doc) : null;
  const color = pal ? snap(c, pal) : c;
  return editPixels(
    where === 'outside' ? 'Add outline' : 'Add inside outline',
    (d) => {
      const r = outline(d, color, where, getPixelSettings().outlineCorners);
      if (!r.changed) {
        hint('Nothing to outline here. Draw something first, or it already has that outline.');
        return null;
      }
      return r.pixels;
    },
    'outline',
  );
}

function snap(c: readonly [number, number, number, number], p: DocPalette): [number, number, number, number] {
  const rgb = paletteRgb(p.colors);
  const r = reduceToPalette(new Uint8ClampedArray([c[0], c[1], c[2], 255]), rgb).pixels;
  return [r[0], r[1], r[2], 255];
}

export function reduceActiveToPalette(): boolean {
  const p = docPalette(store().get().doc);
  if (!p.colors.length) {
    hint('The palette is empty. Add some colours to it first.');
    return false;
  }
  return editPixels('Reduce to palette', (d) => {
    const r = reduceToPalette(d.pixels, paletteRgb(p.colors));
    if (!r.changed) {
      hint('Every pixel already uses a palette colour.');
      return null;
    }
    return r.pixels;
  });
}

/** Turns the palette lock on or off for the active pixel layer; turning it on offers to reduce what's there. */
export function togglePaletteLock(): void {
  const layer = activePixelLayer();
  if (!layer) return hint('The palette lock is for pixel layers. Pick a pixel layer in the timeline first.');
  const on = !layer.paletteLock;
  store().update(on ? 'Lock layer to palette' : 'Unlock layer from palette', (d) => {
    const l = d.layers.find((x) => x.id === layer.id);
    if (l && l.kind === 'pixel') {
      if (on) l.paletteLock = true;
      else delete l.paletteLock;
    }
  });
  hint(on ? 'Palette lock on: everything you paint on this layer snaps to the palette.' : 'Palette lock off: paint with any colour.');
}

const MIRROR_ORDER: SymmetryMode[] = ['off', 'h', 'v', 'both'];
const MIRROR_WORDS: Record<SymmetryMode, string> = { off: 'Mirror drawing off', h: 'Mirror drawing: left and right', v: 'Mirror drawing: top and bottom', both: 'Mirror drawing: both ways' };

export function cycleMirror(): void {
  const cur = getPixelSettings().symmetry;
  const next = MIRROR_ORDER[(MIRROR_ORDER.indexOf(cur) + 1) % MIRROR_ORDER.length];
  setPixelSettings({ symmetry: next });
  hint(MIRROR_WORDS[next]);
}

registerCommands([
  {
    id: 'pixel.flipH',
    label: 'Flip drawing left to right',
    category: 'Pixel',
    description: 'Mirror the pixels on this frame (or just the selected ones), around the middle of what is drawn.',
    help: 'pixel-flip-rotate',
    keywords: ['flip', 'mirror', 'horizontal', 'reverse', 'turn around', 'face the other way'],
    enabled: pixelOnly,
    run: () => void editPixels('Flip left to right', (d, box) => flipH(d, box ?? 'content'), 'transform'),
  },
  {
    id: 'pixel.flipV',
    label: 'Flip drawing upside down',
    category: 'Pixel',
    description: 'Flip the pixels on this frame top to bottom.',
    help: 'pixel-flip-rotate',
    keywords: ['flip', 'vertical', 'upside down'],
    enabled: pixelOnly,
    run: () => void editPixels('Flip upside down', (d, box) => flipV(d, box ?? 'content'), 'transform'),
  },
  {
    id: 'pixel.rotateRight',
    label: 'Turn drawing right (90°)',
    category: 'Pixel',
    description: 'A quarter turn clockwise. Exact: no pixel changes colour.',
    help: 'pixel-flip-rotate',
    keywords: ['rotate', 'turn', 'clockwise', '90'],
    enabled: pixelOnly,
    run: () => void editPixels('Turn right', (d, box) => rotateQuarter(d, 1, box), 'transform'),
  },
  {
    id: 'pixel.rotateLeft',
    label: 'Turn drawing left (90°)',
    category: 'Pixel',
    description: 'A quarter turn anticlockwise.',
    help: 'pixel-flip-rotate',
    keywords: ['rotate', 'turn', 'anticlockwise', 'counterclockwise', '90'],
    enabled: pixelOnly,
    run: () => void editPixels('Turn left', (d, box) => rotateQuarter(d, 3, box), 'transform'),
  },
  {
    id: 'pixel.rotate180',
    label: 'Turn drawing round (180°)',
    category: 'Pixel',
    description: 'A half turn.',
    help: 'pixel-flip-rotate',
    keywords: ['rotate', 'turn', '180', 'upside down'],
    enabled: pixelOnly,
    run: () => void editPixels('Turn round', (d, box) => rotateQuarter(d, 2, box), 'transform'),
  },
  {
    id: 'pixel.outline',
    label: 'Add outline (outside)',
    category: 'Pixel',
    description: 'Draws a one pixel outline round everything on this frame, in the stroke colour.',
    help: 'pixel-outline',
    keywords: ['outline', 'border', 'edge', 'stroke', 'sticker'],
    enabled: pixelOnly,
    run: () => void addOutline('outside'),
  },
  {
    id: 'pixel.outlineInside',
    label: 'Add outline (inside the edge)',
    category: 'Pixel',
    description: 'Repaints the outer edge pixels of the drawing in the stroke colour, so it keeps its size.',
    help: 'pixel-outline',
    keywords: ['outline', 'inner', 'inside', 'edge', 'border'],
    enabled: pixelOnly,
    run: () => void addOutline('inside'),
  },
  {
    id: 'pixel.reduceToPalette',
    label: 'Reduce to palette',
    category: 'Pixel',
    description: 'Changes every pixel on this frame to the nearest palette colour.',
    help: 'palette-lock',
    keywords: ['indexed', 'quantise', 'quantize', 'snap', 'palette', 'limit colours'],
    enabled: pixelOnly,
    run: () => void reduceActiveToPalette(),
  },
  {
    id: 'pixel.paletteLock',
    label: 'Lock this layer to the palette',
    category: 'Pixel',
    description: 'Everything painted on the layer snaps to the nearest palette colour (indexed colour).',
    help: 'palette-lock',
    keywords: ['indexed', 'palette', 'lock', 'limit', 'snap'],
    enabled: pixelOnly,
    checked: (s) => {
      const l = s.doc.layers.find((x) => x.id === s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
      return l?.kind === 'pixel' && !!l.paletteLock;
    },
    run: togglePaletteLock,
  },
  {
    id: 'pixel.mirror',
    label: 'Mirror drawing (off, left-right, up-down, both)',
    category: 'Pixel',
    keys: ['Shift+M'],
    description: 'Draw on one side and it appears on the other too. Press again to change direction.',
    help: 'pixel-mirror',
    keywords: ['symmetry', 'mirror', 'symmetrical', 'kaleidoscope'],
    checked: () => getPixelSettings().symmetry !== 'off',
    run: cycleMirror,
  },
]);
