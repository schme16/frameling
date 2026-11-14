// Position and size for a plain selection: X, Y, Width, Height, Turn and Slant for shapes, and the same in whole
// pixels of the art for selected pixels. The same boxes a symbol has, doing what dragging the handles does (see
// src/select/numbers.ts for what each number means).
import { useState } from 'react';
import { useStore } from '../core/store';
import { isInstance } from '../core/symbols';
import { Tip } from '../canvas/controls';
import { moveBoxTo, sizeBoxTo, slantBoxBy, turnBoxBy } from '../select/numbers';
import { changeShapes, movePixelsTo, pixelBox, shapeBox, sizePixelsTo, turnPixelsBy } from '../select/numbers-ops';
import { usePixelSelectionVersion } from '../select/pixel-state';
import { LengthNum, Num, Section } from './Num';
import { selectionTarget } from '../tools/select-land';

// Kept for the session, so a second shape sizes the way the last one did.
let keepProportions = true;

function KeepProportions({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="sy-keep" title="Typing a width also sets the height, and the other way round, so the shape doesn't squash">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>Keep proportions</span>
    </label>
  );
}

function ShapeNumbers() {
  const [keep, setKeep] = useState(keepProportions);
  const b = shapeBox();
  if (!b) return null;
  const set = (label: string, key: string, make: Parameters<typeof changeShapes>[2]) => void changeShapes(label, key, make);
  return (
    <Section title="Position and size">
      <div className="sy-grid">
        <LengthNum label="X" px={b.x} commit="enter" title="Where the left edge of the selection is" onPx={(v) => set('Move', 'x', (box) => moveBoxTo(box, v, null))} />
        <LengthNum label="Y" px={b.y} commit="enter" title="Where the top edge of the selection is" onPx={(v) => set('Move', 'y', (box) => moveBoxTo(box, null, v))} />
        <LengthNum label="Width" px={b.w} commit="enter" title="How wide the selection is" onPx={(v) => set('Resize', 'w', (box) => sizeBoxTo(box, v, null, keep))} />
        <LengthNum label="Height" px={b.h} commit="enter" title="How tall the selection is" onPx={(v) => set('Resize', 'h', (box) => sizeBoxTo(box, null, v, keep))} />
        <Num label="Turn by" suffix="°" value={0} commit="enter" title="Turn the selection by this many degrees from where it is now (clockwise), about its middle" onChange={(v) => set('Turn', 'turn', (box) => turnBoxBy(box, v))} />
        <Num label="Slant by" suffix="°" value={0} commit="enter" title="Slant the selection sideways by this many degrees from where it is now, about its middle" onChange={(v) => set('Slant', 'slant', (box) => slantBoxBy(box, v))} />
      </div>
      <KeepProportions
        on={keep}
        set={(v) => {
          keepProportions = v;
          setKeep(v);
        }}
      />
      <Tip>X and Y are the left and top of the selection's box. Turn and Slant go by the amount you type, from where the shapes are now.</Tip>
    </Section>
  );
}

function PixelNumbers() {
  const [keep, setKeep] = useState(keepProportions);
  usePixelSelectionVersion();
  const b = pixelBox();
  if (!b) return null;
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  return (
    <Section title="Position and size (pixels)">
      <div className="sy-grid">
        <Num label="X" value={b.x0} commit="enter" title="Which column of the art the selection starts at (0 is the left edge)" onChange={(v) => void movePixelsTo(v, null)} />
        <Num label="Y" value={b.y0} commit="enter" title="Which row of the art the selection starts at (0 is the top edge)" onChange={(v) => void movePixelsTo(null, v)} />
        <Num label="Width" value={w} commit="enter" title="How many pixels wide the selection is" onChange={(v) => void sizePixelsTo(v, null, keep)} />
        <Num label="Height" value={h} commit="enter" title="How many pixels tall the selection is" onChange={(v) => void sizePixelsTo(null, v, keep)} />
        <Num label="Turn by" suffix="°" value={0} commit="enter" title="Turn the selected pixels by this many degrees, clockwise, without blurring them" onChange={(v) => void turnPixelsBy(v)} />
      </div>
      <KeepProportions
        on={keep}
        set={(v) => {
          keepProportions = v;
          setKeep(v);
        }}
      />
      <Tip>These count whole pixels of the art, not of the page: X 3 is the fourth column of the sprite, however big it's zoomed or scaled. Pixels can be moved, stretched and turned here, but not slanted, which would smear them.</Tip>
    </Section>
  );
}

/** The boxes for the selection, if it is shapes (not a lone symbol, which has its own) or pixels. */
export function SelectionNumbers() {
  const layerKind = useStore((s) => s.doc.layers.find((l) => l.id === s.ui.activeLayerId)?.kind);
  // Re-read when the drawing or the selection changes.
  useStore((s) => s.doc);
  useStore((s) => s.ui.selection);
  useStore((s) => s.ui.frame);
  if (layerKind === 'pixel') return <PixelNumbers />;
  const t = selectionTarget();
  if (!t || (t.originals.length === 1 && isInstance(t.originals[0]))) return null;
  return <ShapeNumbers />;
}
