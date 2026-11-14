// "Particle party": add confetti from a preset, change how it flies and its colours, shuffle it and play. Listed in
// src/quests/library.ts with the other later quests.
import type { Doc, ParticlesShape, VectorDrawing } from '../core/format';
import { store } from '../core/store';
import type { Quest } from '../quests/types';
import { ensureBlankVectorPage } from '../quests/actions';
import { hasVectorLayer } from '../quests/predicates';
import { showPanel } from '../ui/dock';
import { presetById } from './model';
import { shuffleSeed, updateParticles } from './ops';
// The steps run these commands, so they must be registered wherever the quest is.
import './commands';
import { questWord } from '../words/quests';

/** Every emitter in the document. */
export function emitters(doc: Doc): ParticlesShape[] {
  return Object.values(doc.drawings).flatMap((d) => (d.kind === 'vector' ? (d as VectorDrawing).shapes.filter((s): s is ParticlesShape => s.type === 'particles') : []));
}

const MOTION = ['speed', 'gravity', 'wind', 'spread', 'direction', 'rate', 'burst', 'life', 'drag', 'sizeStart', 'sizeEnd', 'spin'] as const;

/** Some emitter flies differently from the preset it started from. */
export function tweakedMotion(doc: Doc): boolean {
  return emitters(doc).some((s) => {
    const p = presetById(s.preset)?.values;
    return !p || MOTION.some((k) => Math.abs(Number(s[k]) - Number(p[k])) > 0.001);
  });
}

/** Some emitter has colours of its own. */
export function recoloured(doc: Doc): boolean {
  return emitters(doc).some((s) => {
    const p = presetById(s.preset)?.values;
    return !p || s.colorStart.toLowerCase() !== p.colorStart.toLowerCase() || s.colorEnd.toLowerCase() !== p.colorEnd.toLowerCase();
  });
}

const seeds = (doc: Doc) => emitters(doc).map((s) => `${s.id}:${s.seed}`).join(',');

/** Selects the first emitter on the frame (on its layer), so the panel and shuffle have something to work on. */
function selectEmitter(): ParticlesShape | undefined {
  const { doc, ui } = store().get();
  for (const l of doc.layers)
    for (const c of l.cels) {
      if (ui.frame < c.start || ui.frame >= c.start + c.length) continue;
      const d = doc.drawings[c.drawingId];
      const s = d?.kind === 'vector' ? d.shapes.find((x): x is ParticlesShape => x.type === 'particles') : undefined;
      if (s) {
        store().setUi({ activeLayerId: l.id, selection: [s.id] });
        return s;
      }
    }
  return undefined;
}

const SEL = {
  panel: ['.pt-wrap', '.pt-head'],
  presets: ['.pt-preset', '[data-command="particles.add.confetti"]'],
  shuffle: ['.pt-shuffle', '.pt-head'],
  play: '.tl-header .tl-play',
};

export const PARTICLES_QUEST: Quest = {
  id: 'particle-party',
  title: questWord('quest.particle-party.title'),
  summary: questWord('quest.particle-party.summary'),
  minutes: 2,
  icon: 'particles',
  badge: { id: 'confetti-cannon', name: questWord('quest.particle-party.badge'), icon: 'pt-confetti', color: '--rose' },
  features: ['particles'],
  requires: ['first-animation'],
  finish: questWord('quest.particle-party.finish'),
  prepare: ensureBlankVectorPage,
  ready: hasVectorLayer,
  steps: [
    {
      id: 'add',
      say: questWord('quest.particle-party.add.say'),
      why: questWord('quest.particle-party.add.why'),
      target: SEL.presets,
      enter: () => {
        showPanel('particles');
        store().setUi({ frame: 0 });
      },
      done: (c) => emitters(c.state.doc).length > 0,
      show: 'particles.add.confetti',
      hint: questWord('quest.particle-party.add.hint'),
      help: 'particles',
    },
    {
      id: 'motion',
      say: questWord('quest.particle-party.motion.say'),
      why: questWord('quest.particle-party.motion.why'),
      target: SEL.panel,
      enter: () => void selectEmitter(),
      done: (c) => tweakedMotion(c.state.doc),
      show: () => {
        const s = selectEmitter();
        if (s) updateParticles('Change particles', (x) => void ((x.gravity += 260), (x.spread = Math.min(180, x.spread + 30))), { id: s.id });
      },
      hint: questWord('quest.particle-party.motion.hint'),
      help: 'particles',
    },
    {
      id: 'colour',
      say: questWord('quest.particle-party.colour.say'),
      why: questWord('quest.particle-party.colour.why'),
      target: SEL.panel,
      done: (c) => recoloured(c.state.doc),
      show: () => {
        const s = selectEmitter();
        if (s) updateParticles('Particle colours', (x) => void ((x.colorStart = '#4fd1a5'), (x.colorEnd = '#9b7bff')), { id: s.id });
      },
      hint: questWord('quest.particle-party.colour.hint'),
      help: 'particles',
    },
    {
      id: 'shuffle',
      say: questWord('quest.particle-party.shuffle.say'),
      target: SEL.shuffle,
      done: (c) => seeds(c.state.doc) !== seeds(c.entry.state.doc),
      show: () => {
        if (selectEmitter()) shuffleSeed();
      },
      hint: questWord('quest.particle-party.shuffle.hint'),
      help: 'particles',
    },
    {
      id: 'play',
      say: questWord('quest.particle-party.play.say'),
      target: SEL.play,
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: questWord('quest.particle-party.play.hint'),
    },
  ],
};
