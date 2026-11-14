// "Say it with text": type a word, make it pop in letter by letter, add a wave, play. Listed in src/quests/library.ts
// with the other later quests.
import { uid } from '../core/doc';
import type { Doc, TextShape } from '../core/format';
import { store } from '../core/store';
import type { Quest } from '../quests/types';
import { ensureBlankVectorPage } from '../quests/actions';
import { hasVectorLayer } from '../quests/predicates';
import { editActiveDrawing } from '../tools/edit';
import { setDocLength } from '../timeline/ops';
import { showPanel } from '../ui/dock';
import { addAnimator, textDefaults } from './ops';
// The steps run these commands, so they must be registered wherever the quest is.
import './commands';
import { questWord } from '../words/quests';

const RUN = 36;

/** Every text shape with something typed in it, with where it lives. */
export function texts(doc: Doc): { text: TextShape; layerId: string; celIndex: number }[] {
  const out: { text: TextShape; layerId: string; celIndex: number }[] = [];
  for (const l of doc.layers)
    l.cels.forEach((c, celIndex) => {
      const d = doc.drawings[c.drawingId];
      if (d?.kind === 'vector') for (const s of d.shapes) if (s.type === 'text' && s.text.trim()) out.push({ text: s, layerId: l.id, celIndex });
    });
  return out;
}

const animated = (doc: Doc) => texts(doc).some((t) => (t.text.animators?.length ?? 0) > 0);
/** Two animations on one text, or a wave (which keeps going after the others finish). */
const layered = (doc: Doc) => texts(doc).some((t) => (t.text.animators?.length ?? 0) >= 2 || t.text.animators?.some((a) => a.kind === 'wave'));

/** Picks the first text (its layer, its frame and the shape), so the Text panel and the commands work on it. */
function selectText(): boolean {
  const t = texts(store().get().doc)[0];
  if (!t) return false;
  const cel = store().get().doc.layers.find((l) => l.id === t.layerId)!.cels[t.celIndex];
  store().setUi({ activeLayerId: t.layerId, frame: cel.start, selection: [t.text.id] });
  return true;
}

/** Gives the text's key room to play: held for 36 frames, with the timeline at least that long. */
function makeRoom(): void {
  const t = texts(store().get().doc)[0];
  if (!t) return;
  const l = store().get().doc.layers.find((x) => x.id === t.layerId)!;
  const c = l.cels[t.celIndex];
  const next = l.cels[t.celIndex + 1];
  const want = Math.min(RUN, next ? next.start - c.start : RUN);
  if (c.length < want) store().update('Hold text for longer', (d) => void (d.layers.find((x) => x.id === l.id)!.cels[t.celIndex].length = want));
  if (store().get().doc.length < c.start + want) setDocLength(c.start + want);
}

function typeDemo(): void {
  const { doc } = store().get();
  const def = textDefaults();
  const id = uid('t');
  const shape: TextShape = {
    id,
    type: 'text',
    text: 'Hello!',
    font: def.font,
    size: Math.round(Math.min(doc.width, doc.height) * 0.2),
    weight: def.weight,
    color: store().get().ui.color,
    align: 'center',
    opacity: 1,
    transform: { x: doc.width / 2, y: doc.height / 2, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
  };
  if (editActiveDrawing('Add text', 'vector', (d) => void d.shapes.push(shape)) === 'ok') store().setUi({ selection: [id] });
}

const SEL = {
  canvas: '.cv-root',
  panel: ['.tx-add', '.tx-panel'],
  play: '.tl-header .tl-play',
};

export const TEXT_QUEST: Quest = {
  id: 'say-it-with-text',
  title: questWord('quest.say-it-with-text.title'),
  summary: questWord('quest.say-it-with-text.summary'),
  minutes: 2,
  icon: 'text',
  badge: { id: 'wordsmith', name: questWord('quest.say-it-with-text.badge'), icon: 'text', color: '--grape' },
  features: ['text'],
  requires: ['first-animation'],
  finish: questWord('quest.say-it-with-text.finish'),
  prepare: ensureBlankVectorPage,
  ready: hasVectorLayer,
  steps: [
    {
      id: 'type',
      say: questWord('quest.say-it-with-text.type.say'),
      why: questWord('quest.say-it-with-text.type.why'),
      target: SEL.canvas,
      enter: () => store().setUi({ tool: 'text', frame: 0 }),
      done: (c) => texts(c.state.doc).length > 0,
      show: typeDemo,
      hint: questWord('quest.say-it-with-text.type.hint'),
      help: 'text',
    },
    {
      id: 'animate',
      say: questWord('quest.say-it-with-text.animate.say'),
      why: questWord('quest.say-it-with-text.animate.why'),
      target: SEL.panel,
      enter: () => {
        selectText();
        makeRoom();
        store().setUi({ tool: 'select' });
        showPanel('text');
      },
      done: (c) => animated(c.state.doc),
      show: () => {
        if (selectText()) addAnimator('scale');
      },
      hint: questWord('quest.say-it-with-text.animate.hint'),
      help: 'text-animators',
    },
    {
      id: 'wave',
      say: questWord('quest.say-it-with-text.wave.say'),
      why: questWord('quest.say-it-with-text.wave.why'),
      target: SEL.panel,
      done: (c) => layered(c.state.doc),
      show: () => {
        if (selectText()) addAnimator('wave');
      },
      hint: questWord('quest.say-it-with-text.wave.hint'),
      help: 'text-animators',
    },
    {
      id: 'play',
      say: questWord('quest.say-it-with-text.play.say'),
      target: SEL.play,
      enter: () => {
        makeRoom();
        store().setUi({ frame: 0 });
      },
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: questWord('quest.say-it-with-text.play.hint'),
    },
  ],
};
