// "Make it glow": a glow on a lantern, a light layer set to Add, and a flicker made by animating the glow. Listed in
// src/quests/library.ts with the other later quests.
import { newDoc } from '../core/doc';
import type { Doc, Layer, LayerEffect } from '../core/format';
import { store, type State } from '../core/store';
import type { Quest } from '../quests/types';
import { freshPage } from '../quests/actions';
import { showPanel } from '../ui/dock';
import { INK, SUNNY, addVectorLayer, ellipsePath, emptyOf, fill, hold, pathShape, rectPath, smoothClosed, stroke, vectorDrawing } from '../templates/build';
import { addEffect, setBlend, setEffectAnimated, setEffectValue } from './ops';
// The steps run these commands, so they must be registered wherever the quest is.
import './commands';
import { questWord } from '../words/quests';

const LIT: Layer['blend'][] = ['add', 'screen', 'lighten', 'color-dodge'];

/** A lantern on a dark night, on its own layer, with a pool of light on another: the page the quest starts on. */
export function makeLanternScene(): Doc {
  const doc = emptyOf(newDoc({ name: 'Make it glow', width: 640, height: 480, fps: 12, length: 12, background: '#1d1b33' }));
  const ground = addVectorLayer(doc, 'Ground');
  hold(ground, vectorDrawing(doc, [fill([smoothClosed([[-60, 520], [-60, 400], [200, 360], [460, 380], [700, 340], [700, 520]])], '#2c2a4a')]).id, 0, 12);
  const light = addVectorLayer(doc, 'Light');
  hold(light, vectorDrawing(doc, [fill([ellipsePath(320, 250, 170, 170)], '#5a4a20', 0.8), fill([ellipsePath(320, 250, 100, 100)], '#7a6428', 0.8)]).id, 0, 12);
  const lantern = addVectorLayer(doc, 'Lantern');
  hold(
    lantern,
    vectorDrawing(doc, [
      stroke([[320, 150], [320, 186]], INK, 8),
      pathShape([ellipsePath(320, 146, 16, 14)], null, { color: '#8a86a8', width: 6 }),
      pathShape([rectPath(286, 190, 68, 16)], '#8a86a8', { color: INK, width: 4 }),
      pathShape([rectPath(292, 206, 56, 84)], SUNNY, { color: INK, width: 5 }),
      fill([ellipsePath(320, 252, 12, 22)], '#fff6c8'),
      pathShape([rectPath(286, 290, 68, 16)], '#8a86a8', { color: INK, width: 4 }),
    ]).id,
    0,
    12,
  );
  doc.layers.forEach((l) => (l.onion = false));
  return doc;
}

const isLanternScene = (s: State) => s.doc.layers.some((l) => l.name === 'Lantern') && s.doc.layers.some((l) => l.name === 'Light');
const layerNamed = (s: State, name: string) => s.doc.layers.find((l) => l.name === name);
const glowOf = (l: Layer | undefined): LayerEffect | undefined => l?.effects?.find((e) => e.kind === 'glow');
/** The lantern's glow, or any glow when the lantern was renamed. */
const glow = (s: State) => glowOf(layerNamed(s, 'Lantern')) ?? s.doc.layers.map(glowOf).find(Boolean);
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));

/** The glow is noticeably bigger than it starts. */
export function bigGlow(s: State): boolean {
  const e = glow(s);
  if (!e) return false;
  return num(e.values.size) >= 20 || !!e.keys?.some((k) => num(k.values.size) >= 20);
}

/** The glow changes over time: two keys or more, with something different between them. */
export function flickers(s: State): boolean {
  const keys = glow(s)?.keys ?? [];
  return keys.length >= 2 && keys.some((k) => JSON.stringify(k.values) !== JSON.stringify(keys[0].values));
}

const pickLayer = (name: string) => {
  const l = layerNamed(store().get(), name);
  if (l) store().setUi({ activeLayerId: l.id });
};
const target = () => {
  const l = layerNamed(store().get(), 'Lantern') ?? store().get().doc.layers.find((x) => glowOf(x));
  return l ? { layer: l.id } : null;
};

const SEL = {
  fx: ['.fx-stack', '.fx-panel'],
  blend: ['.fx-blend-btn', '.fx-panel'],
  play: '.tl-header .tl-play',
};

export const GLOW_QUEST: Quest = {
  id: 'make-it-glow',
  title: questWord('quest.make-it-glow.title'),
  summary: questWord('quest.make-it-glow.summary'),
  minutes: 3,
  icon: 'fx-halo',
  badge: { id: 'lamplighter', name: questWord('quest.make-it-glow.badge'), icon: 'fx-halo', color: '--sunny' },
  requires: ['first-animation'],
  finish: questWord('quest.make-it-glow.finish'),
  prepare: () => (isLanternScene(store().get()) ? true : freshPage(makeLanternScene)),
  ready: isLanternScene,
  steps: [
    {
      id: 'glow',
      say: questWord('quest.make-it-glow.glow.say'),
      why: questWord('quest.make-it-glow.glow.why'),
      target: SEL.fx,
      enter: () => {
        pickLayer('Lantern');
        showPanel('effects');
      },
      done: (c) => !!glow(c.state),
      show: 'effects.add.glow',
      hint: questWord('quest.make-it-glow.glow.hint'),
      help: 'effects',
    },
    {
      id: 'size',
      say: questWord('quest.make-it-glow.size.say'),
      target: SEL.fx,
      done: (c) => bigGlow(c.state),
      show: () => {
        const t = target();
        const e = glow(store().get());
        if (t && e) setEffectValue(t, e.id, 'size', 32);
      },
      hint: questWord('quest.make-it-glow.size.hint'),
      help: 'effects',
    },
    {
      id: 'blend',
      say: questWord('quest.make-it-glow.blend.say'),
      why: questWord('quest.make-it-glow.blend.why'),
      target: SEL.blend,
      enter: () => pickLayer('Light'),
      done: (c) => c.state.doc.layers.some((l) => LIT.includes(l.blend)),
      show: () => {
        const l = layerNamed(store().get(), 'Light') ?? store().get().doc.layers[0];
        if (l) setBlend({ layer: l.id }, 'add');
      },
      hint: questWord('quest.make-it-glow.blend.hint'),
      help: 'blend-modes',
    },
    {
      id: 'flicker',
      say: questWord('quest.make-it-glow.flicker.say'),
      why: questWord('quest.make-it-glow.flicker.why'),
      target: SEL.fx,
      enter: () => {
        pickLayer('Lantern');
        store().setUi({ frame: 0 });
      },
      done: (c) => flickers(c.state),
      show: () => {
        const t = target();
        const e = glow(store().get());
        if (!t || !e) return;
        store().setUi({ frame: 0 });
        setEffectAnimated(t, e.id, true);
        store().setUi({ frame: 6 });
        setEffectValue(t, e.id, 'strength', 2.4);
      },
      hint: questWord('quest.make-it-glow.flicker.hint'),
      help: 'effects',
    },
    {
      id: 'play',
      say: questWord('quest.make-it-glow.play.say'),
      target: SEL.play,
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: questWord('quest.make-it-glow.play.hint'),
    },
  ],
};
