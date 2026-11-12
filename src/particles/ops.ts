// Changes to particle emitters: adding one from a preset, and changing the selected ones.
import type { Draft } from 'immer';
import type { Id, ParticlesShape, VectorDrawing } from '../core/format';
import { findLayer, uid } from '../core/doc';
import { withChoice, type ChoiceDef } from '../core/choices';
import { store } from '../core/store';
import { currentKey } from '../symbols/ops';
import { addVectorLayer } from '../timeline/edit-core';
import { EDIT_HINTS, editActiveDrawing } from '../tools/edit';
import { toast } from '../ui/toast';
import { newParticles, presetById, PARTICLE_PRESETS } from './model';

export type ParticlesWhere = 'new-layer' | 'this-layer';

export const particlesWhere: ChoiceDef<ParticlesWhere> = {
  id: 'particles.where',
  title: 'Where new particles go',
  question: 'Where should new particles go?',
  options: [
    { value: 'new-layer', label: 'On a new layer of their own', detail: 'Easiest to give them a glow or a blend mode, hide them, or move them in front of or behind things.' },
    { value: 'this-layer', label: 'On the layer I have picked', detail: 'They sit with the drawing on that layer and share its look.' },
  ],
  default: 'new-layer',
  category: 'Drawing',
  help: 'particles',
};

/** The selected emitters on the active drawing. */
export function selectedParticles(): ParticlesShape[] {
  const k = currentKey();
  if (!k) return [];
  const sel = new Set(store().get().ui.selection);
  return k.drawing.shapes.filter((s): s is ParticlesShape => s.type === 'particles' && sel.has(s.id));
}

/** Changes the selected emitters (or one by id). */
export function updateParticles(label: string, fn: (s: Draft<ParticlesShape>) => void, opts: { coalesce?: string; id?: Id } = {}): void {
  const k = currentKey();
  const ids = opts.id ? [opts.id] : selectedParticles().map((s) => s.id);
  if (!k || !ids.length) return;
  if (k.layer.locked) return void toast(EDIT_HINTS.locked);
  store().update(
    label,
    (doc) => {
      const d = doc.drawings[k.drawing.id] as Draft<VectorDrawing>;
      for (const s of d.shapes) if (s.type === 'particles' && ids.includes(s.id)) fn(s);
    },
    opts,
  );
}

/** Where a preset starts on the stage: rain and snow just above the top, the rest in the middle. */
export function presetSpot(presetId: string, stage: { width: number; height: number }): { x: number; y: number } {
  if (presetId === 'rain' || presetId === 'snow') return { x: stage.width / 2, y: -20 };
  if (presetId === 'smoke') return { x: stage.width / 2, y: stage.height * 0.75 };
  if (presetId === 'confetti') return { x: stage.width / 2, y: stage.height * 0.85 };
  return { x: stage.width / 2, y: stage.height / 2 };
}

/** A different seed: the same settings, a new random spread. */
export function shuffleSeed(): void {
  updateParticles('Shuffle particles', (s) => void (s.seed = 1 + Math.floor(Math.random() * 999999)));
}

/** Applies a preset's settings to the selected emitters, keeping where they are. */
export function applyPreset(presetId: string): void {
  const p = presetById(presetId);
  if (!p) return;
  updateParticles(`Particles: ${p.label}`, (s) => {
    const keep = { id: s.id, group: s.group, transform: s.transform, seed: s.seed, width: s.width, height: s.height };
    Object.assign(s, p.values, keep, p.values.emitter !== s.emitter ? { width: p.values.width, height: p.values.height } : {});
    if (keep.group === undefined) delete s.group;
    if (p.values.sprite !== 'symbol') delete s.symbolId;
    if (!p.values.prewarm) delete s.prewarm;
    if (!p.values.wobble) delete s.wobble;
    if (!p.values.colorBy) delete s.colorBy;
  });
}

/** Adds an emitter from a preset (asked once whether it gets its own layer) and selects it. */
export function addParticles(presetId: string = PARTICLE_PRESETS[0].id, at?: { x: number; y: number }): void {
  const { doc } = store().get();
  const preset = presetById(presetId) ?? PARTICLE_PRESETS[0];
  const spot = at ?? presetSpot(preset.id, doc);
  const shape = newParticles(uid('pt'), preset.id, spot, doc, 1 + Math.floor(Math.random() * 99999));
  const active = findLayer(doc, store().get().ui.activeLayerId);
  const place = (where: ParticlesWhere) => {
    if (where === 'this-layer' && active?.kind === 'vector' && !active.locked && active.visible) {
      const r = editActiveDrawing(`Add ${preset.label.toLowerCase()}`, 'vector', (d) => void d.shapes.push(shape));
      if (r === 'ok') store().setUi({ selection: [shape.id] });
      return;
    }
    const frame = store().get().ui.frame;
    let layerId: Id = '';
    store().update(`Add ${preset.label.toLowerCase()}`, (d) => {
      layerId = addVectorLayer(d as never, active?.id ?? null, preset.label);
      const l = d.layers.find((x) => x.id === layerId)!;
      if (active?.folder) l.folder = active.folder;
      const drawing: VectorDrawing = { id: uid('v'), kind: 'vector', shapes: [shape] };
      d.drawings[drawing.id] = drawing as never;
      l.cels.push({ id: uid('c'), start: frame, length: Math.max(1, d.length - frame), drawingId: drawing.id });
    });
    store().setUi({ activeLayerId: layerId, selection: [shape.id] });
  };
  if (active?.kind !== 'vector') place('new-layer');
  else withChoice<ParticlesWhere>('particles.where', place);
}
