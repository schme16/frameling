// Position and size for whatever is selected: X, Y, Width, Height, Turn and Slant for shapes, and the same in whole
// pixels of the art for selected pixels, doing what dragging the handles does (see src/select/numbers.ts for what each
// number means). A lone symbol gets its own boxes (its scale and angle are kept, so they show as numbers). It is the
// body of the Position and size section of Properties; the section's heading comes from the panel.
import { useState } from 'react';
import type { InstanceShape } from '../core/format';
import { celAt, findLayer } from '../core/doc';
import { useStore } from '../core/store';
import { instanceAt, isInstance } from '../core/symbols';
import { Tip } from '../canvas/controls';
import { ActionButton } from '../canvas/controls';
import { instanceBounds } from '../canvas/geometry';
import { docDpi, formatSize } from '../core/units';
import { usePrefs } from '../ui/prefs';
import { resetTransform, updateInstances } from './ops';
import { moveBoxTo, sizeBoxTo, slantBoxBy, turnBoxBy } from '../select/numbers';
import { changeShapes, movePixelsTo, pixelBox, shapeBox, sizePixelsTo, turnPixelsBy } from '../select/numbers-ops';
import { usePixelSelectionVersion } from '../select/pixel-state';
import { LengthNum, Num } from './Num';
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
    <div className="sy-section">
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
    </div>
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
    <div className="sy-section">
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
    </div>
  );
}

/** How big a symbol is on the page, in the chosen unit. */
function SizeOnPage({ inst }: { inst: InstanceShape }) {
  const unit = usePrefs((p) => p.units);
  const doc = useStore((s) => s.doc);
  const b = instanceBounds(inst, doc);
  return <p className="sy-size">Size on the page: {formatSize(b.w, b.h, unit, docDpi(doc))}</p>;
}

/** A lone symbol keeps its scale and angle, so its boxes show them (size as a percentage of the drawing inside). */
function SymbolNumbers({ inst }: { inst: InstanceShape }) {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const layer = findLayer(doc, useStore((s) => s.ui.activeLayerId));
  const cel = layer ? celAt(layer, frame) : undefined;
  // Mid-tween the canvas shows the in-between, but the numbers belong to the key.
  const between = layer && cel && cel.tween && frame > cel.start && instanceAt(doc, layer, frame, inst.id) !== inst ? cel.start : null;
  const t = inst.transform;
  const set = (label: string, key: string, fn: (s: InstanceShape) => void) => updateInstances(label, fn, { coalesce: `inst-${key}-${inst.id}` });
  return (
    <div className="sy-section">
      {between !== null && <Tip stays>You're between two keys, looking at an in-between. Changes go to the key on frame {between + 1}.</Tip>}
      <div className="sy-grid">
        <LengthNum label="X" px={t.x} onPx={(v) => set('Move', 'x', (s) => void (s.transform.x = v))} />
        <LengthNum label="Y" px={t.y} onPx={(v) => set('Move', 'y', (s) => void (s.transform.y = v))} />
        <Num label="Width" suffix="%" value={t.scaleX * 100} onChange={(v) => set('Resize', 'sx', (s) => void (s.transform.scaleX = v / 100))} title="Size across (scale X)" />
        <Num label="Height" suffix="%" value={t.scaleY * 100} onChange={(v) => set('Resize', 'sy', (s) => void (s.transform.scaleY = v / 100))} title="Size up and down (scale Y)" />
        <Num label="Turn" suffix="°" value={t.rotation} onChange={(v) => set('Turn', 'rot', (s) => void (s.transform.rotation = v))} title="Rotation, in degrees" />
        <Num label="Slant" suffix="°" value={t.skew} onChange={(v) => set('Slant', 'skew', (s) => void (s.transform.skew = v))} title="Skew, in degrees" />
      </div>
      <SizeOnPage inst={inst} />
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => resetTransform()}>Reset size and turn</ActionButton>
      </div>
    </div>
  );
}

/** The Position and size section of Properties: boxes for the selection, whatever it is (shapes, a symbol or pixels). */
export function PositionPanel() {
  const layerKind = useStore((s) => s.doc.layers.find((l) => l.id === s.ui.activeLayerId)?.kind);
  // Re-read when the drawing or the selection changes.
  useStore((s) => s.doc);
  useStore((s) => s.ui.selection);
  useStore((s) => s.ui.frame);
  let body = null;
  if (layerKind === 'pixel') body = <PixelNumbers />;
  else {
    const t = selectionTarget();
    const only = t?.originals.length === 1 ? t.originals[0] : undefined;
    if (t) body = only && isInstance(only) ? <SymbolNumbers inst={only} /> : <ShapeNumbers />;
  }
  return (
    <div className="cv-options sy-props" data-help="selection-numbers">
      {body ?? <Tip stays>Select something on the canvas to place it exactly.</Tip>}
    </div>
  );
}
