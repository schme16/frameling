// The quests. Each step says what to do in plain words, points at something on screen, and has a check that
// reads the store (or the probe) to know when it's done. Keep the words warm and short.
import { contentLength } from '../core/doc';
import { store } from '../core/store';
import { themeFill } from '../tools/wells';
import { setDocLength } from '../timeline/ops';
import { openSheet } from '../ui/overlays';
import {
  demoFill,
  drawDemoBall,
  drawDemoPixelRing,
  ensureBlankVectorPage,
  ensureTinySpritePage,
  loadBouncingBall,
  nextGapSetting,
  nudgeDrawing,
  scrubDemo,
  tweakPixels,
} from './actions';
import {
  celSignature,
  changedFromPrevious,
  hasClosedShapeAt,
  hasInkAt,
  hasPixelLayer,
  hasVectorLayer,
  isBouncingBall,
  ownDrawingAt,
  paintedAt,
  squashFrame,
} from './predicates';
import { gifCard } from './probe';
import { SHADE_AND_SHINE } from '../pixel/quest';
import { PIXEL_WAY_QUESTS } from '../pixel/quests-ways';
import { notePreviewFrame, previewFramesPlayed, resetPreviewFramesPlayed, setPreview } from '../pixel/preview';
import { showPanel } from '../ui/dock';
import { FIRST_TWEEN } from '../symbols/quest';
import { TILES_QUEST } from '../tiles/quest';
import { BONES_QUEST } from '../rig/quest';
import { GLOW_QUEST } from '../effects/quest';
import { PARTICLES_QUEST } from '../particles/quest';
import { TEXT_QUEST } from '../text/quest';
import { CAMERA_QUEST } from '../camera/quest';
import { TURN_QUEST } from '../canvas/quest';
import { registerQuest } from './registry';
import type { Quest } from './types';
import { questWord } from '../words/quests';

// Selectors that already exist in other areas. If one goes missing the ring just doesn't show; the step still works.
// The timeline ones also match the same button in the header's "more" menu, where it folds when the header is narrow.
export const SEL = {
  canvas: '.cv-root',
  brush: '[data-command="tools.brush"]',
  fill: '[data-command="tools.fill"]',
  copy: ':is(.tl-header, .tl-more-menu) [aria-label^="Copy this drawing"]',
  play: '.tl-header .tl-play',
  onion: ':is(.tl-header, .tl-more-menu) [aria-label^="See the frames around"]',
  hold: ':is(.tl-header, .tl-more-menu) [aria-label="How long to hold this drawing"]',
  ruler: '.tl-ruler',
  contact: '.tl-marker[title^="contact"]',
  gap: '.fl-fill-seg',
  menubar: '.ui-menubar [data-top]',
  exportItem: '[data-command="file.export"]',
};

const exampleCard = (): Element | null => [...document.querySelectorAll('.ui-example')].find((e) => /bouncing ball/i.test(e.textContent ?? '')) ?? null;

const pickBrush = () => store().setUi({ tool: 'brush' });

export const FIRST_ANIMATION: Quest = {
  id: 'first-animation',
  title: questWord('quest.first-animation.title'),
  summary: questWord('quest.first-animation.summary'),
  minutes: 1,
  icon: 'quest',
  badge: { id: 'flipbooker', name: questWord('quest.first-animation.badge'), icon: 'film', color: '--grape' },
  finish: questWord('quest.first-animation.finish'),
  prepare: ensureBlankVectorPage,
  ready: hasVectorLayer,
  steps: [
    {
      id: 'draw',
      say: questWord('quest.first-animation.draw.say'),
      why: questWord('quest.first-animation.draw.why'),
      target: SEL.canvas,
      enter: pickBrush,
      done: (c) => hasInkAt(c.state.doc, 0),
      show: () => void drawDemoBall(0),
      hint: questWord('quest.first-animation.draw.hint'),
      help: 'drawing-basics',
    },
    {
      id: 'next-frame',
      say: questWord('quest.first-animation.next-frame.say'),
      why: questWord('quest.first-animation.next-frame.why'),
      target: SEL.copy,
      done: (c) => ownDrawingAt(c.state.doc, 1),
      show: 'timeline.duplicateKey',
      hint: questWord('quest.first-animation.next-frame.hint'),
      help: 'timeline',
    },
    {
      id: 'change',
      say: questWord('quest.first-animation.change.say'),
      why: questWord('quest.first-animation.change.why'),
      target: SEL.canvas,
      enter: () => store().setUi((ui) => ({ onion: { ...ui.onion, enabled: true } })),
      done: (c) => changedFromPrevious(c.state.doc, 1),
      show: () => void nudgeDrawing(70),
      hint: questWord('quest.first-animation.change.hint'),
      help: 'onion-skin',
    },
    {
      id: 'play',
      say: questWord('quest.first-animation.play.say'),
      why: questWord('quest.first-animation.play.why'),
      target: SEL.play,
      enter: () => {
        // Two drawings one frame each flicker too fast at 12 fps, so hold each for 2 frames, as long as every
        // drawing is still a single frame (never undo someone's own timing).
        // The last drawing holding to the end on its own counts as one frame: nobody chose that.
        const doc = store().get().doc;
        const tail = (l: { cels: { autoHold?: boolean }[] }, i: number) => i === l.cels.length - 1 && !!l.cels[i].autoHold;
        const cels = doc.layers.flatMap((l) => l.cels.map((c, i) => (tail(l, i) ? 1 : c.length)));
        if (cels.length > 0 && cels.every((n) => n === 1)) {
          store().update('Hold drawings on twos', (d) => {
            for (const l of d.layers) for (const c of l.cels) (c.start *= 2), (c.length = 2), delete c.autoHold;
          });
        }
        const n = contentLength(store().get().doc);
        if (n > 0) setDocLength(n);
      },
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
      hint: questWord('quest.first-animation.play.hint'),
    },
  ],
};

export const BOUNCING_BALL: Quest = {
  id: 'bouncing-ball',
  title: questWord('quest.bouncing-ball.title'),
  summary: questWord('quest.bouncing-ball.summary'),
  minutes: 3,
  icon: 'play',
  badge: { id: 'squash-stretch', name: questWord('quest.bouncing-ball.badge'), icon: 'play', color: '--rose' },
  requires: ['first-animation'],
  finish: questWord('quest.bouncing-ball.finish'),
  ready: isBouncingBall,
  steps: [
    {
      id: 'open',
      say: questWord('quest.bouncing-ball.open.say'),
      why: questWord('quest.bouncing-ball.open.why'),
      target: exampleCard,
      enter: () => {
        if (!isBouncingBall(store().get())) openSheet('examples');
      },
      done: (c) => isBouncingBall(c.state),
      show: loadBouncingBall,
      hint: questWord('quest.bouncing-ball.open.hint'),
    },
    {
      id: 'scrub',
      say: questWord('quest.bouncing-ball.scrub.say'),
      target: SEL.ruler,
      done: (c) => c.frames.size >= 4,
      show: scrubDemo,
      hint: questWord('quest.bouncing-ball.scrub.hint'),
      help: 'timeline-playing',
    },
    {
      id: 'squash',
      say: questWord('quest.bouncing-ball.squash.say'),
      why: questWord('quest.bouncing-ball.squash.why'),
      target: SEL.contact,
      done: (c) => c.state.ui.frame === squashFrame(c.state.doc),
      show: () => store().setUi({ frame: squashFrame(store().get().doc) }),
      hint: questWord('quest.bouncing-ball.squash.hint'),
    },
    {
      id: 'hold',
      say: questWord('quest.bouncing-ball.hold.say'),
      why: questWord('quest.bouncing-ball.hold.why'),
      target: SEL.hold,
      done: (c) => celSignature(c.state.doc) !== celSignature(c.entry.state.doc),
      show: 'timeline.hold2',
      hint: questWord('quest.bouncing-ball.hold.hint'),
      help: 'timeline-frames',
    },
    {
      id: 'play',
      say: questWord('quest.bouncing-ball.play.say'),
      target: SEL.play,
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
    },
  ],
};

export const FILL_IT_IN: Quest = {
  id: 'fill-it-in',
  title: questWord('quest.fill-it-in.title'),
  summary: questWord('quest.fill-it-in.summary'),
  minutes: 2,
  icon: 'fill',
  badge: { id: 'paint-pot', name: questWord('quest.fill-it-in.badge'), icon: 'fill', color: '--sunny' },
  requires: ['first-animation'],
  finish: questWord('quest.fill-it-in.finish'),
  prepare: ensureBlankVectorPage,
  ready: hasVectorLayer,
  steps: [
    {
      id: 'shape',
      say: questWord('quest.fill-it-in.shape.say'),
      why: questWord('quest.fill-it-in.shape.why'),
      target: SEL.canvas,
      enter: pickBrush,
      done: (c) => hasClosedShapeAt(c.state.doc, c.state.ui.frame),
      show: () => void drawDemoBall(0),
      hint: questWord('quest.fill-it-in.shape.hint'),
    },
    {
      id: 'bucket',
      say: questWord('quest.fill-it-in.bucket.say'),
      target: SEL.fill,
      done: (c) => c.state.ui.tool === 'fill',
      show: 'tools.fill',
      hint: questWord('quest.fill-it-in.bucket.hint'),
      help: 'fill',
    },
    {
      id: 'fill',
      say: questWord('quest.fill-it-in.fill.say'),
      why: questWord('quest.fill-it-in.fill.why'),
      target: SEL.canvas,
      enter: () => {
        // White paint on white paper looks like nothing happened, so start with a colour that shows.
        const ui = store().get().ui;
        const fill = ui.fillColor?.toLowerCase();
        store().setUi({ activeWell: 'fill', ...(!fill || fill === '#ffffff' ? { fillColor: themeFill() } : {}) });
      },
      done: (c) => c.edits.some((l) => l === 'Fill' || l === 'Recolour fill'),
      show: () => void demoFill(),
      hint: questWord('quest.fill-it-in.fill.hint'),
    },
    {
      id: 'gap',
      say: questWord('quest.fill-it-in.gap.say'),
      why: questWord('quest.fill-it-in.gap.why'),
      target: [SEL.gap, SEL.fill],
      done: (c) => c.probe.fillGap !== null && c.probe.fillGap !== c.entry.probe.fillGap,
      show: nextGapSetting,
      hint: questWord('quest.fill-it-in.gap.hint'),
      help: 'fill-gaps',
    },
  ],
};

export const PIXEL_PAL: Quest = {
  id: 'pixel-pal',
  title: questWord('quest.pixel-pal.title'),
  summary: questWord('quest.pixel-pal.summary'),
  minutes: 3,
  icon: 'pixel',
  badge: { id: 'pixel-pal', name: questWord('quest.pixel-pal.badge'), icon: 'pixel', color: '--mint' },
  // A first quest in its own right for sprite people, so it needs nothing before it.
  requires: [],
  finish: questWord('quest.pixel-pal.finish'),
  prepare: ensureTinySpritePage,
  ready: hasPixelLayer,
  steps: [
    {
      id: 'draw',
      say: questWord('quest.pixel-pal.draw.say'),
      why: questWord('quest.pixel-pal.draw.why'),
      target: SEL.canvas,
      enter: pickBrush,
      done: (c) => paintedAt(c.state.doc, c.state.ui.frame) >= 6,
      show: () => void drawDemoPixelRing(),
      hint: questWord('quest.pixel-pal.draw.hint'),
    },
    {
      id: 'fill',
      say: questWord('quest.pixel-pal.fill.say'),
      target: SEL.fill,
      done: (c) => c.edits.includes('Fill'),
      show: () => void demoFill(),
      hint: questWord('quest.pixel-pal.fill.hint'),
      help: 'fill',
    },
    {
      id: 'copy',
      say: questWord('quest.pixel-pal.copy.say'),
      target: SEL.copy,
      done: (c) => ownDrawingAt(c.state.doc, 1),
      show: 'timeline.duplicateKey',
      hint: questWord('quest.pixel-pal.copy.hint'),
    },
    {
      id: 'change',
      say: questWord('quest.pixel-pal.change.say'),
      why: questWord('quest.pixel-pal.change.why'),
      target: SEL.canvas,
      enter: () => store().setUi((ui) => ({ onion: { ...ui.onion, enabled: true } })),
      done: (c) => changedFromPrevious(c.state.doc, 1),
      show: () => void tweakPixels(),
      hint: questWord('quest.pixel-pal.change.hint'),
    },
    {
      id: 'preview',
      say: questWord('quest.pixel-pal.preview.say'),
      why: questWord('quest.pixel-pal.preview.why'),
      target: '.px-preview',
      enter: () => {
        resetPreviewFramesPlayed();
        showPanel('preview');
        setPreview({ playing: true });
      },
      done: (c) => previewFramesPlayed() >= 24 || c.ran.has('pixel.previewSize') || c.ran.has('pixel.previewPlay'),
      // Show me brings it up at real size, playing, and counts as watching.
      show: () => {
        showPanel('preview');
        setPreview({ playing: true, zoom: 1 });
        for (let i = 0; i < 24; i++) notePreviewFrame();
      },
      hint: questWord('quest.pixel-pal.preview.hint'),
      help: 'pixel-preview',
    },
  ],
};

export const SHARE_IT: Quest = {
  id: 'share-it',
  title: questWord('quest.share-it.title'),
  summary: questWord('quest.share-it.summary'),
  minutes: 1,
  icon: 'export',
  badge: { id: 'showtime', name: questWord('quest.share-it.badge'), icon: 'export', color: '--sky' },
  requires: ['first-animation'],
  finish: questWord('quest.share-it.finish'),
  steps: [
    {
      id: 'open',
      say: questWord('quest.share-it.open.say'),
      target: [SEL.exportItem, SEL.menubar],
      done: (c) => c.probe.exportOpen,
      show: 'file.export',
      hint: questWord('quest.share-it.open.hint'),
      help: 'exporting',
    },
    {
      id: 'gif',
      say: questWord('quest.share-it.gif.say'),
      why: questWord('quest.share-it.gif.why'),
      target: gifCard,
      done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'gif',
      show: () => void (gifCard() as HTMLElement | null)?.click(),
      hint: questWord('quest.share-it.gif.hint'),
    },
  ],
};

export const QUESTS: Quest[] = [FIRST_ANIMATION, BOUNCING_BALL, FILL_IT_IN, PIXEL_PAL, SHADE_AND_SHINE, TILES_QUEST, FIRST_TWEEN, SHARE_IT, BONES_QUEST, GLOW_QUEST, PARTICLES_QUEST, TEXT_QUEST, CAMERA_QUEST, ...PIXEL_WAY_QUESTS, TURN_QUEST];

for (const q of QUESTS) registerQuest(q);
