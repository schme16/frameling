// The pixel brush options for what moves a dab (pen, speed, fade), colour that changes along the stroke, and texture
// (paper grain and a dual tip). Each is a fold under the main options so the first look stays small. Words are plain,
// with the paint program's term second.
import { ActionButton, Field, Choice, Slider, Tip, Toggle, MoreOptions } from '../canvas/controls';
import { CurveEditor } from './CurveEditor';
import { BRUSH_BLENDS } from './blend';
import { blendInfo } from '../effects/model';
import { PaperGroup } from '../dry/PaperGroup';
import { DYN_SOURCES, FADE_RANGE, routeFor, withRoute, type DynSource, type DynTarget } from './dynamics';
import type { DabBrush } from './maths';
import { setDab, useDab } from './settings';
import { DEFAULT_DUAL, DEFAULT_GRAIN, DUAL_DENSITY, DUAL_SIZE, GRAIN_SCALE } from './texture';
import { dualPictureScale } from './texturePicture';
import { TextureSwatch } from './TextureSwatch';
import { dualFromPicture, grainFromPicture } from './pictureTip';
import './dab.css';

export const SOURCE_WORDS: Record<DynSource, { label: string; hint: string }> = {
  pressure: { label: 'Pen pressure', hint: 'How hard the pen presses. A mouse counts as full.' },
  tilt: { label: 'Pen tilt', hint: 'How far the pen leans over. A mouse counts as upright.' },
  twist: { label: 'Pen twist', hint: 'How far the pen is turned about its own barrel (pens that can tell).' },
  speed: { label: 'Speed', hint: 'How fast the hand is moving.' },
  direction: { label: 'Direction of the line', hint: 'Which way the line is heading, round the compass.' },
  fade: { label: 'Fading out', hint: 'Runs out along the stroke, so it starts full and ends at nothing. Set how far under Fade length.' },
  random: { label: 'Random', hint: 'A new random number for every dab.' },
};

/** Which sources are worth offering for a setting (a random size is size jitter, which has its own slider, so it is left to the colour ones). */
const OFFERED: Record<DynTarget, DynSource[]> = {
  size: ['pressure', 'tilt', 'speed', 'fade', 'random'],
  flow: ['pressure', 'tilt', 'speed', 'fade', 'random'],
  angle: ['pressure', 'tilt', 'twist', 'speed', 'direction', 'random'],
  scatter: ['pressure', 'tilt', 'speed', 'fade', 'random'],
  mix: DYN_SOURCES,
  hue: ['random'],
  saturation: ['random'],
  lightness: ['random'],
};

const ROW: Record<'size' | 'flow' | 'angle' | 'scatter' | 'mix', { label: string; hint: string; amount: (v: number, backwards: boolean) => string }> = {
  size: { label: 'Size follows', hint: 'What makes the dab bigger or smaller as you draw.', amount: (v) => `down to ${100 - v}%` },
  flow: { label: 'Flow follows', hint: 'What makes the paint heavier or lighter as you draw.', amount: (v) => `down to ${100 - v}%` },
  angle: { label: 'Angle follows', hint: 'What turns the tip as you draw.', amount: (v) => `${Math.round(v * 3.6)}° of turn` },
  scatter: { label: 'Scatter follows', hint: 'What lets the dabs wander off the line.', amount: (v) => `${v}% of the size` },
  mix: { label: 'Colour mixes toward the fill colour', hint: 'Paints in the colour you picked and shifts toward the Fill colour as the source rises.', amount: (v) => `${v}% of the way` },
};

/** One setting driven by one source: a picker for the source, and how much of the range it uses. */
function RouteRow({ b, to, set = setDab }: { b: DabBrush; to: 'size' | 'flow' | 'angle' | 'scatter' | 'mix'; set?: (patch: Partial<DabBrush>) => void }) {
  const r = routeFor(b.dynamics, to);
  const words = ROW[to];
  const extra = b.dynamics.filter((x) => x.to === to).length - 1;
  return (
    <div className="dab-route" data-testid={`dab-route-${to}`}>
      <Field label={words.label} hint={r ? SOURCE_WORDS[r.from].hint : words.hint}>
        <select
          className="dab-select"
          aria-label={words.label}
          value={r?.from ?? ''}
          onChange={(e) => set({ dynamics: withRoute(b.dynamics, to, e.target.value ? { from: e.target.value as DynSource } : null) })}
        >
          <option value="">Nothing</option>
          {OFFERED[to].map((s) => (
            <option key={s} value={s}>
              {SOURCE_WORDS[s].label}
            </option>
          ))}
        </select>
      </Field>
      {r && (
        <div className="dab-sub">
          <Slider label="Amount" value={Math.round(r.amount * 100)} min={5} max={100} format={(v) => words.amount(v, r.invert)} onChange={(v) => set({ dynamics: withRoute(b.dynamics, to, { amount: v / 100 }) })} />
          <Toggle label="The other way round" checked={r.invert} onChange={(invert) => set({ dynamics: withRoute(b.dynamics, to, { invert }) })} hint="Flips it: a pen that makes the mark bigger when pressed harder makes it smaller instead." />
          {r.from !== 'random' && (
            <MoreOptions name={`pixel-brush-curve-${to}`} label={r.curve ? 'Shape of the response (bent)' : 'Shape of the response'} hint="Bend the line so a light press does more, or less, than a hard one.">
              <CurveEditor curve={r.curve} inLabel={SOURCE_WORDS[r.from].label.toLowerCase()} outLabel={words.label.replace(/ follows$/, '').toLowerCase()} onChange={(curve) => set({ dynamics: withRoute(b.dynamics, to, { curve: curve ?? undefined }) })} />
            </MoreOptions>
          )}
        </div>
      )}
      {extra > 0 && <div className="cv-field-hint">{`And ${extra} more from the brush file, kept as they came.`}</div>}
    </div>
  );
}

/** A colour wobble: a random route to one colour setting, set by one slider. */
function Wobble({ b, to, label, hint, format }: { b: DabBrush; to: 'hue' | 'saturation' | 'lightness'; label: string; hint: string; format: (v: number) => string }) {
  const r = routeFor(b.dynamics, to);
  const v = r ? Math.round(r.amount * 100) : 0;
  return <Slider label={label} value={v} min={0} max={100} format={(x) => (x === 0 ? 'None' : format(x))} onChange={(x) => setDab({ dynamics: x === 0 ? withRoute(b.dynamics, to, null) : withRoute(b.dynamics, to, r ? { amount: x / 100 } : { from: 'random', amount: x / 100 }) })} hint={hint} />;
}

/** Where a brush's settings live, so the same options can sit on the pixel brush and on the retouch brushes (which each keep their own brush). */
export interface DabHandle {
  use<S>(selector: (b: DabBrush) => S): S;
  set(patch: Partial<DabBrush>): void;
  /** The name the fold is remembered under. */
  fold: string;
}

export const PIXEL_HANDLE: DabHandle = { use: useDab, set: setDab, fold: 'pixel-brush-dynamics' };

/** What the pen, the hand and the stroke do to each dab. */
export function DynamicsSection({ handle = PIXEL_HANDLE }: { handle?: DabHandle } = {}) {
  const b = handle.use((x) => x);
  const set = handle.set;
  const usesFade = b.dynamics.some((r) => r.from === 'fade');
  return (
    <MoreOptions name={handle.fold} label="Pen, speed and fade" hint="Pressure, tilt, speed or a fade-out changing the size, flow, angle or scatter.">
      <RouteRow b={b} to="size" set={set} />
      <RouteRow b={b} to="flow" set={set} />
      <RouteRow b={b} to="angle" set={set} />
      <RouteRow b={b} to="scatter" set={set} />
      {usesFade && <Slider label="Fade length" value={b.fadeLength} min={FADE_RANGE.min} max={Math.min(FADE_RANGE.max, 600)} typeMax={FADE_RANGE.max} curve format={(v) => `${v} pixels of line`} onChange={(v) => set({ fadeLength: v })} hint="How far the stroke goes before a fade has run out." />}
    </MoreOptions>
  );
}

/** Colour that changes along the stroke, and wet paint. */
export function ColourSection() {
  const b = useDab((x) => x);
  return (
    <MoreOptions name="pixel-brush-colour" label="Colour changes" hint="Wobble the hue or lightness, mix toward the Fill colour, paint wet so colour smears along, or blend like a layer does (Multiply, Screen...).">
      <Wobble b={b} to="hue" label="Hue wobble" format={(v) => `${Math.round(v * 1.8)}° either way`} hint="Each dab turns a little round the colour wheel, so red wanders through orange and pink." />
      <Wobble b={b} to="lightness" label="Lightness wobble" format={(v) => `${Math.round(v / 2)}% either way`} hint="Each dab is a little lighter or darker." />
      <Wobble b={b} to="saturation" label="Colourfulness wobble" format={(v) => `${v}% either way`} hint="Each dab is a little more or less colourful (saturation)." />
      <RouteRow b={b} to="mix" />
      <Slider label="Wet paint" value={Math.round(b.wet * 100)} min={0} max={100} format={(v) => (v === 0 ? 'Dry: paints its own colour' : `${v}%`)} onChange={(v) => setDab({ wet: v / 100 })} hint="The brush picks up colour from the paint it crosses and carries it along, so strokes smear into each other, like a mixing brush. It mixes with its own paint too, so a loop that crosses its own line smears it." />
      <Field label="How the paint joins what is there" hint={blendInfo(b.blend).description}>
        <select className="dab-select" aria-label="How the paint joins what is there" value={b.blend} onChange={(e) => setDab({ blend: e.target.value as DabBrush['blend'] })}>
          {BRUSH_BLENDS.map((m) => (
            <option key={m} value={m}>
              {m === 'normal' ? 'Paint over it' : `${blendInfo(m).label} (${blendInfo(m).term})`}
            </option>
          ))}
        </select>
      </Field>
      <p className="cv-tip">A locked palette is still kept: every colour here lands on the nearest palette colour.</p>
    </MoreOptions>
  );
}

/** The paper the brush catches on: the shared Paper group, with how much it catches and how big the grain is. */
export function PaperSection() {
  const g = useDab((x) => x.grain);
  return (
    <PaperGroup
      own={g?.paper}
      onOwn={(paper) => g && setDab({ grain: { ...g, paper } })}
      toggle={{ checked: !!g, onChange: (on) => setDab({ grain: on ? DEFAULT_GRAIN : null }), hint: 'Paint catches on the high points of paper, so light strokes break into specks and pressing harder fills them in. The paper is the sheet\u2019s, the same one chalk and charcoal use.' }}
    >
      {g && (
        <>
          {g.picture ? (
            <div className="dab-sub">
              <TextureSwatch picture={g.picture} invert={g.invert} label="The picture this brush catches on" />
              <Tip stays>A picture is the paper for this brush, so the paper above does not count. The paint catches on the dark parts of it.</Tip>
              <Toggle label="Catch on the light parts instead" checked={!!g.invert} onChange={(invert) => setDab({ grain: { ...g, invert } })} hint="Swap light and dark in the picture, for a picture drawn the other way round." />
              <ActionButton command="pixelbrush.grain.picture" onClick={() => void grainFromPicture()} title="Pick another picture file to catch on">
                Use another picture...
              </ActionButton>
              <ActionButton onClick={() => setDab({ grain: { ...g, picture: undefined, invert: undefined } })} title="Go back to catching on paper">
                Back to the paper
              </ActionButton>
            </div>
          ) : (
            <ActionButton command="pixelbrush.grain.picture" onClick={() => void grainFromPicture()} title="Catch on a picture of your own instead of a paper: a canvas weave, a leaf, a scribble">
              Use a picture as the paper...
            </ActionButton>
          )}
          <Slider label="How much it catches" value={Math.round(g.depth * 100)} min={5} max={100} format={(v) => `${v}%`} onChange={(v) => setDab({ grain: { ...g, depth: v / 100 } })} hint="At the top the paint only lands on the high points. Lower the flow to see it best." />
          <Slider label="Grain size" value={g.scale} min={GRAIN_SCALE.min} max={GRAIN_SCALE.max} format={(v) => (v === 1 ? 'Finest' : `${v} pixels a bump`)} onChange={(v) => setDab({ grain: { ...g, scale: v } })} />
          <Toggle label="A new patch of paper for every dab" checked={g.moving} onChange={(moving) => setDab({ grain: { ...g, moving } })} hint="Off: the paper is fixed to the page, so two strokes over each other catch on the same bumps. On: it is different at every dab, so overlapping dabs fill each other in." />
        </>
      )}
    </PaperGroup>
  );
}

/** The second tip. */
export function TextureSection() {
  const b = useDab((x) => x);
  const d = b.dual;
  return (
    <MoreOptions name="pixel-brush-texture" label="Dual tip" hint="A second tip that speckles the first.">
      <Toggle label="Dual tip" checked={!!d} onChange={(on) => setDab({ dual: on ? DEFAULT_DUAL : null })} hint="A second tip of little dots. The brush only paints where its dots are, which is most of what makes a Photoshop spatter or bristle brush look the way it does." />
      {d && (
        <div className="dab-sub">
          {d.picture ? (
            <>
              <TextureSwatch picture={d.picture} invert={d.invert} label="The picture the dots come from" />
              <Tip stays>The dots come from your picture: its dark parts, as much of it as How much of the picture says.</Tip>
              <Toggle label="Use the light parts instead" checked={!!d.invert} onChange={(invert) => setDab({ dual: { ...d, invert } })} hint="Swap light and dark in the picture, for a white shape on black." />
              <Slider label="Picture size" value={dualPictureScale(d.picture.side, d.scale)} min={1} max={4} format={(v) => (v === 1 ? 'As it is' : `${v} times bigger`)} onChange={(v) => setDab({ dual: { ...d, scale: v } })} hint="Makes each pixel of the picture a block of pixels. It steps 1, 2 and 4, as far as the picture fits." />
              <ActionButton command="pixelbrush.dual.picture" onClick={() => void dualFromPicture()} title="Pick another picture file for the dots">
                Use another picture...
              </ActionButton>
              <ActionButton onClick={() => setDab({ dual: { ...d, picture: undefined, invert: undefined, scale: undefined } })} title="Go back to round or square dots">
                Back to plain dots
              </ActionButton>
            </>
          ) : (
            <>
              <Choice<'round' | 'square'> label="Dot shape" value={d.tip} options={[{ value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }]} onChange={(tip) => setDab({ dual: { ...d, tip } })} />
              <Slider label="Dot size" value={d.size} min={DUAL_SIZE.min} max={DUAL_SIZE.max} curve format={(v) => `${v} pixel${v === 1 ? '' : 's'} across`} onChange={(v) => setDab({ dual: { ...d, size: v } })} />
              <ActionButton command="pixelbrush.dual.picture" onClick={() => void dualFromPicture()} title="Use a picture of your own for the dots: a leaf, a scribble, a bristle pattern">
                Use a picture for the dots...
              </ActionButton>
            </>
          )}
          <Slider label={d.picture ? 'How much of the picture' : 'How many dots'} value={Math.round(d.density * 100)} min={Math.round(DUAL_DENSITY.min * 100)} max={100} format={(v) => (d.picture ? `the darkest ${v}% counts` : `covers about ${v}%`)} onChange={(v) => setDab({ dual: { ...d, density: v / 100 } })} />
          <Toggle label="Cut holes instead" checked={d.cut} onChange={(cut) => setDab({ dual: { ...d, cut } })} hint="The dots become holes in the brush, so it paints everywhere except them." />
        </div>
      )}
    </MoreOptions>
  );
}
