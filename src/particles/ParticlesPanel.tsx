// The Particles panel: pick a ready-made effect, then change the selected emitter in plain words.
import type { ParticleSprite, ParticlesShape } from '../core/format';
import { celAt, findLayer } from '../core/doc';
import { useStore } from '../core/store';
import { ActionButton, Choice, Slider, Tip, Toggle } from '../canvas/controls';
import { Icon } from '../ui/icons';
import { PARTICLE_PRESETS, SPRITES, presetById } from './model';
import { addParticles, applyPreset, shuffleSeed, updateParticles } from './ops';
import { ColorWell, Num, Section } from './fields';

/** 'sliders' (the default) or 'numbers': the two looks compared in brand/ab/particles. */
export type PanelLook = 'sliders' | 'numbers';

export function panelLook(): PanelLook {
  try {
    return localStorage.getItem('frameling.particles.look') === 'numbers' ? 'numbers' : 'sliders';
  } catch {
    return 'sliders';
  }
}

interface FieldDef {
  key: keyof ParticlesShape;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  title?: string;
  /** Shown as a percentage of 0..1. */
  pct?: boolean;
}

function Setting({ s, f, look }: { s: ParticlesShape; f: FieldDef; look: PanelLook }) {
  const raw = Number(s[f.key] ?? 0);
  const value = f.pct ? Math.round(raw * 100) : raw;
  const set = (v: number) => updateParticles(`Particles: ${f.label.toLowerCase()}`, (d) => void ((d as unknown as Record<string, number>)[f.key] = f.pct ? v / 100 : v), { coalesce: `pt-${f.key}-${s.id}` });
  if (look === 'numbers') return <Num label={f.label} value={value} min={f.min} max={f.max} step={f.step} suffix={f.pct ? '%' : f.unit} title={f.title} onChange={set} />;
  return <Slider label={f.label} value={Math.min(f.max, Math.max(f.min, value))} min={f.min} max={f.max} step={f.step ?? 1} format={(v) => `${Math.round(v * 100) / 100}${f.pct ? '%' : f.unit ?? ''}`} hint={f.title} onChange={set} />;
}

function Group({ s, fields, look }: { s: ParticlesShape; fields: FieldDef[]; look: PanelLook }) {
  return <div className={look === 'numbers' ? 'sy-grid' : 'pt-sliders'}>{fields.map((f) => <Setting key={f.key} s={s} f={f} look={look} />)}</div>;
}

const AMOUNT: FieldDef[] = [
  { key: 'rate', label: 'How many each second', min: 0, max: 400, title: 'New particles every second (emission rate)' },
  { key: 'burst', label: 'Burst at the start', min: 0, max: 500, title: 'Particles all at once when it starts' },
  { key: 'life', label: 'How long each lives', min: 0.1, max: 12, step: 0.1, unit: ' s', title: 'Seconds before a particle is gone (lifetime)' },
  { key: 'emitFor', label: 'Stop after', min: 0, max: 30, step: 0.5, unit: ' s', title: '0 keeps it going for as long as the drawing is on the timeline' },
];

const MOTION: FieldDef[] = [
  { key: 'speed', label: 'Speed', min: 0, max: 1200, unit: ' px/s' },
  { key: 'direction', label: 'Direction', min: -180, max: 180, unit: '°', title: '-90 is up, 90 is down, 0 is right' },
  { key: 'spread', label: 'Spread', min: 0, max: 180, unit: '°', title: 'How far either side of the direction they can go' },
  { key: 'gravity', label: 'Gravity', min: -800, max: 1200, title: 'Pulls them down (or up, below zero)' },
  { key: 'wind', label: 'Wind', min: -600, max: 600, title: 'Pushes them right (or left, below zero)' },
  { key: 'drag', label: 'Slow down', min: 0, max: 6, step: 0.1, title: 'Air resistance (drag): they lose speed as they go' },
  { key: 'wobble', label: 'Wander', min: 0, max: 60, unit: ' px', title: 'A gentle drift from side to side' },
];

const LOOKS: FieldDef[] = [
  { key: 'sizeStart', label: 'Size at the start', min: 0, max: 200, unit: ' px' },
  { key: 'sizeEnd', label: 'Size at the end', min: 0, max: 200, unit: ' px' },
  { key: 'opacityStart', label: 'Solid at the start', min: 0, max: 100, pct: true, title: 'How see-through (opacity) when born' },
  { key: 'opacityEnd', label: 'Solid at the end', min: 0, max: 100, pct: true, title: 'How see-through (opacity) when it fades away' },
  { key: 'spin', label: 'Spin', min: -1080, max: 1080, step: 10, unit: '°/s' },
];

const VARIETY: FieldDef[] = [{ key: 'variance', label: 'Variety', min: 0, max: 100, pct: true, title: 'How much each particle differs in life, speed, size and spin' }];

const EMITTERS: { value: ParticlesShape['emitter']; label: string; title: string }[] = [
  { value: 'point', label: 'A point', title: 'Every particle starts at the same spot' },
  { value: 'line', label: 'A line', title: 'Particles start anywhere along a line (rain, snow)' },
  { value: 'area', label: 'A box', title: 'Particles start anywhere inside a box (dust, fireflies)' },
];

function Presets({ s, compact }: { s?: ParticlesShape; compact: boolean }) {
  return (
    <div className={compact ? 'pt-presets pt-presets-compact' : 'pt-presets'} role="group" aria-label="Presets">
      {PARTICLE_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="pt-preset"
          data-on={s ? s.preset === p.id : undefined}
          aria-pressed={s ? s.preset === p.id : undefined}
          title={s ? `${p.description} Click to use these settings on the selected particles.` : `${p.description} Click to add it.`}
          onClick={() => (s ? applyPreset(p.id) : addParticles(p.id))}
        >
          <Icon name={p.icon} size={compact ? 16 : 22} />
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}

function EmitterEditor({ s, look }: { s: ParticlesShape; look: PanelLook }) {
  const doc = useStore((st) => st.doc);
  const symbols = Object.values(doc.symbols ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  const preset = presetById(s.preset);
  const upd = (label: string, key: string, fn: (d: ParticlesShape) => void) => updateParticles(label, fn, { coalesce: `pt-${key}-${s.id}` });
  return (
    <>
      <div className="pt-head">
        <Icon name={preset?.icon ?? 'particles'} size={20} />
        <strong>{preset ? preset.label : 'Particles'}</strong>
        <button type="button" className="pt-shuffle" title="Same settings, a new random spread of particles (new seed)" onClick={shuffleSeed}>
          Shuffle
        </button>
      </div>
      <Section title="Start from">
        <Presets s={s} compact />
      </Section>
      <Section title="How they look">
        <div className="pt-wrap">
        <Choice<ParticleSprite> label="Each particle is" value={s.sprite} options={SPRITES.filter((x) => x.value !== 'symbol' || symbols.length).map((x) => ({ value: x.value, label: x.label }))} onChange={(v) => upd('Particle look', 'sprite', (d) => void ((d.sprite = v), v === 'symbol' && !d.symbolId && symbols[0] && (d.symbolId = symbols[0].id)))} />
        </div>
        {s.sprite === 'symbol' && (
          <label className="pt-row">
            <span>Symbol</span>
            <select className="sy-select" value={s.symbolId ?? ''} aria-label="Which symbol each particle shows" onChange={(e) => upd('Particle symbol', 'sym', (d) => void (d.symbolId = e.target.value))}>
              {symbols.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {s.sprite !== 'symbol' && (
          <div className="pt-colors">
            <ColorWell label={s.colorBy === 'random' ? 'Colours between' : 'Colour at the start'} value={s.colorStart} onChange={(v) => upd('Particle colour', 'c0', (d) => void (d.colorStart = v))} />
            <ColorWell label={s.colorBy === 'random' ? 'and' : 'at the end'} value={s.colorEnd} onChange={(v) => upd('Particle colour', 'c1', (d) => void (d.colorEnd = v))} />
          </div>
        )}
        {s.sprite !== 'symbol' && (
          <Choice
            label="Colours"
            value={s.colorBy ?? 'life'}
            options={[
              { value: 'life', label: 'Change as they age', title: 'Each starts in the first colour and ends in the second (colour over life)' },
              { value: 'random', label: 'A mix for each', title: 'Each one gets its own colour between the two, and keeps it' },
            ]}
            onChange={(v) => upd('Particle colours', 'cby', (d) => void (v === 'random' ? (d.colorBy = 'random') : delete d.colorBy))}
          />
        )}
        <Group s={s} fields={LOOKS} look={look} />
      </Section>
      <Section title="How many">
        <Group s={s} fields={AMOUNT} look={look} />
        <Toggle label="Already going when it starts" checked={!!s.prewarm} hint="Rain is already falling on the first frame (prewarm)" onChange={(v) => upd('Prewarm', 'pre', (d) => void (v ? (d.prewarm = true) : delete d.prewarm))} />
      </Section>
      <Section title="How they move" open={look === 'numbers'}>
        <Group s={s} fields={MOTION} look={look} />
      </Section>
      <Section title="Where they come from" open={look === 'numbers'}>
        <Choice label="Start from" value={s.emitter} options={EMITTERS} onChange={(v) => upd('Emitter shape', 'em', (d) => void ((d.emitter = v), v !== 'point' && d.width < 10 && (d.width = 200), v === 'area' && d.height < 10 && (d.height = 200)))} />
        {s.emitter !== 'point' && (
          <Group
            s={s}
            look={look}
            fields={[
              { key: 'width', label: s.emitter === 'line' ? 'Line length' : 'Box width', min: 0, max: Math.max(2000, doc.width * 2), unit: ' px' },
              ...(s.emitter === 'area' ? [{ key: 'height' as const, label: 'Box height', min: 0, max: Math.max(2000, doc.height * 2), unit: ' px' }] : []),
            ]}
          />
        )}
      </Section>
      <Section title="Variety" open={look === 'numbers'}>
        <Group s={s} fields={VARIETY} look={look} />
        <Num label="Seed" value={s.seed} step={1} title="The number every random choice comes from. The same seed always gives the same particles." onChange={(v) => upd('Particle seed', 'seed', (d) => void (d.seed = Math.round(v)))} />
      </Section>
    </>
  );
}

export function ParticlesPanel() {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const sel = useStore((s) => s.ui.selection);
  const layerId = useStore((s) => s.ui.activeLayerId);
  const layer = findLayer(doc, layerId);
  const cel = layer ? celAt(layer, frame) : undefined;
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  const picked = d?.kind === 'vector' ? d.shapes.filter((s): s is ParticlesShape => s.type === 'particles' && sel.includes(s.id)) : [];
  const look = panelLook();
  return (
    <div className="cv-options pt-panel" data-help="particles" data-look={look}>
      {picked.length === 1 ? (
        <EmitterEditor s={picked[0]} look={look} />
      ) : (
        <>
          <Tip>{picked.length > 1 ? `${picked.length} particle emitters selected. Pick just one to change it here.` : 'Click one to add it to your animation. Select particles on the canvas to change them.'}</Tip>
          <Presets compact={false} />
          <div className="cv-row cv-wrap">
            <ActionButton onClick={() => addParticles()} title="Adds a sparkle burst in the middle of the stage">
              Add particles
            </ActionButton>
          </div>
        </>
      )}
    </div>
  );
}
