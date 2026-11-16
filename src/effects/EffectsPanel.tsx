// The Effects panel: how the active layer (or its folder) mixes with what's under it, and its stack of effects.
// Every change shows on the canvas straight away. Plain words first, the industry term second.
import { useMemo, useState, useSyncExternalStore } from 'react';
import { celAt, findLayer } from '../core/doc';
import type { BlendMode, EffectKind, Layer, LayerEffect, LayerFolder } from '../core/format';
import { folderChain } from '../core/folders';
import { useStore } from '../core/store';
import { ActionButton, Choice, Field, Slider, Tip, Toggle } from '../canvas/controls';
import { Icon } from '../ui/icons';
import { ContextMenu, Floating } from '../timeline/Menu';
import { setLayerOpacity } from '../timeline/ops';
import type { Target } from './edit';
import { stackOf } from './shapeFx';
import { BLEND_MODES, blendInfo, EFFECTS, effectInfo, valuesAt, type EffectParam } from './model';
import * as ops from './ops';
import type { AnyTarget } from './ops';
import { toggleClip, toggleMask } from './commands';
import '../canvas/canvas.css';
import './effects.css';

// ---------------------------------------------------------------- look variant (A/B)

/** 'tiles': the six effects always in view as a grid (A, the default). 'menu': one "Add effect" button (B). */
export type AddStyle = 'tiles' | 'menu';
let addStyle: AddStyle = 'tiles';
const styleListeners = new Set<() => void>();
export function setAddStyle(s: AddStyle): void {
  addStyle = s;
  styleListeners.forEach((f) => f());
}
function useAddStyle(): AddStyle {
  return useSyncExternalStore(
    (f) => (styleListeners.add(f), () => styleListeners.delete(f)),
    () => addStyle,
  );
}

// ---------------------------------------------------------------- panel

export function EffectsPanel() {
  const layer = useStore((s) => findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1]);
  const folders = useStore((s) => s.doc.folders);
  const selection = useStore((s) => s.ui.selection);
  // The drawing showing on the active layer now: the picked shapes live in it.
  const drawing = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    const cel = l && l.kind === 'vector' ? celAt(l, s.ui.frame) : undefined;
    return cel ? s.doc.drawings[cel.drawingId] : undefined;
  });
  // The folders around the layer, the nearest first: any of them can be changed as a whole.
  const around = layer ? folderChain(folders, layer.folder).reverse() : [];
  // 'auto': the picked shapes when there are some, else the layer.
  const [pick, setPick] = useState<string>('auto');
  const picked = useMemo(() => {
    if (!drawing || drawing.kind !== 'vector' || !selection.length) return [];
    const ids = new Set(selection);
    return drawing.shapes.filter((x) => ids.has(x.id));
  }, [drawing, selection]);
  if (!layer) return <div className="cv-panel-empty">Add a layer to give it effects.</div>;
  const folder = around.find((f) => f.id === pick) ?? (pick === 'folder' ? around[0] : undefined);
  const onShapes = !folder && picked.length > 0 && pick !== 'layer';
  const useFolder = !!folder;
  const target: AnyTarget = onShapes ? { shapes: true } : useFolder ? { folder: folder!.id } : { layer: layer.id };
  const look: Layer | LayerFolder | undefined = onShapes ? undefined : useFolder ? folder! : layer;
  const stack = onShapes ? stackOf(picked) : { effects: look?.effects ?? [], mixed: false };
  const word = picked.length === 1 ? 'the picked shape' : `the ${picked.length} picked shapes`;
  return (
    <div className="cv-panel fx-panel" aria-label="Effects">
      {around.length || picked.length ? (
        <Choice
          label="Change"
          value={onShapes ? 'shapes' : folder ? folder.id : 'layer'}
          options={[
            ...(picked.length ? [{ value: 'shapes', label: `Shape: ${picked.length === 1 ? 'the one you picked' : `${picked.length} you picked`}`, title: 'Change just the shape or shapes you picked: a soft shadow under one shape, a glow round a title. The rest of the layer is left alone.' }] : []),
            { value: 'layer', label: `Layer: ${layer.name}`, title: 'Change this layer on its own' },
            ...around.map((f) => ({ value: f.id, label: `Folder: ${f.name}`, title: 'Change the whole folder: everything in it fades, blends and takes effects together' })),
          ]}
          onChange={(v) => setPick(v)}
        />
      ) : (
        <div className="fx-target">
          <Icon name={layer.mask ? 'mask' : layer.kind} size={15} />
          <span className="fx-target-name">{layer.name}</span>
        </div>
      )}

      {/* A mask only decides where, so how see-through it is changes nothing. */}
      {onShapes || (layer.mask && !useFolder) ? null : (
        <Slider
          label="See-through (opacity)"
          value={Math.round(look!.opacity * 100)}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onChange={(v) => (useFolder ? ops.setFolderOpacity(folder!.id, v / 100) : setLayerOpacity(layer.id, v / 100))}
        />
      )}

      {onShapes || (layer.mask && !useFolder) ? null : <BlendPicker value={look!.blend ?? 'normal'} onChange={(m) => ops.setBlend(target as Target, m)} />}

      {!useFolder && !onShapes && <ClipAndMask layer={layer} />}

      {onShapes && (
        <p className="fx-empty" data-testid="fx-shape-note">
          {stack.mixed
            ? `These shapes have different effects. You see the first one's. Adding or changing an effect here goes on every shape that has it.`
            : `These go on ${word} only, before anything the layer does to all of it. They stay the same on every frame; to change them over time, give the shape a new key.`}
        </p>
      )}

      <EffectStack target={target} effects={stack.effects} on={onShapes ? word : 'this layer'} />

      <div className="fx-footer">
        <ActionButton
          title={onShapes ? 'Take every effect off the picked shapes' : 'Normal blend and no effects'}
          disabled={onShapes ? !picked.some((x) => (x as { effects?: unknown[] }).effects?.length) : !look!.effects?.length && (look!.blend ?? 'normal') === 'normal'}
          onClick={() => ops.resetLook(target)}
        >
          {onShapes ? 'Take effects off' : 'Reset all'}
        </ActionButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- blend modes

function BlendPicker({ value, onChange }: { value: BlendMode; onChange: (m: BlendMode) => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const info = blendInfo(value);
  return (
    <Field label="Blend (mix with what's under it)" hint={info.description}>
      <button
        type="button"
        className="fx-blend-btn"
        aria-haspopup="listbox"
        aria-expanded={!!at}
        title="How this layer mixes with the layers under it"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        <Icon name="blend" size={15} />
        <span className="fx-blend-label">{info.label}</span>
        {info.term !== info.label && <span className="fx-term">{info.term}</span>}
        <Icon name="chevron-down" size={14} />
      </button>
      {at && (
        <Floating x={at.x} y={at.y} onClose={() => setAt(null)} className="fx-blend-list">
          <div role="listbox" aria-label="Blend modes">
            {BLEND_MODES.map((b) => (
              <button
                key={b.mode}
                type="button"
                role="option"
                aria-selected={b.mode === value}
                className="fx-blend-item"
                data-on={b.mode === value}
                onClick={() => {
                  onChange(b.mode);
                  setAt(null);
                }}
              >
                <span className="fx-blend-item-head">
                  <b>{b.label}</b>
                  {b.term !== b.label && <span className="fx-term">{b.term}</span>}
                </span>
                <span className="fx-blend-item-desc">{b.description}</span>
              </button>
            ))}
          </div>
        </Floating>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------- clipping and masks

function ClipAndMask({ layer }: { layer: Layer }) {
  const isBottom = useStore((s) => s.doc.layers[0]?.id === layer.id);
  return (
    <div className="fx-group">
      <Toggle
        label="Clip to the layer below"
        checked={!!layer.clipToBelow}
        onChange={() => toggleClip(layer)}
        hint={isBottom ? 'Nothing under this layer to clip to yet.' : 'Only shows where the layer under it has drawing (a clipping mask).'}
      />
      {layer.mask ? (
        <Toggle
          label="Mask is on"
          checked={layer.visible}
          onChange={() => ops.setMaskOn(layer.id, !layer.visible)}
          hint="Switch it off to see the layers without it. The mask and its drawing are kept."
        />
      ) : null}
      <Choice
        label="Mask (layer mask)"
        value={layer.mask ?? 'off'}
        options={[
          { value: 'off', label: 'Off', title: 'A normal layer. A mask taken off shows its drawing like any layer.' },
          { value: 'show', label: 'Show', title: 'Show inside: not shown itself. The layers under it only show where this layer has drawing.' },
          { value: 'hide', label: 'Hide', title: 'Hide inside: not shown itself. The layers under it are hidden where this layer has drawing.' },
        ]}
        onChange={(v) => {
          if (v === 'off') ops.setMask(layer.id, null);
          else if (!layer.mask) toggleMask(layer, v);
          else ops.setMask(layer.id, v);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- the effect stack

function EffectStack({ target, effects, on }: { target: AnyTarget; effects: LayerEffect[]; on: string }) {
  const style = useAddStyle();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const add = (k: EffectKind) => ops.addEffect(target, k);
  return (
    <section className="fx-stack" aria-label={`Effects on ${on}`}>
      <div className="fx-stack-head">
        <span className="cv-field-label">Effects</span>
        {effects.length > 1 && <span className="fx-stack-order">first to last</span>}
      </div>
      {effects.length === 0 && <p className="fx-empty">No effects yet. Pick one below: it shows on the canvas straight away.</p>}
      {effects.map((e, i) => (
        <EffectCard key={e.id} target={target} effect={e} first={i === 0} last={i === effects.length - 1} />
      ))}
      {style === 'tiles' ? (
        <div className="fx-add-grid" role="group" aria-label="Add an effect">
          {EFFECTS.map((e) => (
            <button key={e.kind} type="button" className="fx-add-tile" title={`${e.label} (${e.term}): ${e.description}`} onClick={() => add(e.kind)}>
              <Icon name={e.icon} size={18} />
              <span>{e.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="fx-add-btn"
            aria-haspopup="menu"
            onClick={(ev) => {
              const r = ev.currentTarget.getBoundingClientRect();
              setMenuAt({ x: r.left, y: r.bottom + 4 });
            }}
          >
            <Icon name="plus" size={15} /> Add effect
          </button>
          {menuAt && (
            <ContextMenu
              x={menuAt.x}
              y={menuAt.y}
              onClose={() => setMenuAt(null)}
              items={EFFECTS.map((e) => ({ label: `${e.label} (${e.term})`, hint: e.description, onClick: () => add(e.kind) }))}
            />
          )}
        </>
      )}
    </section>
  );
}

function EffectCard({ target, effect, first, last }: { target: AnyTarget; effect: LayerEffect; first: boolean; last: boolean }) {
  const shapes = 'shapes' in target;
  const info = effectInfo(effect.kind);
  const frame = useStore((s) => s.ui.frame);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const on = effect.on !== false;
  const animated = !shapes && !!effect.keys?.length;
  const keyHere = !!effect.keys?.some((k) => k.frame === frame);
  const v = valuesAt(effect, frame);
  return (
    <div className="fx-card" data-off={!on}>
      <div className="fx-card-head">
        <button type="button" className="fx-icon-btn" aria-pressed={on} title={on ? 'Turn this effect off for a moment' : 'Turn this effect back on'} aria-label={on ? 'Turn off' : 'Turn on'} onClick={() => ops.setEffectOn(target, effect.id, !on)}>
          <Icon name={on ? 'eye' : 'eye-off'} size={15} />
        </button>
        <Icon name={info.icon} size={16} />
        <span className="fx-card-name">
          {info.label}
          {info.term !== info.label && <span className="fx-term">{info.term}</span>}
        </span>
        {!shapes && <button
          type="button"
          className="fx-icon-btn fx-anim"
          data-on={animated}
          aria-pressed={animated}
          title={animated ? 'Animated: moving a slider sets a key on this frame. Click to stop animating.' : 'Animate: change the settings over time with keys'}
          aria-label={animated ? 'Stop animating' : 'Animate'}
          onClick={() => ops.setEffectAnimated(target as Target, effect.id, !animated)}
        >
          <Icon name="key" size={14} />
        </button>}
        <button
          type="button"
          className="fx-icon-btn"
          title="More: move up or down, reset, remove"
          aria-label="More effect options"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 2 });
          }}
        >
          <Icon name="more" size={16} />
        </button>
      </div>
      {animated && (
        <div className="fx-keys">
          <span className="fx-key-dot" data-on={keyHere} aria-hidden="true" />
          <span>{keyHere ? `Key on frame ${frame + 1}` : `Between keys. Move a slider to add a key on frame ${frame + 1}.`}</span>
          {keyHere && (
            <button type="button" className="fx-link" onClick={() => ops.removeEffectKey(target as Target, effect.id)}>
              Remove key
            </button>
          )}
        </div>
      )}
      <div className="fx-params">
        {info.params.map((p) => (
          <ParamRow key={p.key} p={p} value={v[p.key]} onChange={(x) => ops.setEffectValue(target, effect.id, p.key, x)} />
        ))}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { heading: `${info.label} (${info.term})` },
            { label: 'Move up (earlier)', disabled: first, onClick: () => void ops.moveEffect(target, effect.id, -1) },
            { label: 'Move down (later)', disabled: last, onClick: () => void ops.moveEffect(target, effect.id, 1) },
            { separator: true },
            { label: 'Reset to how it started', onClick: () => void ops.resetEffect(target, effect.id) },
            { label: 'Remove effect', danger: true, onClick: () => void ops.removeEffect(target, effect.id) },
          ]}
        />
      )}
    </div>
  );
}

function ParamRow({ p, value, onChange }: { p: EffectParam; value: number | string; onChange: (v: number | string) => void }) {
  if (p.type === 'color') {
    return (
      <Field label={p.label} value={<code className="fx-hex">{String(value).slice(0, 7)}</code>}>
        <input className="fx-color" type="color" value={String(value).slice(0, 7)} aria-label={p.label} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }
  const n = Number(value);
  const shown = p.step && p.step < 1 ? +n.toFixed(2) : Math.round(n);
  return <Slider label={p.label} value={n} min={p.min ?? 0} max={p.max ?? 100} step={p.step ?? 1} format={() => `${shown}${p.unit ?? ''}`} onChange={onChange} />;
}
