// Tool options for the retouch brushes. The brush itself (size, spacing, hardness, flow) is the same dab brush as the pixel
// brush; what is new is the clone stamp's source and the blur and sharpen amount.
import { useSyncExternalStore, type ComponentType } from 'react';
import { ActionButton, Choice, MoreOptions, Slider, Tip } from '../canvas/controls';
import { setChoice, useChoice } from '../core/choices';
import { DynamicsSection, type DabHandle } from '../dab/DynamicsOptions';
import { FLOW_RANGE, SIZE_RANGE, SPACING_RANGE } from '../dab/maths';
import { MirrorOptions } from '../tools/options/MirrorOptions';
import { CLONE_ALIGN_CHOICE, type CloneAlign } from './choices';
import { AMOUNT_RANGE, retouchStore, type CloneSample, type RetouchKind } from './settings';
import { cloneAim, resetCloneAim, subscribeAim } from './aim';

const pct = (v: number): string => `${v}%`;

const handleFor = (kind: RetouchKind): DabHandle => {
  const st = retouchStore(kind);
  return { use: (sel) => st.use((r) => sel(r.brush)), set: (patch) => st.set({ brush: patch }), fold: `retouch-${kind}-dynamics` };
};

function SourceNote() {
  const source = useSyncExternalStore(subscribeAim, () => cloneAim().source);
  return source ? (
    <>
      <Tip stays>{`Copying from ${source.x}, ${source.y}. Alt-click anywhere to choose a new spot.`}</Tip>
      <ActionButton
        onClick={() => {
          resetCloneAim();
        }}
        title="Forget the spot you chose, so the next click chooses a new one"
      >
        Choose a new source
      </ActionButton>
    </>
  ) : (
    <Tip stays>Alt-click (or Ctrl-click) the part of the picture you want to copy, then paint where you want the copy to go. Your first click does the same.</Tip>
  );
}

function CloneOptions() {
  const st = retouchStore('clone');
  const sample = st.use((r) => r.sample);
  const align = useChoice<CloneAlign>(CLONE_ALIGN_CHOICE);
  return (
    <>
      <SourceNote />
      <Choice<CloneSample>
        label="Copy from"
        value={sample}
        options={[
          { value: 'layer', label: 'This layer', title: 'Copies only what is on the layer you paint on, so a clone never brings in the colour layer under your line art.' },
          { value: 'visible', label: 'Everything you see', title: 'Copies the picture as it looks, every layer together, and paints the copy onto this layer.' },
        ]}
        onChange={(v) => st.set({ sample: v })}
      />
      <Choice<CloneAlign>
        label="When you lift the pen"
        value={align}
        options={[
          { value: 'aligned', label: 'Carry on', title: 'The copy keeps the same gap from your hand, so the next stroke carries on in step with the last.' },
          { value: 'restart', label: 'Start again', title: 'Every stroke begins by copying the spot you chose.' },
        ]}
        onChange={(v) => setChoice(CLONE_ALIGN_CHOICE, v)}
      />
    </>
  );
}

function AmountRow({ kind }: { kind: 'blur' | 'sharpen' }) {
  const st = retouchStore(kind);
  const amount = st.use((r) => r.amount);
  return kind === 'blur' ? (
    <Slider label="Amount" value={Math.round(amount * 100)} min={Math.round(AMOUNT_RANGE.min * 100)} max={100} format={(v) => (v < 30 ? `${v}%: a gentle smear` : v < 70 ? `${v}%: soft` : `${v}%: very soft`)} onChange={(v) => st.set({ amount: v / 100 })} hint="How far each pixel is spread into its neighbours. Go over a spot again to soften it more." />
  ) : (
    <Slider label="Amount" value={Math.round(amount * 100)} min={Math.round(AMOUNT_RANGE.min * 100)} max={100} format={(v) => (v < 30 ? `${v}%: a little crisper` : v < 70 ? `${v}%: crisp` : `${v}%: very crisp`)} onChange={(v) => st.set({ amount: v / 100 })} hint="How hard edges are pushed apart. Too much makes harsh halos, so go over a spot again instead." />
  );
}

const cache = new Map<RetouchKind, ComponentType>();

/** The options panel for one of the retouch brushes (the same component every time, so the panel does not remount). */
export function RetouchOptionsFor(kind: RetouchKind): ComponentType {
  const have = cache.get(kind);
  if (have) return have;
  const st = retouchStore(kind);
  const Options = () => {
    const b = st.use((r) => r.brush);
    return (
      <div className="cv-options">
        {kind === 'clone' && <CloneOptions />}
        <Slider label="Size" value={b.size} min={SIZE_RANGE.min} max={Math.min(SIZE_RANGE.max, 120)} typeMax={SIZE_RANGE.max} curve format={(v) => `${v} pixel${v === 1 ? '' : 's'} across`} onChange={(v) => st.set({ brush: { size: v } })} />
        <Slider label="Hardness" value={Math.round(b.hardness * 100)} min={0} max={100} format={(v) => (v === 0 ? 'Soft all through' : v === 100 ? 'Hard edge' : pct(v))} onChange={(v) => st.set({ brush: { hardness: v / 100 } })} hint="How firm the edge of the brush is. Soft blends the retouch into what is round it." />
        {kind !== 'clone' && <AmountRow kind={kind} />}
        <MoreOptions name={`retouch-${kind}`} label="Spacing, flow and opacity" hint="How far apart the dabs go, how fast it builds up, and the most it can do in one stroke.">
          <Slider
            label="Spacing"
            value={Math.round(b.spacing * 100)}
            min={Math.round(SPACING_RANGE.min * 100)}
            max={Math.round(SPACING_RANGE.max * 100)}
            curve
            format={(v) => (v < 50 ? `${v}%: a smooth line` : v < 100 ? `${v}%: a beaded line` : `${v}%`)}
            onChange={(v) => st.set({ brush: { spacing: v / 100 } })}
            hint="How far apart the dabs go, as a share of the size. Low is smooth."
          />
          <Slider label="Flow" value={Math.round(b.flow * 100)} min={Math.round(FLOW_RANGE.min * 100)} max={100} format={pct} onChange={(v) => st.set({ brush: { flow: v / 100 } })} hint="How much one dab does. Low flow builds up as dabs overlap." />
          <Slider label="Opacity" value={Math.round(b.opacity * 100)} min={Math.round(FLOW_RANGE.min * 100)} max={100} format={pct} onChange={(v) => st.set({ brush: { opacity: v / 100 } })} hint="The most any pixel can change in one stroke, however many dabs cross it." />
        </MoreOptions>
        <DynamicsSection handle={handleFor(kind)} />
        <MirrorOptions />
        <Tip>{kind === 'clone' ? 'Painting copies the picture from the source onto this layer. A selection keeps the copy inside it.' : kind === 'blur' ? 'Paint over an edge to soften it. A selection keeps the blur inside it.' : 'Paint over a soft edge to crisp it up. A selection keeps it inside.'}</Tip>
        <Tip>Pen pressure and the rest are under Pen, speed and fade. A mouse paints at full strength.</Tip>
      </div>
    );
  };
  cache.set(kind, Options);
  return Options;
}
