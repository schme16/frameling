// Tool options for the Pixel brush: the saved brushes first, then the tip, size, spacing and edges (the things you reach
// for), and the shape, scatter and flow folded under them. Says in plain words when a smooth edge is being dithered, and why.
import { findLayer } from '../core/doc';
import { setChoice, useChoice } from '../core/choices';
import { useStore } from '../core/store';
import { ActionButton, Choice, MoreOptions, Slider, Tip, Toggle } from '../canvas/controls';
import { BrushPresetRow } from '../brushes/BrushPresetRow';
import { StampPicture } from '../brushes/PixelStampOptions';
import { makePixelBrush } from '../brushes/tips';
import { hasColours } from '../brushes/stamps';
import { SOFT_EDGE_CHOICE } from '../soft/choices';
import { MirrorOptions } from '../tools/options/MirrorOptions';
import { useToolSettings } from '../tools/settings';
import { PenOptions } from '../tablet/PenOptions';
import { FLOW_RANGE, ROUND_RANGE, SCATTER_RANGE, SIZE_RANGE, SPACING_RANGE, type TipShape } from './maths';
import { setDab, useDab } from './settings';

/** The tip made from the selection, kept in the brush (so a saved brush carries its picture). */
export function pictureFromSelection(): boolean {
  return makePixelBrush((stamp) => setDab({ tip: 'picture', picture: stamp, spacing: 1 }));
}

/** The line that says why a smooth edge is dithered instead, or null when it is as asked. */
export function edgeNote(locked: boolean, perfect: boolean, answer: 'crisp' | 'smooth', aliased: boolean): string | null {
  if (aliased) return null;
  if (locked) return 'This layer keeps to its palette, so the smooth edge is a pattern of dots instead of see-through pixels. Every pixel stays one of your palette colours.';
  if (perfect && answer === 'crisp') return 'Pixel perfect is on, so the smooth edge is a pattern of dots instead of see-through pixels. Every pixel stays whole.';
  return null;
}

function EdgeNote() {
  const aliased = useDab((b) => b.aliased);
  const locked = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return !!l && l.kind === 'pixel' && !!l.paletteLock;
  });
  const perfect = useToolSettings((s) => s.pixelPerfect);
  const answer = useChoice<'crisp' | 'smooth'>(SOFT_EDGE_CHOICE);
  const note = edgeNote(locked, perfect, answer, aliased);
  if (!note) return null;
  return (
    <>
      <Tip stays>{note}</Tip>
      {!locked && <ActionButton onClick={() => setChoice(SOFT_EDGE_CHOICE, 'smooth')} title="Make the smooth edge out of see-through pixels, even with Pixel perfect on">Make the edge smooth instead</ActionButton>}
    </>
  );
}

const pct = (v: number): string => `${v}%`;

function PictureTip() {
  const picture = useDab((b) => b.picture);
  return (
    <div className="tp-row" data-testid="dab-picture">
      {picture ? (
        <div className="tp-pixel">
          <StampPicture stamp={picture} color="currentColor" />
          <span>
            Your picture, {picture.w} by {picture.h}
          </span>
        </div>
      ) : (
        <Tip stays>Select some pixels with the Select tool, then press the button to make them the brush.</Tip>
      )}
      {picture && hasColours(picture) && <Toggle label="Its own colours" checked={picture.keep} onChange={(keep) => setDab({ picture: { ...picture, keep } })} hint="On: it stamps the picture as it was drawn. Off: only its shape counts, painted in the colour you picked." />}
      <ActionButton onClick={() => void pictureFromSelection()} title="Turn the pixels you have selected into the tip (up to 32 by 32)">
        {picture ? 'Use the selection instead' : 'Make from the selection'}
      </ActionButton>
    </div>
  );
}

export function DabOptionsPanel() {
  const b = useDab((x) => x);
  return (
    <div className="cv-options">
      <BrushPresetRow side="pixel" />
      <Choice<TipShape>
        label="Tip"
        value={b.tip}
        options={[
          { value: 'round', label: 'Round', title: 'A round dab. Hardness sets how firm its edge is.' },
          { value: 'square', label: 'Square', title: 'A square dab, with corners. Turn it with Angle for a diamond or a chisel.' },
          { value: 'picture', label: 'Picture', title: 'A little picture of your own, stamped along the line. Make one from a selection.' },
        ]}
        onChange={(tip) => setDab(tip === 'picture' && !b.picture ? { tip: 'round' } : { tip })}
      />
      {b.tip === 'picture' && <PictureTip />}
      <Slider label="Size" value={b.size} min={SIZE_RANGE.min} max={Math.min(SIZE_RANGE.max, 120)} typeMax={SIZE_RANGE.max} curve format={(v) => `${v} pixel${v === 1 ? '' : 's'} across`} onChange={(v) => setDab({ size: v })} hint={b.tip === 'picture' ? 'The longer side of the picture. A picture the same size as it was drawn goes down pixel for pixel.' : undefined} />
      <Slider
        label="Spacing"
        value={Math.round(b.spacing * 100)}
        min={Math.round(SPACING_RANGE.min * 100)}
        max={Math.round(SPACING_RANGE.max * 100)}
        curve
        format={(v) => (v < 50 ? `${v}%: a smooth line` : v < 100 ? `${v}%: a beaded line` : v === 100 ? '100%: side by side' : `${v}%: dots with gaps`)}
        onChange={(v) => setDab({ spacing: v / 100 })}
        hint="How far apart the dabs go, as a share of the size. Low is a smooth line, 100% puts them side by side, and more leaves gaps, like a dotted line."
      />
      <Choice<'sharp' | 'smooth'>
        label="Edges"
        value={b.aliased ? 'sharp' : 'smooth'}
        options={[
          { value: 'sharp', label: 'Sharp pixels', title: 'No anti-aliasing: every pixel is all or nothing, the way pixel art is drawn.' },
          { value: 'smooth', label: 'Smooth', title: 'Anti-aliasing: the edge fades with see-through pixels, like a painting program.' },
        ]}
        onChange={(v) => setDab({ aliased: v === 'sharp' })}
      />
      {b.tip !== 'picture' && <Slider label="Hardness" value={Math.round(b.hardness * 100)} min={0} max={100} format={(v) => (v === 0 ? 'Soft all through' : v === 100 ? 'Hard edge' : `${v}%`)} onChange={(v) => setDab({ hardness: v / 100 })} hint={b.aliased ? 'How firm the edge is. With sharp pixels a soft edge becomes a pattern of dots instead of a fade.' : 'How much of the dab is solid before it fades.'} />}
      <EdgeNote />
      <MoreOptions name="pixel-brush" label="Shape, scatter and flow" hint="Angle, flat tips, turning with the line, scatter, size jitter, flow and opacity.">
        <Slider label="Angle" value={b.angle} min={0} max={359} format={(v) => `${v}°`} onChange={(v) => setDab({ angle: v })} hint="Turns the tip. A square at 45° is a diamond." />
        <Slider label="Roundness" value={Math.round(b.roundness * 100)} min={Math.round(ROUND_RANGE.min * 100)} max={100} format={pct} onChange={(v) => setDab({ roundness: v / 100 })} hint="How flat the tip is. 100% is a full circle or square; low is a thin chisel." />
        <Toggle label="Turn with the line" checked={b.follow} onChange={(follow) => setDab({ follow })} hint="The tip points along the way you draw, on top of its own angle, like a pen nib kept flat to the page." />
        <Slider label="Scatter" value={Math.round(b.scatter * 100)} min={SCATTER_RANGE.min * 100} max={SCATTER_RANGE.max * 100} format={(v) => (v === 0 ? 'None: on the line' : `${v}% of the size`)} onChange={(v) => setDab({ scatter: v / 100 })} hint="How far each dab may land away from the line." />
        <Slider label="Size jitter" value={Math.round(b.sizeJitter * 100)} min={0} max={100} format={(v) => (v === 0 ? 'None: all one size' : `down to ${100 - v}%`)} onChange={(v) => setDab({ sizeJitter: v / 100 })} hint="Each dab may be smaller than the size, by up to this much." />
        <Slider label="Angle jitter" value={Math.round(b.angleJitter * 100)} min={0} max={100} format={(v) => (v === 0 ? 'None' : pct(v))} onChange={(v) => setDab({ angleJitter: v / 100 })} hint="Each dab may turn a little, up to half a turn at 100%." />
        <Slider label="Flow" value={Math.round(b.flow * 100)} min={Math.round(FLOW_RANGE.min * 100)} max={100} format={pct} onChange={(v) => setDab({ flow: v / 100 })} hint="How much paint one dab lays down. Low flow is see-through and builds up as dabs overlap." />
        <Slider label="Opacity" value={Math.round(b.opacity * 100)} min={Math.round(FLOW_RANGE.min * 100)} max={100} format={pct} onChange={(v) => setDab({ opacity: v / 100 })} hint="The most paint any pixel can get in one stroke, however many dabs cross it. Flow is how fast it builds, opacity is where it stops." />
      </MoreOptions>
      <MirrorOptions />
      <Tip>Dabs go along the line you draw. Tight spacing makes a solid line; wide spacing makes dots or stamps.</Tip>
      <PenOptions tool="pixel-brush" size flow />
    </div>
  );
}
