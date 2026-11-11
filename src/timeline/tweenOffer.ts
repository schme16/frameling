// The tween offer: click a frame between two keys and a small offer to make in-betweens appears on that span.
// Detection is pure; the rest is a little state (what's offered, what was dismissed) the timeline renders.
import { registerChoice, currentChoice } from '../core/choices';
import type { Cel, Doc, Id, Layer } from '../core/format';
import { isInstance } from '../core/symbols';
import { makeTween } from '../symbols/ops';
import { createStore } from '../ui/mini';

export type TweenOfferChoice = 'on' | 'off';

registerChoice<TweenOfferChoice>({
  id: 'timeline.tweenOffer',
  title: 'Offer in-betweens between keys',
  question: 'When you click a frame between two drawings, should Frameling offer to make the in-betweens?',
  options: [
    { value: 'on', label: 'Offer them', detail: 'A small "Move" or "Morph" offer appears on the frames you clicked. Ignore it and it goes away.' },
    { value: 'off', label: "Don't offer", detail: 'Make in-betweens from the right-click menu or Ctrl+Shift+T instead.' },
  ],
  default: 'on',
  category: 'Timeline',
  help: 'tweens',
  silent: true,
});

export interface TweenOffer {
  layerId: Id;
  /** The key the in-betweens start from, and the one they end on. */
  celId: Id;
  nextId: Id;
  /** The span on the timeline: from the first key's frame to the frame before the next key. */
  start: number;
  end: number;
  /** Both keys are plain drawings (no symbols), so morphing makes sense too. */
  morph: boolean;
}

const plain = (doc: Doc, c: Cel) => {
  const d = doc.drawings[c.drawingId];
  return d?.kind === 'vector' && !d.shapes.some(isInstance);
};

/**
 * What to offer for a click on `frame` of `layer`: a frame after a key (held, or empty) with another key later on,
 * and no in-betweens there yet. Clicking a key itself offers nothing; that's where you draw.
 */
export function tweenOfferAt(doc: Doc, layer: Layer, frame: number): TweenOffer | null {
  if (layer.locked || (layer.kind !== 'vector' && layer.kind !== 'camera')) return null;
  if (layer.kind === 'vector' && layer.rig) return null;
  let prev: Cel | undefined;
  let next: Cel | undefined;
  for (const c of layer.cels) {
    if (c.start <= frame) prev = c;
    else {
      next = c;
      break;
    }
  }
  if (!prev || !next || prev.start === frame || prev.tween) return null;
  const d = doc.drawings[prev.drawingId];
  if (layer.kind === 'vector' && (d?.kind !== 'vector' || !d.shapes.length)) return null;
  return {
    layerId: layer.id,
    celId: prev.id,
    nextId: next.id,
    start: prev.start,
    end: next.start - 1,
    morph: layer.kind === 'vector' && plain(doc, prev) && plain(doc, next),
  };
}

// ---------------------------------------------------------------- state

export const tweenOffer = createStore<TweenOffer | null>(null);

// Dismissed spans, by the layer as it was then: any change to the layer makes a new object, so it can offer again.
let dismissed: { layer: Layer; celId: Id }[] = [];

export function offerEnabled(): boolean {
  return currentChoice<TweenOfferChoice>('timeline.tweenOffer') !== 'off';
}

/** Offers in-betweens for a click, if there's something to offer and it wasn't turned down. */
export function offerTweenAt(doc: Doc, layer: Layer, frame: number): TweenOffer | null {
  const o = offerEnabled() && !doc.editing?.length ? tweenOfferAt(doc, layer, frame) : null;
  const no = o && dismissed.some((x) => x.layer === layer && x.celId === o.celId);
  const out = no ? null : o;
  tweenOffer.set(out);
  return out;
}

export function dismissTweenOffer(doc: Doc): void {
  const o = tweenOffer.get();
  if (!o) return;
  const layer = doc.layers.find((l) => l.id === o.layerId);
  if (layer) dismissed = [...dismissed.filter((x) => doc.layers.includes(x.layer)), { layer, celId: o.celId }];
  tweenOffer.set(null);
}

/** Closes the offer without remembering anything (playback started, the frame moved away). */
export function closeTweenOffer(): void {
  if (tweenOffer.get()) tweenOffer.set(null);
}

export function acceptTweenOffer(kind: 'classic' | 'shape'): void {
  const o = tweenOffer.get();
  tweenOffer.set(null);
  if (o) makeTween(o.layerId, o.start, kind);
}

/** For tests. */
export function resetTweenOffer(): void {
  dismissed = [];
  tweenOffer.set(null);
}

/** Closes the offer when it no longer fits: playing, the playhead or layer moved off the span, or the span changed. */
export function installTweenOffer(s: { get(): { doc: Doc; ui: { playing: boolean; frame: number; activeLayerId: Id | null } }; subscribe(fn: () => void): () => void }): () => void {
  return s.subscribe(() => {
    const o = tweenOffer.get();
    if (!o) return;
    const { doc, ui } = s.get();
    const layer = doc.layers.find((l) => l.id === o.layerId);
    const still = layer && tweenOfferAt(doc, layer, Math.max(o.start + 1, Math.min(o.end, ui.frame)));
    if (ui.playing || ui.activeLayerId !== o.layerId || ui.frame <= o.start || ui.frame > o.end || !still || still.celId !== o.celId) tweenOffer.set(null);
  });
}
