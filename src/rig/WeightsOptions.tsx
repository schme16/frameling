// Tool options for "Paint how much it bends": which bone, more / less / smooth, brush size and strength.
import { getCommand } from '../core/registry';
import { useStore } from '../core/store';
import { ActionButton, Choice, Slider, Tip } from '../canvas/controls';
import { requestOverlay } from '../canvas/controller';
import { setRigUi, useRigUi } from './state';
import { heatColour, type BrushMode } from './weights';
import { paintBone, paintTarget, setWeightBrush, useWeightBrush } from './weightsTool';
import './rig.css';

const run = (id: string) => void getCommand(id)?.run();

/** The colour key under the options: blue is "doesn't follow", red is "follows fully". */
function HeatKey() {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((w) => {
    const [r, g, b] = heatColour(w);
    return `rgb(${r},${g},${b}) ${w * 100}%`;
  });
  return (
    <div className="rg-heat" role="img" aria-label="Colour key: blue stays put, red follows fully">
      <span className="rg-heat-bar" style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
      <span className="rg-heat-ends" aria-hidden="true">
        <span>Stays put</span>
        <span>Follows fully</span>
      </span>
    </div>
  );
}

export function WeightsOptions() {
  const b = useWeightBrush();
  useRigUi();
  const doc = useStore((s) => s.doc);
  const activeId = useStore((s) => s.ui.activeLayerId);
  const t = paintTarget(doc, activeId);
  if (!t)
    return (
      <div className="cv-options">
        <Tip>
          This brush paints how much each part of a bending layer follows each bone. Pick a layer that bends with the bones first (Rig &gt; Bend this layer with the bones).
        </Tip>
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => run('rig.bendLayer')}>Bend this layer</ActionButton>
        </div>
      </div>
    );
  const bone = paintBone(t);
  return (
    <div className="cv-options">
      <label className="cv-row rg-bone-pick">
        <span>Bone</span>
        <select
          value={bone}
          onChange={(e) => {
            setRigUi({ selected: e.target.value });
            requestOverlay();
          }}
        >
          {t.rig.rig.bones.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <Choice<BrushMode>
        label="Brush"
        value={b.mode}
        options={[
          { value: 'more', label: 'More', title: 'Follow this bone more. Hold Alt for less.' },
          { value: 'less', label: 'Less', title: 'Follow this bone less. Hold Alt for more.' },
          { value: 'smooth', label: 'Smooth', title: 'Even out sudden changes, so the bend is softer.' },
        ]}
        onChange={(v) => setWeightBrush({ mode: v })}
      />
      <Slider label="Size" value={Math.round(b.size)} min={2} max={200} onChange={(v) => setWeightBrush({ size: v })} format={(v) => `${v} px`} />
      <Slider label="Strength" value={Math.round(b.strength * 100)} min={2} max={100} onChange={(v) => setWeightBrush({ strength: v / 100 })} format={(v) => `${v}%`} />
      <HeatKey />
      <Tip>Red follows the bone fully, blue doesn't follow it at all. Ctrl+click a bone to paint it. Try posing first, then paint where it bends badly.</Tip>
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => run('rig.smoothWeights')} title="Softens the bend everywhere on this layer, once.">
          Smooth all
        </ActionButton>
        <ActionButton onClick={() => run('rig.normaliseWeights')} title="Makes every point follow its bones by 100% in total (normalise). Handy after deleting a bone.">
          Even out totals
        </ActionButton>
        <ActionButton onClick={() => run('rig.bendLayer')} title="Throws away the painting and starts again from automatic weights.">
          Start over
        </ActionButton>
      </div>
    </div>
  );
}
