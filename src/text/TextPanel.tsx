// The Text panel: the selected text's words, font and look, its animations, and Convert to shapes. The Text tool's
// options use the same font fields for what new text starts with.
import { useSyncExternalStore } from 'react';
import type { Easing, TextAnimator, TextShape } from '../core/format';
import { celAt, findLayer } from '../core/doc';
import { getCommand } from '../core/registry';
import { useStore } from '../core/store';
import { EASE_PRESETS } from '../core/ease';
import { ActionButton, Choice, Field, Tip } from '../canvas/controls';
import { Icon } from '../ui/icons';
import { ColorWell, Num, Section } from '../particles/fields';
import { animInfo, fontFamilyCss, SHIPPED_FONTS, TEXT_ANIMS, TEXT_UNITS } from './model';
import { addAnimator, onTextDefaults, removeAnimator, setTextDefaults, textDefaults, updateAnimator, updateTexts } from './ops';
import { systemFonts } from './fonts';
import { editText } from './TextEditor';

const WEIGHTS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 600, label: 'Semi-bold' },
  { value: 700, label: 'Bold' },
  { value: 900, label: 'Black' },
];

const ALIGN: { value: TextShape['align']; label: string; title: string }[] = [
  { value: 'left', label: 'Left', title: 'Lines start at the same place (align left)' },
  { value: 'center', label: 'Middle', title: 'Lines are centred (align centre)' },
  { value: 'right', label: 'Right', title: 'Lines end at the same place (align right)' },
];

export function FontPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const sys = systemFonts();
  const known = SHIPPED_FONTS.some((f) => f.name === value) || sys.includes(value);
  return (
    <label className="pt-row">
      <span>Font</span>
      <select className="sy-select" value={value} aria-label="Font" style={{ fontFamily: fontFamilyCss(value) }} onChange={(e) => onChange(e.target.value)}>
        <optgroup label="Comes with Frameling (looks the same everywhere)">
          {SHIPPED_FONTS.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </optgroup>
        {sys.length > 0 && (
          <optgroup label="On this computer">
            {sys.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </optgroup>
        )}
        {!known && <option value={value}>{value} (not on this computer)</option>}
      </select>
    </label>
  );
}

function WeightPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="pt-row">
      <span>Weight</span>
      <select className="sy-select" value={WEIGHTS.some((w) => w.value === value) ? value : 400} aria-label="Font weight" onChange={(e) => onChange(Number(e.target.value))}>
        {WEIGHTS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The Text tool's options: what new text starts with. */
export function TextOptions() {
  const d = useSyncExternalStore(onTextDefaults, textDefaults);
  return (
    <div className="cv-options tx-panel" data-help="text">
      <Tip>Click on the stage and start typing. Press Esc when you're done. Double-click text to change it.</Tip>
      <FontPicker value={d.font} onChange={(font) => setTextDefaults({ font })} />
      <div className="sy-grid">
        <Num label="Size" value={d.size} min={1} max={2000} suffix="px" onChange={(size) => setTextDefaults({ size })} />
      </div>
      <WeightPicker value={d.weight} onChange={(weight) => setTextDefaults({ weight })} />
      <Choice label="Line up" value={d.align} options={ALIGN} onChange={(align) => setTextDefaults({ align })} />
    </div>
  );
}

const ORDER: { value: NonNullable<TextAnimator['order']>; label: string; title: string }[] = [
  { value: 'forward', label: 'First to last', title: 'From the start of the text to the end' },
  { value: 'backward', label: 'Last to first', title: 'From the end of the text back to the start' },
  { value: 'middle', label: 'From the middle', title: 'The middle first, then out to both ends' },
  { value: 'random', label: 'Shuffled', title: 'In a random order (the same every time)' },
];

function AnimatorCard({ text, a }: { text: TextShape; a: TextAnimator }) {
  const info = animInfo(a.kind);
  const set = (label: string, fn: (x: TextAnimator) => void) => updateAnimator(text.id, a.id, label, fn);
  const easeKey = typeof a.ease === 'string' ? a.ease : 'easeOut';
  return (
    <div className="tx-anim">
      <div className="tx-anim-head">
        <strong title={`${info.description} (${info.term})`}>{info.label}</strong>
        <button type="button" className="tx-icon-btn" title={a.on === false ? 'Turn it back on' : 'Turn it off for now'} aria-label={a.on === false ? 'Turn on' : 'Turn off'} onClick={() => set('Turn text animation on or off', (x) => void (x.on === false ? delete x.on : (x.on = false)))}>
          <Icon name={a.on === false ? 'eye-off' : 'eye'} size={16} />
        </button>
        <button type="button" className="tx-icon-btn" title="Remove this animation" aria-label="Remove" onClick={() => removeAnimator(text.id, a.id)}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      <Choice label="One at a time" value={a.by} options={TEXT_UNITS} onChange={(v) => set('Animate by', (x) => void (x.by = v))} />
      {info.directional && (
        <Choice
          label="Comes"
          value={a.direction ?? 'in'}
          options={[
            { value: 'in', label: 'In', title: 'Starts changed and settles into the plain text' },
            { value: 'out', label: 'Out', title: 'Starts as plain text and changes away' },
          ]}
          onChange={(v) => set('Animate in or out', (x) => void (v === 'out' ? (x.direction = 'out') : delete x.direction))}
        />
      )}
      <label className="pt-row">
        <span>Order</span>
        <select className="sy-select" value={a.order ?? 'forward'} aria-label="Which piece goes first" onChange={(e) => set('Animation order', (x) => void (x.order = e.target.value as TextAnimator['order']))}>
          {ORDER.map((o) => (
            <option key={o.value} value={o.value} title={o.title}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className="sy-grid">
        <Num label="Starts on frame" value={a.start + 1} step={1} title="Frames after the text's key starts" onChange={(v) => set('Animation start', (x) => void (x.start = Math.round(v) - 1))} />
        {a.kind !== 'typewriter' && <Num label={a.kind === 'wave' ? 'Frames per wave' : 'Frames each'} value={a.duration} min={1} step={1} onChange={(v) => set('Animation length', (x) => void (x.duration = Math.max(1, Math.round(v))))} />}
        <Num label="Frames between" value={a.stagger} min={0} step={0.5} title="How long after one piece the next one starts (stagger)" onChange={(v) => set('Animation stagger', (x) => void (x.stagger = Math.max(0, v)))} />
        {info.amount && <Num label={info.amount.label} value={a.amount} min={info.amount.min} max={info.amount.max} step={info.amount.step} suffix={info.amount.unit} onChange={(v) => set('Animation amount', (x) => void (x.amount = v))} />}
        {a.kind === 'slide' && <Num label="From" value={a.angle ?? 90} suffix="°" step={15} title="Which way it comes from: 90 is below, -90 above, 0 the right, 180 the left" onChange={(v) => set('Slide direction', (x) => void (x.angle = v))} />}
      </div>
      {a.kind !== 'typewriter' && a.kind !== 'wave' && (
        <label className="pt-row">
          <span>Feel</span>
          <select className="sy-select" value={EASE_PRESETS.some((p) => p.id === easeKey) ? easeKey : 'easeOut'} aria-label="Easing" onChange={(e) => set('Animation easing', (x) => void (x.ease = e.target.value as Easing))}>
            {EASE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function TextEditorPanel({ s }: { s: TextShape }) {
  const upd = (label: string, key: string, fn: (d: TextShape) => void) => updateTexts(label, fn, { coalesce: `tx-${key}-${s.id}` });
  return (
    <>
      <Section title="Words">
        <textarea className="tx-content" value={s.text} aria-label="The text" spellCheck onKeyDown={(e) => e.stopPropagation()} onChange={(e) => upd('Change text', 'text', (d) => void (d.text = e.target.value))} />
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => editText(s.id)} title="Type straight onto the canvas (or double-click the text)">
            Type on the canvas
          </ActionButton>
        </div>
      </Section>
      <Section title="Look">
        <FontPicker value={s.font} onChange={(v) => upd('Font', 'font', (d) => void (d.font = v))} />
        <WeightPicker value={s.weight} onChange={(v) => upd('Font weight', 'weight', (d) => void (d.weight = v))} />
        <div className="sy-grid">
          <Num label="Size" value={s.size} min={1} max={2000} suffix="px" onChange={(v) => upd('Text size', 'size', (d) => void (d.size = Math.max(1, v)))} />
          <Num label="Line spacing" value={s.lineHeight ?? 1.2} min={0.3} max={10} step={0.1} suffix="×" title="Space from one line to the next, as a multiple of the size (leading)" onChange={(v) => upd('Line spacing', 'lh', (d) => void (d.lineHeight = v))} />
          <Num label="Letter spacing" value={s.letterSpacing ?? 0} step={0.5} suffix="px" title="Extra space between letters (tracking)" onChange={(v) => upd('Letter spacing', 'ls', (d) => void (d.letterSpacing = v))} />
          <Num label="Solid" value={Math.round(s.opacity * 100)} min={0} max={100} suffix="%" title="How see-through it is (opacity)" onChange={(v) => upd('Text opacity', 'op', (d) => void (d.opacity = Math.max(0, Math.min(1, v / 100))))} />
        </div>
        <div className="cv-row cv-wrap">
          <ColorWell label="Colour" value={s.color} onChange={(v) => upd('Text colour', 'color', (d) => void (d.color = v))} />
          <label className="pt-row">
            <input type="checkbox" checked={!!s.italic} onChange={(e) => upd('Italic', 'it', (d) => void (e.target.checked ? (d.italic = true) : delete d.italic))} />
            <span>Italic</span>
          </label>
        </div>
        <Choice label="Line up" value={s.align} options={ALIGN} onChange={(v) => upd('Line up text', 'align', (d) => void (d.align = v))} />
      </Section>
      <Section title="Animate the letters" help="text-animators">
        {(s.animators ?? []).map((a) => (
          <AnimatorCard key={a.id} text={s} a={a} />
        ))}
        {!(s.animators ?? []).length && <Tip>Letters, words or lines can fade, slide, grow, spin, type on or wave, one after another.</Tip>}
        <Field label="Add">
          <div className="tx-add">
            {TEXT_ANIMS.map((x) => (
              <ActionButton key={x.kind} title={`${x.description} (${x.term})`} onClick={() => addAnimator(x.kind, s.id)}>
                {x.label}
              </ActionButton>
            ))}
          </div>
        </Field>
      </Section>
      <Section title="Shapes" open={false}>
        <Tip>Turn the text into ordinary filled shapes you can reshape. It can't be typed into afterwards.</Tip>
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => void getCommand('text.toShapes')?.run()}>Convert to shapes</ActionButton>
        </div>
      </Section>
    </>
  );
}

export function TextPanel() {
  const doc = useStore((st) => st.doc);
  const frame = useStore((st) => st.ui.frame);
  const sel = useStore((st) => st.ui.selection);
  const layerId = useStore((st) => st.ui.activeLayerId);
  const layer = findLayer(doc, layerId);
  const cel = layer ? celAt(layer, frame) : undefined;
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  const picked = d?.kind === 'vector' ? d.shapes.filter((s): s is TextShape => s.type === 'text' && sel.includes(s.id)) : [];
  return (
    <div className="cv-options tx-panel" data-help="text">
      {picked.length === 1 ? (
        <TextEditorPanel s={picked[0]} />
      ) : (
        <>
          <Tip>{picked.length > 1 ? `${picked.length} texts selected. Pick just one to change it here.` : 'Pick the Text tool (T), click on the stage and type. Select text to change its font, size and animations here.'}</Tip>
          <div className="cv-row cv-wrap">
            <ActionButton onClick={() => void getCommand('tools.text')?.run()}>Use the Text tool</ActionButton>
          </div>
        </>
      )}
    </div>
  );
}
