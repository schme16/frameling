// The tip in the brush options: one picker that shows what each tip draws (the stamp shapes are in it too), then the few
// sliders the tip in use has and a line about it.
import { ActionButton, Choice, Slider, Tip, Toggle } from '../canvas/controls';
import { useStore } from '../core/store';
import { DEFAULT_BRUSH } from '../core/doc';
import type { BrushTip, StampAngle } from '../core/format';
import { resolveTip } from '../geometry/tip';
import { PaperGroup } from '../dry/PaperGroup';
import { clearEdgedPiece, EDGED_SLOTS, edgedHas, makeAlongBrush, setEdgedPiece } from './own';
import { BrushPresetPicker } from './BrushPresetRow';
import { LitRow, PartsBox } from './PartsOptions';
import { makeBrushFromSelection, patchTip, setMatte, setOwnPaper } from './tips';
import { brushesVersion, useBrushPresets } from './presets';
import { partsOf } from './parts';
import { resetPaper, savedBrush } from './partsActions';
import './brushes.css';

const OWN_TIPS = {
  nib: 'The nib is worked out as one solid shape, so it stays sharp at any size and exports anywhere.',
  along: 'Your drawing is bent along the line and painted in your colour. It exports as plain shapes.',
  edged: 'Each part is scaled to the brush size. Corners are found where the line turns about a right angle. It exports as plain shapes.',
  bristle: 'Each bristle is a thin line, so it stays sharp at any size and exports as plain lines.',
} as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;

const ANGLES: { value: StampAngle; label: string; title: string }[] = [
  { value: 'follow', label: 'Along the line', title: 'Each stamp turns to face the way the line is going' },
  { value: 'upright', label: 'Upright', title: 'Every stamp stays the way up it was made' },
  { value: 'random', label: 'Any way', title: 'Each stamp turns a different way' },
];

const NIB_ANGLES: { value: 'upright' | 'follow'; label: string; title: string }[] = [
  { value: 'upright', label: 'Fixed', title: 'The pen is held at one angle, whichever way the line goes (calligraphy)' },
  { value: 'follow', label: 'With the line', title: 'The pen turns with the line, at this angle to it' },
];

const FITS: { value: 'stretch' | 'repeat'; label: string; title: string }[] = [
  { value: 'stretch', label: 'Stretch', title: 'One copy, stretched down the whole line' },
  { value: 'repeat', label: 'Repeat', title: 'Whole copies end to end' },
];

/** The five parts of an edged brush: each has a button that takes it from the selection, and a way to take it out again. */
function EdgedParts({ has }: { has: Record<(typeof EDGED_SLOTS)[number]['id'], boolean> }) {
  return (
    <div className="tp-parts" data-control="edged-parts" role="group" aria-label="Edged brush parts">
      {EDGED_SLOTS.map((p) => (
        <div key={p.id} className="tp-part" data-set={has[p.id]}>
          <span className="tp-part-name" title={p.hint}>
            {p.label}
          </span>
          <ActionButton command={`brush.edged.${p.id}`} onClick={() => void setEdgedPiece(p.id)} title={`${p.hint} Select a drawing, then press this to use it.`}>
            {has[p.id] ? 'Replace' : 'Use selection'}
          </ActionButton>
          {p.id !== 'sides' && has[p.id] && (
            <ActionButton onClick={() => clearEdgedPiece(p.id)} title="Take this part out. The sides are used there instead.">
              Remove
            </ActionButton>
          )}
        </div>
      ))}
    </div>
  );
}

/** The paper side of a chalk or charcoal tip: the shared Paper group, with the switch in it and how coarse the paper is. */
function PaperControls({ tip }: { tip: BrushTip }) {
  const t = resolveTip(tip);
  useBrushPresets(brushesVersion);
  const was = savedBrush();
  const changed = was ? partsOf(was.brush, { ...DEFAULT_BRUSH, tip }).paper : false;
  const grainSize = <Slider control="paper-grain-size" label="Grain size" value={Math.round(t.grain * 10)} min={tip.dry ? 3 : 5} max={30} format={(v) => (v === 10 ? 'Usual' : `${(v / 10).toFixed(1)}x`)} onChange={(v) => patchTip({ grain: v / 10 })} hint="Finer for soft dust, coarser for rough paper." />;
  return (
    <div className="tp-row" data-testid="brush-paper">
      <PaperGroup
        own={tip.dry ? tip.paper : undefined}
        onOwn={setOwnPaper}
        part={{ saved: !!was, changed, reset: () => void resetPaper() }}
        toggle={{ checked: !!tip.dry, onChange: (v) => patchTip({ dry: v ? (tip.kind === 'chalk' ? 'chalk' : 'compressed-charcoal') : undefined, paper: undefined }), hint: 'The line catches on the tooth of a sheet of paper, the way real chalk and charcoal do: pressed lightly it leaves only specks, pressed hard it fills in. Off makes the grain from tiny shapes instead.' }}
        off={
          <>
            <Slider control="paper-amount" label="Grain" value={Math.round(t.amount * 100)} min={5} max={100} format={(v) => `${v}%`} onChange={(v) => patchTip({ amount: v / 100 })} hint="How much of the line is dusty grain, with the paper showing through." />
            {grainSize}
          </>
        }
      >
        {grainSize}
      </PaperGroup>
    </div>
  );
}

/** The tip in use, as the pieces of the panel need it. */
function useTipFacts() {
  const tip = useStore((s) => s.ui.brush.tip);
  const kind = tip?.kind ?? null;
  const catchy = !!tip && (kind === 'chalk' || kind === 'charcoal');
  return { tip, kind, catchy, t: tip ? resolveTip(tip) : null };
}

/** The tip and the stick folded under the Brush as its parts. */
export function VectorParts() {
  const { tip, catchy } = useTipFacts();
  return <PartsBox stick={catchy} stickOff={catchy && !tip?.dry} paperBelow={catchy} />;
}

/** The paper, for the tips that catch on it. */
export function VectorPaper() {
  const { tip, catchy } = useTipFacts();
  return catchy && tip ? <PaperControls tip={tip} /> : null;
}

/** The Brush, with the tip and the stick folded under it as its parts, then the paper (the sheet's unless the brush keeps its own) for chalk and charcoal, then what the tip in use has. */
export function TipOptions() {
  return (
    <>
      <LitRow part="brush">
        <BrushPresetPicker title="Brush" />
      </LitRow>
      <VectorParts />
      <VectorPaper />
      <VectorTipControls />
    </>
  );
}

/** What the tip in use has: its own sliders and a line about it, and Brush from selection. */
export function VectorTipControls() {
  const { tip, kind, t } = useTipFacts();
  return (
    <>
      <div className="tp-row" data-testid="brush-tip-more">
      {t && kind === 'watercolour' && <Slider control="wash-edge" label="Edge" value={Math.round(t.amount * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => patchTip({ amount: v / 100 })} hint="How dark and bold the edge of the wash is, where the paint gathers." />}
      {t && kind === 'stamp' && (
        <>
          <Slider control="spacing" label="Spacing" value={Math.round(t.spacing * 100)} min={20} max={400} step={5} format={(v) => `${v}%`} onChange={(v) => patchTip({ spacing: v / 100 })} hint="How far apart the stamps are, as a share of the brush size." />
          <Slider control="size-jitter" label="Size variety" value={Math.round(t.jitter * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ jitter: v / 100 })} hint="Each stamp a little bigger or smaller than the last." />
          <Slider control="scatter" label="Wander" value={Math.round(t.scatter * 100)} min={0} max={200} step={5} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ scatter: v / 100 })} hint="How far stamps drift off the line, to either side." />
          <Choice control="turn" label="Turn" value={t.angle} options={ANGLES} onChange={(v) => patchTip({ angle: v })} />
          <Slider control="angle-jitter" label="Spin" value={Math.round(t.turn * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ turn: v / 100 })} hint="Each stamp also turns a random amount, up to any way round at 100%." />
          <Slider control="gap-variety" label="Gap variety" value={Math.round(t.gapVary * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ gapVary: v / 100 })} hint="The gaps between stamps vary, so they bunch and spread." />
          <Toggle control="size-follows" label="Pressure sizes them" checked={!t.fixedSize} onChange={(v) => patchTip({ fixedSize: !v })} hint="A harder press makes bigger stamps. Off keeps every stamp the same size." />
        </>
      )}
      {t && kind === 'nib' && (
        <>
          <Slider control="roundness" label="Roundness" value={Math.round(t.roundness * 100)} min={5} max={100} step={5} format={(v) => (v >= 100 ? 'Round' : `${v}%`)} onChange={(v) => patchTip({ roundness: v / 100 })} hint="Low is a flat blade, thick one way and thin the other. 100% is a round pen." />
          <Slider control="angle" label="Angle" value={t.nibAngle} min={-90} max={90} format={(v) => `${v}\u00b0`} onChange={(v) => patchTip({ nibAngle: v })} hint="Which way the flat of the pen is tilted." />
          <Choice control="turn" label="Angle stays" value={t.angle === 'follow' ? 'follow' : 'upright'} options={NIB_ANGLES} onChange={(v) => patchTip({ angle: v })} />
        </>
      )}
      {t && kind === 'bristle' && (
        <>
          <Slider control="bristle-count" label="Bristles" value={t.count} min={3} max={60} format={(v) => `${v}`} onChange={(v) => patchTip({ count: v })} hint="How many thin lines the brush is made of." />
          <Slider control="bristle-stiffness" label="Stiffness" value={Math.round(t.stiffness * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => patchTip({ stiffness: v / 100 })} hint="Stiff bristles stay in line. Floppy ones wander." />
          <Slider control="bristle-dry-gaps" label="Dry gaps" value={Math.round(t.amount * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ amount: v / 100 })} hint="How often a bristle runs out of paint, like a dry brush." />
          <Slider control="bristle-thickness" label="Bristle thickness" value={Math.round(t.body * 100)} min={-100} max={100} step={5} format={(v) => (v === 0 ? 'Normal' : v < 0 ? `${-v}% thinner` : `${v}% fatter`)} onChange={(v) => patchTip({ body: v / 100 })} hint="Fatter bristles close the gaps until the stroke is solid paint, like oil. Thinner ones leave clear gaps, like a rake." />
          <Slider control="bristle-streaks" label="Light and dark streaks" value={Math.round(t.tone * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ tone: v / 100 })} hint="Runs some bristles lighter and some darker than the colour, in long streaks." />
        </>
      )}
      {t && kind === 'along' && (
        <>
          <Choice control="along-fit" label="On a long line" value={t.fit} options={FITS} onChange={(v) => patchTip({ fit: v })} />
          <ActionButton control="along-from-selection" command="brush.makeAlong" onClick={() => void makeAlongBrush()} title="Use what you have selected as the drawing that goes along the line.">
            Use the selection as the drawing
          </ActionButton>
        </>
      )}
      {t && kind === 'edged' && <EdgedParts has={edgedHas(tip)} />}
      {tip && <Slider control="matte" label="Matte finish" value={Math.round((tip.matte ?? 0) * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => setMatte(v / 100)} hint="Dries the paint paler and chalkier, with a faint velvety grain, like gouache. The colour still covers what is under it." />}
      {kind && <Tip>{kind === 'nib' || kind === 'along' || kind === 'edged' || kind === 'bristle' ? OWN_TIPS[kind] : kind === 'stamp' ? 'Stamps stay shapes you can export anywhere. Pointy start and end shrink the stamps at the ends.' : tip?.dry ? 'On paper, the line stays a line you can reshape. PNG, video, sprite sheets and Photoshop show the paper as drawn; PDF, Illustrator and Lottie turn it into a picture; SVG uses tiny shapes instead.' : `${kind === 'watercolour' ? 'Watercolour' : kind === 'chalk' ? 'Chalk' : 'Charcoal'} is drawn from tiny shapes, so it stays sharp at any size. Saving as SVG, Lottie or PDF makes a bigger file.`}</Tip>}
      <ActionButton control="tip-from-selection" command="brush.fromSelection" onClick={() => void makeBrushFromSelection()} title="Turn what you have selected into a brush. On a drawing layer it becomes a stamp; on a pixel layer, a small picture brush.">
        Brush from selection
      </ActionButton>
      </div>
    </>
  );
}
