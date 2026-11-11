// Symbol and motion: the selected symbol's place, look and playback, and the in-betweens on the key at the playhead.
import { useState, type ReactNode } from 'react';
import type { Easing, InstanceShape, PlayMode } from '../core/format';
import { celAt, findLayer } from '../core/doc';
import { getCommand } from '../core/registry';
import { store, useStore } from '../core/store';
import { EASE_PRESETS, presetOf } from '../core/ease';
import { instanceAt, isInstance, nextKey, symbolContent } from '../core/symbols';
import { ActionButton, Choice, Field, Slider, Tip, Toggle } from '../canvas/controls';
import { CurveEditor } from './CurveEditor';
import { clearMotionPath, editInstance, makeTween, pathFromSelection, removeTween, resetTransform, setEase, swapSymbol, updateInstances, updateTween, wouldNestInItself } from './ops';
import './symbols.css';

function Num({ label, value, onChange, step = 1, suffix, title }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; title?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 100) / 100);
  const commit = (s: string) => {
    const n = Number(s);
    if (s.trim() !== '' && Number.isFinite(n)) onChange(n);
    setDraft(null);
  };
  return (
    <label className="sy-num" title={title}>
      <span>{label}</span>
      <span className="sy-num-box">
        <input
          type="number"
          step={step}
          value={shown}
          aria-label={label}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            // Spinner arrows and typing both land straight away, coalesced into one undo step.
            if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit(e.currentTarget.value);
          }}
        />
        {suffix && <i>{suffix}</i>}
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sy-section">
      <h3 className="sy-section-title">{title}</h3>
      {children}
    </section>
  );
}

const PLAY_OPTIONS: { value: PlayMode; label: string; title: string }[] = [
  { value: 'loop', label: 'Loop', title: 'Plays its own animation round and round' },
  { value: 'once', label: 'Play once', title: 'Plays its animation once, then holds the last frame' },
  { value: 'single', label: 'One frame', title: 'Shows just one frame of it (good for swapping poses)' },
];

function InstanceSection({ inst, between }: { inst: InstanceShape; between: number | null }) {
  const doc = useStore((s) => s.doc);
  const c = symbolContent(doc, inst.symbolId);
  const t = inst.transform;
  const set = (label: string, key: string, fn: (s: InstanceShape) => void) => updateInstances(label, fn, { coalesce: `inst-${key}-${inst.id}` });
  const symbols = Object.values(doc.symbols ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Section title="Symbol">
      <div className="sy-swap">
        <Field label="Shows">
          <select
            className="sy-select"
            value={inst.symbolId}
            aria-label="Which symbol this shows"
            title="Swap it for another symbol, keeping where it is"
            onChange={(e) => swapSymbol(e.target.value)}
          >
            {symbols.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id !== inst.symbolId && wouldNestInItself(doc, s.id)}>
                {s.name}
              </option>
            ))}
            {!c && <option value={inst.symbolId}>(missing symbol)</option>}
          </select>
        </Field>
        <ActionButton onClick={() => editInstance(inst.id)} title="Open it to draw inside (or double-click it on the canvas)">
          Draw inside
        </ActionButton>
      </div>
      {between !== null && <Tip>You're between two keys, looking at an in-between. Changes go to the key on frame {between + 1}.</Tip>}
      <div className="sy-grid">
        <Num label="X" value={t.x} onChange={(v) => set('Move', 'x', (s) => void (s.transform.x = v))} />
        <Num label="Y" value={t.y} onChange={(v) => set('Move', 'y', (s) => void (s.transform.y = v))} />
        <Num label="Width" suffix="%" value={t.scaleX * 100} onChange={(v) => set('Resize', 'sx', (s) => void (s.transform.scaleX = v / 100))} title="Size across (scale X)" />
        <Num label="Height" suffix="%" value={t.scaleY * 100} onChange={(v) => set('Resize', 'sy', (s) => void (s.transform.scaleY = v / 100))} title="Size up and down (scale Y)" />
        <Num label="Turn" suffix="°" value={t.rotation} onChange={(v) => set('Turn', 'rot', (s) => void (s.transform.rotation = v))} title="Rotation, in degrees" />
        <Num label="Slant" suffix="°" value={t.skew} onChange={(v) => set('Slant', 'skew', (s) => void (s.transform.skew = v))} title="Skew, in degrees" />
      </div>
      <Slider label="See-through" value={Math.round((1 - inst.opacity) * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => set('See-through', 'op', (s) => void (s.opacity = 1 - v / 100))} hint="Fades the whole symbol (opacity). In-betweens can fade it in or out." />
      <Field label="Colour wash (tint)" value={`${Math.round((inst.tint?.amount ?? 0) * 100)}%`}>
        <div className="cv-row">
          <input
            type="color"
            className="sy-color"
            aria-label="Tint colour"
            value={inst.tint?.color ?? '#ff6f91'}
            onChange={(e) => set('Tint', 'tintc', (s) => void (s.tint = { color: e.target.value, amount: s.tint?.amount || 0.5 }))}
          />
          <input
            className="cv-slider"
            type="range"
            min={0}
            max={100}
            aria-label="Tint amount"
            value={Math.round((inst.tint?.amount ?? 0) * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              set('Tint', 'tinta', (s) => {
                if (v <= 0) delete s.tint;
                else s.tint = { color: s.tint?.color ?? '#ff6f91', amount: v };
              });
            }}
          />
        </div>
      </Field>
      {c && c.length > 1 ? (
        <>
          <Choice label={`Its own animation (${c.length} frames)`} value={inst.play} options={PLAY_OPTIONS} onChange={(v) => set('Playback', 'play', (s) => void (s.play = v))} />
          <div className="sy-grid">
            <Num label={inst.play === 'single' ? 'Frame' : 'Starts on'} value={inst.firstFrame + 1} onChange={(v) => set('First frame', 'first', (s) => void (s.firstFrame = Math.max(0, Math.min(c.length - 1, Math.round(v) - 1))))} title="Which of its own frames it starts on" />
          </div>
          {c.def.frameLabels?.[inst.firstFrame] ? <Tip>Frame {inst.firstFrame + 1} is named "{c.def.frameLabels[inst.firstFrame]}".</Tip> : null}
        </>
      ) : (
        <Tip>Its drawing has one frame. Draw inside it and add frames to give it its own animation, like a flapping wing.</Tip>
      )}
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => resetTransform()}>Reset size and turn</ActionButton>
      </div>
    </Section>
  );
}

function TweenSection() {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const layerId = useStore((s) => s.ui.activeLayerId);
  const hasSelection = useStore((s) => s.ui.selection.length > 0);
  const layer = findLayer(doc, layerId) ?? doc.layers[doc.layers.length - 1];
  const cel = layer ? celAt(layer, frame) : undefined;
  if (!layer || !cel) return null;
  if (layer.kind !== 'vector') return null;
  const tw = cel.tween;
  if (!tw) {
    return (
      <Section title="In-betweens (tween)">
        <Tip>Make the drawing glide, grow, turn or fade from this key to the next one. Frameling draws every frame in between.</Tip>
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => makeTween()} title="Make in-betweens (Ctrl+Shift+T)">
            Make in-betweens
          </ActionButton>
        </div>
      </Section>
    );
  }
  const next = nextKey(layer, cel);
  const custom = Array.isArray(tw.ease);
  const preset = presetOf(tw.ease);
  return (
    <Section title="In-betweens (tween)">
      {next ? (
        <Tip>
          From frame {cel.start + 1} to frame {next.start + 1}. {preset ? preset.description : 'Your own curve.'}
        </Tip>
      ) : (
        <Tip>The next key doesn't start straight after this one, so nothing moves. Drag them together in the timeline.</Tip>
      )}
      <Field label="Easing">
        <select
          className="sy-select"
          aria-label="Easing"
          value={custom ? 'custom' : (tw.ease as string)}
          onChange={(e) => {
            const v = e.target.value;
            if (v !== 'custom') setEase(v as Easing);
          }}
        >
          {EASE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.term})
            </option>
          ))}
          <option value="custom" disabled={!custom}>
            Custom curve
          </option>
        </select>
      </Field>
      <CurveEditor value={tw.ease} onChange={(e) => setEase(e, `ease-${cel.id}`)} />
      <div className="sy-grid">
        <Num label="Extra spins" value={tw.spin ?? 0} onChange={(v) => updateTween('Extra spins', (t) => void (Math.round(v) ? (t.spin = Math.round(v)) : delete t.spin), { coalesce: `spin-${cel.id}` })} title="Whole turns on the way. Negative spins the other way." />
      </div>
      <Field label="Path to follow (motion path)">
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => store().setUi({ tool: 'motion-path' })} title="Draw the line it should travel along">
            {tw.path ? 'Draw a new path' : 'Draw a path'}
          </ActionButton>
          {hasSelection && <ActionButton onClick={() => pathFromSelection()}>Use selected line</ActionButton>}
          {tw.path && <ActionButton onClick={() => clearMotionPath()}>Straight line again</ActionButton>}
        </div>
      </Field>
      {tw.path && <Toggle label="Turn to face along the path" checked={tw.path.orient} onChange={(v) => updateTween('Turn along the path', (t) => void (t.path && (t.path.orient = v)))} />}
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => removeTween()}>Remove in-betweens</ActionButton>
      </div>
    </Section>
  );
}

export function PropertiesPanel() {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const sel = useStore((s) => s.ui.selection);
  const layerId = useStore((s) => s.ui.activeLayerId);
  const layer = findLayer(doc, layerId);
  const cel = layer ? celAt(layer, frame) : undefined;
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  const picked = d?.kind === 'vector' ? d.shapes.filter((s): s is InstanceShape => isInstance(s) && sel.includes(s.id)) : [];
  const inst = picked.length === 1 ? picked[0] : undefined;
  // Mid-tween the canvas shows the in-between, but the numbers belong to the key.
  const between = inst && layer && cel && cel.tween && frame > cel.start && instanceAt(doc, layer, frame, inst.id) !== inst ? cel.start : null;
  return (
    <div className="cv-options sy-props" data-help="symbol-properties">
      {inst ? (
        <InstanceSection inst={inst} between={between} />
      ) : (
        <Tip>
          {picked.length > 1 ? `${picked.length} symbols selected. Pick just one to change it here.` : 'Select a symbol on the canvas to change its size, turn, fade, colour wash and how it plays.'}{' '}
          {!picked.length && sel.length > 0 && (
            <button type="button" className="sy-link" onClick={() => void getCommand('symbols.make')?.run()}>
              Make the selection a symbol
            </button>
          )}
        </Tip>
      )}
      <TweenSection />
    </div>
  );
}
