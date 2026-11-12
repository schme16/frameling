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
import { registerQuest } from './registry';
import type { Quest } from './types';

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
  title: 'Your first animation in 60 seconds',
  summary: "Draw a doodle, draw it again a little different, that's animation!",
  minutes: 1,
  icon: 'quest',
  badge: { id: 'flipbooker', name: 'Flipbooker', icon: 'film', color: '--grape' },
  finish: 'You made something move. That is the whole trick, everything else is more of it.',
  prepare: ensureBlankVectorPage,
  ready: hasVectorLayer,
  steps: [
    {
      id: 'draw',
      say: 'Draw something on the page. A ball, a blob, a very small cat.',
      why: 'The brush is already picked for you. An animation is just a few drawings shown one after another.',
      target: SEL.canvas,
      enter: pickBrush,
      done: (c) => hasInkAt(c.state.doc, 0),
      show: () => void drawDemoBall(0),
      hint: 'Click and drag on the white page. Anything at all works.',
      help: 'drawing-basics',
    },
    {
      id: 'next-frame',
      say: 'Now make the next drawing. Press D to copy this one onto the next frame.',
      why: 'Copying gives you something to change a little, which is easier than starting over.',
      target: SEL.copy,
      done: (c) => ownDrawingAt(c.state.doc, 1),
      show: 'timeline.duplicateKey',
      hint: 'The Copy button in the timeline does the same as pressing D.',
      help: 'timeline',
    },
    {
      id: 'change',
      say: 'Change it a little. Move it along, tilt it, add a squiggle.',
      why: 'See the faint ghost of the last drawing? That is onion skin. It is switched on so you can see where you came from.',
      target: SEL.canvas,
      enter: () => store().setUi((ui) => ({ onion: { ...ui.onion, enabled: true } })),
      done: (c) => changedFromPrevious(c.state.doc, 1),
      show: () => void nudgeDrawing(70),
      hint: 'Draw one more line on this frame, or select the drawing and drag it a little way along.',
      help: 'onion-skin',
    },
    {
      id: 'play',
      say: 'Press play and watch it go!',
      why: 'Each drawing is held for 2 frames (animators call it "on twos"), and the timeline is trimmed to your drawings, so it loops with no blank frames.',
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
      hint: 'The big triangle in the timeline, or press Enter.',
    },
  ],
};

export const BOUNCING_BALL: Quest = {
  id: 'bouncing-ball',
  title: 'Bouncing ball',
  summary: 'Take a look inside the classic first exercise, then change its timing.',
  minutes: 3,
  icon: 'play',
  badge: { id: 'squash-stretch', name: 'Squash & Stretch', icon: 'play', color: '--rose' },
  requires: ['first-animation'],
  finish: 'Squash, stretch and timing: that is most of what makes a ball feel heavy or light.',
  ready: isBouncingBall,
  steps: [
    {
      id: 'open',
      say: 'Open the Bouncing ball example.',
      why: 'An example is a normal drawing, so you can poke at anything. The original is never touched.',
      target: exampleCard,
      enter: () => {
        if (!isBouncingBall(store().get())) openSheet('examples');
      },
      done: (c) => isBouncingBall(c.state),
      show: loadBouncingBall,
      hint: 'Find the ball card in the examples and press it.',
    },
    {
      id: 'scrub',
      say: 'Scrub through it. Press . and , to step a frame at a time, or click along the ruler.',
      target: SEL.ruler,
      done: (c) => c.frames.size >= 4,
      show: scrubDemo,
      hint: 'Click the numbered strip at the top of the timeline and drag.',
      help: 'timeline-playing',
    },
    {
      id: 'squash',
      say: 'Find the squashed ball. It is frame 9, right when it hits the ground.',
      why: 'The pink marker called contact is there too. Squashing on impact is what makes it look like it has weight.',
      target: SEL.contact,
      done: (c) => c.state.ui.frame === squashFrame(c.state.doc),
      show: () => store().setUi({ frame: squashFrame(store().get().doc) }),
      hint: 'Press . until the counter says Frame 9, or click the contact marker.',
    },
    {
      id: 'hold',
      say: 'Hold this drawing for longer. Pick 2 under "Hold for".',
      why: 'Holding a drawing on twos means it shows for two frames. Longer on the ground feels heavier.',
      target: SEL.hold,
      done: (c) => celSignature(c.state.doc) !== celSignature(c.entry.state.doc),
      show: 'timeline.hold2',
      hint: 'Alt+2 does it from the keyboard. You can undo it afterwards.',
      help: 'timeline-frames',
    },
    {
      id: 'play',
      say: 'Press play and feel the difference.',
      target: SEL.play,
      done: (c) => c.state.ui.playing,
      show: 'timeline.play',
    },
  ],
};

export const FILL_IT_IN: Quest = {
  id: 'fill-it-in',
  title: 'Fill it in',
  summary: 'Colour a shape with the paint bucket, even when the outline has a gap.',
  minutes: 2,
  icon: 'fill',
  badge: { id: 'paint-pot', name: 'Paint Pot', icon: 'fill', color: '--sunny' },
  requires: ['first-animation'],
  finish: 'Paint goes under your lines, so you can fix a colour later without redrawing a thing.',
  prepare: ensureBlankVectorPage,
  ready: hasVectorLayer,
  steps: [
    {
      id: 'shape',
      say: 'Draw a closed shape: a circle, a blob, a house. Join the line up where it started.',
      why: 'The bucket fills an area with lines all the way round it. The Ellipse and Rectangle tools always close up.',
      target: SEL.canvas,
      enter: pickBrush,
      done: (c) => hasClosedShapeAt(c.state.doc, c.state.ui.frame),
      show: () => void drawDemoBall(0),
      hint: 'Go all the way round and finish on the spot where you began.',
    },
    {
      id: 'bucket',
      say: 'Pick the paint bucket.',
      target: SEL.fill,
      done: (c) => c.state.ui.tool === 'fill',
      show: 'tools.fill',
      hint: 'It is the bucket in the toolbar, or press G.',
      help: 'fill',
    },
    {
      id: 'fill',
      say: 'Click inside your shape.',
      why: 'The bucket pours the fill colour: the solid box in the Colours panel. We picked a sunny yellow, but choose any colour you like. The paint tucks in behind the line.',
      target: SEL.canvas,
      enter: () => {
        // White paint on white paper looks like nothing happened, so start with a colour that shows.
        const ui = store().get().ui;
        const fill = ui.fillColor?.toLowerCase();
        store().setUi({ activeWell: 'fill', ...(!fill || fill === '#ffffff' ? { fillColor: themeFill() } : {}) });
      },
      done: (c) => c.edits.some((l) => l === 'Fill' || l === 'Recolour fill'),
      show: () => void demoFill(),
      hint: 'If nothing happens, the line may have a gap. The next step is about that.',
    },
    {
      id: 'gap',
      say: 'Try a different "Close gaps" setting in the tool options.',
      why: 'A bigger setting fills shapes whose lines do not quite meet. Draw a shape with a small gap, and see which setting copes.',
      target: [SEL.gap, SEL.fill],
      done: (c) => c.probe.fillGap !== null && c.probe.fillGap !== c.entry.probe.fillGap,
      show: nextGapSetting,
      hint: 'The Tool options panel is on the right. Close gaps has None, Small, Medium and Large.',
      help: 'fill-gaps',
    },
  ],
};

export const PIXEL_PAL: Quest = {
  id: 'pixel-pal',
  title: 'Pixel pal',
  summary: 'Make a tiny two-frame sprite on a chunky pixel grid.',
  minutes: 3,
  icon: 'pixel',
  badge: { id: 'pixel-pal', name: 'Pixel Pal', icon: 'pixel', color: '--mint' },
  // A first quest in its own right for sprite people, so it needs nothing before it.
  requires: [],
  finish: 'Two frames of pixel art. Press Enter to watch it, and keep adding frames for a walk or a wave.',
  prepare: ensureTinySpritePage,
  ready: hasPixelLayer,
  steps: [
    {
      id: 'draw',
      say: 'Draw a small outline with the brush. Every touch paints one chunky pixel.',
      why: 'This page is a 32 by 32 grid. A ring, a heart or a tiny blob is plenty.',
      target: SEL.canvas,
      enter: pickBrush,
      done: (c) => paintedAt(c.state.doc, c.state.ui.frame) >= 6,
      show: () => void drawDemoPixelRing(),
      hint: 'Click and drag over the grid. Try to join the line up.',
    },
    {
      id: 'fill',
      say: 'Pick the paint bucket and click inside your outline.',
      target: SEL.fill,
      done: (c) => c.edits.includes('Fill'),
      show: () => void demoFill(),
      hint: 'On pixel pages the bucket fills every joined pixel of the same colour.',
      help: 'fill',
    },
    {
      id: 'copy',
      say: 'Make a second frame. Press D to copy your sprite onto the next one.',
      target: SEL.copy,
      done: (c) => ownDrawingAt(c.state.doc, 1),
      show: 'timeline.duplicateKey',
      hint: 'The Copy button in the timeline does the same as pressing D.',
    },
    {
      id: 'change',
      say: 'Change a few pixels so frame 2 looks different.',
      why: 'Two frames is enough for a blink, a wobble or a wave.',
      target: SEL.canvas,
      enter: () => store().setUi((ui) => ({ onion: { ...ui.onion, enabled: true } })),
      done: (c) => changedFromPrevious(c.state.doc, 1),
      show: () => void tweakPixels(),
      hint: 'Rub out a pixel with the eraser, or paint a new one.',
    },
    {
      id: 'preview',
      say: 'Watch your pal play at real size in the Preview panel.',
      why: 'Pixel art looks different small. 1x is how big it will be in a game; click the picture to pause.',
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
      hint: 'The Preview is a panel on the right. View > Panels > Preview opens it.',
      help: 'pixel-preview',
    },
  ],
};

export const SHARE_IT: Quest = {
  id: 'share-it',
  title: 'Share it',
  summary: 'See how to turn your animation into a GIF anyone can open.',
  minutes: 1,
  icon: 'export',
  badge: { id: 'showtime', name: 'Showtime', icon: 'export', color: '--sky' },
  requires: ['first-animation'],
  finish: 'That is all there is to it. Press Export when you are ready, or close this and keep drawing.',
  steps: [
    {
      id: 'open',
      say: 'Open Export. Press Ctrl+E (Cmd+E on a Mac), or find it in the File menu.',
      target: [SEL.exportItem, SEL.menubar],
      done: (c) => c.probe.exportOpen,
      show: 'file.export',
      hint: 'File, then Export.',
      help: 'exporting',
    },
    {
      id: 'gif',
      say: 'Choose Animated GIF.',
      why: 'GIFs play in chats and forums. You do not have to save anything: close the window whenever you like.',
      target: gifCard,
      done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'gif',
      show: () => void (gifCard() as HTMLElement | null)?.click(),
      hint: 'The cards across the top are the formats. GIF is the one with the picture icon.',
    },
  ],
};

export const QUESTS: Quest[] = [FIRST_ANIMATION, BOUNCING_BALL, FILL_IT_IN, PIXEL_PAL, SHADE_AND_SHINE, TILES_QUEST, FIRST_TWEEN, SHARE_IT, BONES_QUEST, GLOW_QUEST, PARTICLES_QUEST, TEXT_QUEST, CAMERA_QUEST, ...PIXEL_WAY_QUESTS];

for (const q of QUESTS) registerQuest(q);
