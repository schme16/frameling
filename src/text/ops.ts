// Changes to text shapes: the selected ones, their animators, and the settings new text starts with.
import type { Draft } from 'immer';
import type { Id, TextAnimKind, TextAnimator, TextShape, VectorDrawing } from '../core/format';
import { uid } from '../core/doc';
import { store } from '../core/store';
import { currentKey } from '../symbols/ops';
import { EDIT_HINTS } from '../tools/edit';
import { toast } from '../ui/toast';
import { newAnimator } from './model';

/** What new text starts with (the Text tool's options), remembered between runs. */
export interface TextDefaults {
  font: string;
  size: number;
  weight: number;
  align: TextShape['align'];
}

const KEY = 'frameling.text.defaults';
let defaults: TextDefaults = load();

function load(): TextDefaults {
  const d: TextDefaults = { font: 'Nunito', size: 48, weight: 700, align: 'left' };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object') {
      if (typeof v.font === 'string') d.font = v.font;
      if (typeof v.size === 'number' && v.size > 0) d.size = v.size;
      if (typeof v.weight === 'number') d.weight = v.weight;
      if (v.align === 'center' || v.align === 'right') d.align = v.align;
    }
  } catch {
    // Remembering is a nicety.
  }
  return d;
}

const listeners = new Set<() => void>();

export function textDefaults(): TextDefaults {
  return defaults;
}

export function setTextDefaults(p: Partial<TextDefaults>): void {
  defaults = { ...defaults, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(defaults));
  } catch {
    // Remembering is a nicety.
  }
  listeners.forEach((f) => f());
}

export function onTextDefaults(f: () => void): () => void {
  listeners.add(f);
  return () => void listeners.delete(f);
}

/** The selected text shapes on the active drawing. */
export function selectedTexts(): TextShape[] {
  const k = currentKey();
  if (!k) return [];
  const sel = new Set(store().get().ui.selection);
  return k.drawing.shapes.filter((s): s is TextShape => s.type === 'text' && sel.has(s.id));
}

/** Changes the selected texts (or one by id). */
export function updateTexts(label: string, fn: (s: Draft<TextShape>) => void, opts: { coalesce?: string; id?: Id } = {}): void {
  const k = currentKey();
  const ids = opts.id ? [opts.id] : selectedTexts().map((s) => s.id);
  if (!k || !ids.length) return;
  if (k.layer.locked) return void toast(EDIT_HINTS.locked);
  store().update(
    label,
    (doc) => {
      const d = doc.drawings[k.drawing.id] as Draft<VectorDrawing>;
      for (const s of d.shapes) if (s.type === 'text' && ids.includes(s.id)) fn(s);
    },
    opts,
  );
}

export function addAnimator(kind: TextAnimKind, id?: Id): void {
  const a = newAnimator(kind, uid('ta'));
  updateTexts(`Animate text: ${kind}`, (s) => void (s.animators = [...(s.animators ?? []), a]), { id });
}

export function updateAnimator(textId: Id, animId: Id, label: string, fn: (a: Draft<TextAnimator>) => void): void {
  updateTexts(
    label,
    (s) => {
      const a = s.animators?.find((x) => x.id === animId);
      if (a) fn(a);
    },
    { id: textId, coalesce: `ta-${animId}-${label}` },
  );
}

export function removeAnimator(textId: Id, animId: Id): void {
  updateTexts(
    'Remove text animation',
    (s) => {
      s.animators = (s.animators ?? []).filter((a) => a.id !== animId);
      if (!s.animators.length) delete s.animators;
    },
    { id: textId },
  );
}
