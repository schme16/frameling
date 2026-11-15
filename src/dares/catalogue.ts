// Every dare the audience can ask for, in one list. Two families:
//
//   VIEW dares (`touchesDrawing` left out). They change how the screen looks and nothing else: flip, spin, shake, grey,
//   zoom, a banner, a countdown. They work for everyone, with nothing extra switched on, and when they end the view is
//   exactly as it was. Each holds one resource through ./fx.ts, so they never stack and Stop puts them back at once.
//
//   DRAWING dares (`touchesDrawing: true`). They reach the drawing, so the gate runs them only while the streamer has
//   switched on "Let the audience interrupt your drawing". They add or nudge, never delete, and every one is a single
//   `ctx.edit` step, so one Undo takes it back. (Colour roulette only changes the colour in your hand, so it has no edit.)
//
// A copy-and-change pattern for one more dare: add an entry to `viewDares` or `drawingDares`, nothing else. The
// commands, the list in Preferences, the help list and the tests all read this one list.
import type { AudienceContext } from '../audience';
import { fit, getView, isAutoFit, setView, zoomAtDoc } from '../canvas/controller';
import { flipped, getTurn, setTurn } from '../canvas/turn';
import { currentChoice } from '../core/choices';
import { store } from '../core/store';
import { getPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { clampZoom } from '../canvas/view';
import { cleanMessage } from '../streamdoor/actions';
import { addGiftLayer, giftProblem, googlyShapes, applyNudge, dropShape, nudgeStep, nudgeTarget, REFUSAL_WORDS, splatShapes, wobbleSetup, wobbleShapes, wobbleTarget, GIFT_COLOURS, type Rng } from './draw';
import { dareScreen, hold, markPage } from './fx';
import { lasts } from '../audience';
import { askToShowWords } from './askWords';

export type DareFamily = 'view' | 'drawing';

export interface DareDef<P = undefined> {
  /** `dare.name`, the audience gate's id. */
  id: string;
  /** Plain words, the audience action's label and the palette command's name after "Try the dare:". */
  label: string;
  family: DareFamily;
  /** One plain line on what happens, shown in Preferences and the help. */
  about: string;
  /** The gate's cooldown group. All of a resource's dares share one, so they cannot stack. */
  kind: string;
  cooldown: number;
  /** Extra words the palette finds it by. */
  keywords: string[];
  parse?(raw: unknown): P | null;
  run(payload: P, ctx: AudienceContext): void | Promise<void>;
}

// ---------------------------------------------------------------- how long

export type DareLength = 'short' | 'normal' | 'long';
export const LENGTH_SECONDS: Record<DareLength, number> = { short: 15, normal: 30, long: 60 };

/** How long a lasting dare lasts, in milliseconds. `factor` shortens or stretches one dare against the streamer's choice. */
export function dareMs(factor = 1, length: unknown = currentChoice('dares.length')): number {
  const base = LENGTH_SECONDS[length as DareLength] ?? LENGTH_SECONDS.normal;
  return Math.max(2000, Math.round(base * factor) * 1000);
}

const rng: Rng = Math.random;
const pickOf = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length) % list.length];

// ---------------------------------------------------------------- view dares

/** The menus read ticks from the store, so nudge it after the view turns. */
const nudgeMenus = () => store().setUi({});

export const CHALLENGES = [
  'Draw the next thing with your eyes closed.',
  'Draw with your other hand.',
  'Only straight lines for a bit.',
  'Whatever you draw next, it is a cat.',
  'One colour only, until this goes.',
  'Draw the next line without lifting the pen.',
  'Give it a silly name and say it out loud.',
  'Add a hat to whatever is there.',
  'Draw something that is not looking at you.',
  'Make it spooky. Then make it cute.',
] as const;

/** What a challenge or countdown may be given: nothing, or words (cleaned the way a shown message is). Null for anything else. */
export function cleanChallenge(raw: unknown): { text: string | null } | null {
  if (raw === undefined || raw === null) return { text: null };
  if (typeof raw === 'object' && !('text' in (raw as object))) return { text: null };
  const c = cleanMessage(raw);
  return c ? { text: c.text } : null;
}

export const COUNTDOWN_MIN = 5;
export const COUNTDOWN_MAX = 120;

/** `{ "seconds": 30, "text": "Draw a face" }`, both optional. Seconds are held to 5 up to 120. Null for rubbish. */
export function cleanCountdown(raw: unknown): { text: string | null; seconds: number | null } | null {
  if (raw === undefined || raw === null) return { text: null, seconds: null };
  if (typeof raw === 'string') {
    const t = cleanChallenge(raw);
    return t ? { text: t.text, seconds: null } : null;
  }
  if (typeof raw !== 'object') return null;
  const o = raw as { text?: unknown; seconds?: unknown };
  let text: string | null = null;
  if (o.text !== undefined) {
    const c = cleanMessage({ text: o.text });
    if (!c) return null;
    text = c.text;
  }
  let seconds: number | null = null;
  if (o.seconds !== undefined) {
    if (typeof o.seconds !== 'number' || !Number.isFinite(o.seconds)) return null;
    seconds = Math.min(COUNTDOWN_MAX, Math.max(COUNTDOWN_MIN, Math.round(o.seconds)));
  }
  return { text, seconds };
}

export const viewDares: DareDef<any>[] = [
  {
    id: 'dare.flip',
    label: 'Flip the view',
    family: 'view',
    about: 'Mirrors the screen left to right for a while, then puts it back.',
    kind: 'dare-view',
    cooldown: 45_000,
    keywords: ['mirror', 'flip', 'reverse', 'backwards', 'view'],
    run: (_: undefined, ctx: AudienceContext) =>
      hold('view', { id: 'dare.flip', label: 'Flipped view', ms: dareMs() }, ctx.signal, () => {
        const was = getTurn();
        setTurn(flipped(was));
        nudgeMenus();
        return () => {
          setTurn(was);
          nudgeMenus();
        };
      }),
  },
  {
    id: 'dare.spin',
    label: 'Slowly spin the view',
    family: 'view',
    about: 'Turns the page one slow full circle, then puts it straight again.',
    kind: 'dare-view',
    cooldown: 45_000,
    keywords: ['rotate', 'turn', 'spin', 'twirl', 'view'],
    run: (_: undefined, ctx: AudienceContext) => {
      const ms = dareMs();
      return hold('view', { id: 'dare.spin', label: 'Spinning view', ms }, ctx.signal, () => {
        const was = getTurn();
        const t0 = Date.now();
        // A few steps a second is plenty for a turn this slow, and keeps the canvas calm.
        const timer = setInterval(() => {
          const done = Math.min(1, (Date.now() - t0) / ms);
          setTurn({ angle: was.angle + 360 * done, flip: was.flip });
        }, 250);
        return () => {
          clearInterval(timer);
          setTurn(was);
          nudgeMenus();
        };
      });
    },
  },
  {
    id: 'dare.shake',
    label: 'Shake the screen',
    family: 'view',
    about: 'The drawing area shakes a little, for a short while. Skipped when Reduce motion is on.',
    kind: 'dare-view',
    cooldown: 45_000,
    keywords: ['shake', 'earthquake', 'wobble', 'rumble', 'view'],
    run: (_: undefined, ctx: AudienceContext) => {
      if (getPrefs().reduceMotion) return void toast('A dare waited: Reduce motion is on, so the screen stayed still.', { quill: null, sound: null });
      return hold('view', { id: 'dare.shake', label: 'Shaking screen', ms: dareMs(0.5) }, ctx.signal, () => markPage('shake'));
    },
  },
  {
    id: 'dare.grey',
    label: 'Go greyscale',
    family: 'view',
    about: 'Drains the colour from the drawing area for a while, so you draw in greys. Your colours are not touched.',
    kind: 'dare-view',
    cooldown: 45_000,
    keywords: ['grey', 'gray', 'greyscale', 'grayscale', 'black and white', 'colour', 'value', 'view'],
    run: (_: undefined, ctx: AudienceContext) => hold('view', { id: 'dare.grey', label: 'Greyscale view', ms: dareMs() }, ctx.signal, () => markPage('grey')),
  },
  {
    id: 'dare.zoom',
    label: 'Zoom in somewhere',
    family: 'view',
    about: 'Zooms in close on a spot, then zooms back out to exactly where you were.',
    kind: 'dare-view',
    cooldown: 45_000,
    keywords: ['zoom', 'closer', 'magnify', 'close up', 'view'],
    run: (_: undefined, ctx: AudienceContext) =>
      hold('view', { id: 'dare.zoom', label: 'Zoomed in', ms: dareMs(0.66) }, ctx.signal, () => {
        const was = getView();
        const auto = isAutoFit();
        const { doc } = store().get();
        // A spot in the middle of the page, so it is on screen.
        const x = doc.width * (0.35 + Math.random() * 0.3);
        const y = doc.height * (0.35 + Math.random() * 0.3);
        zoomAtDoc(clampZoom(was.zoom * 3), x, y);
        return () => {
          if (auto) fit(true);
          else setView(was, false);
        };
      }),
  },
  {
    id: 'dare.challenge',
    label: 'Show a challenge banner',
    family: 'view',
    about: 'A banner across the top with a small challenge to take on, like drawing with your other hand. Honour system: Frameling cannot make you.',
    kind: 'dare-banner',
    cooldown: 20_000,
    keywords: ['challenge', 'banner', 'prompt', 'honour', 'words'],
    parse: cleanChallenge,
    run: async ({ text }: { text: string | null }, ctx: AudienceContext) => {
      // Words from chat are asked about first, the same as Quill's signs. One of our own needs no asking.
      if (text !== null && !(await askToShowWords(text, ctx.signal))) return;
      const words = text ?? pickOf(CHALLENGES);
      return hold('banner', { id: 'dare.challenge', label: 'Challenge', ms: dareMs() }, ctx.signal, () => {
        dareScreen.set((s) => ({ ...s, banner: { text: words } }));
        return () => dareScreen.set((s) => ({ ...s, banner: null }));
      });
    },
  },
  {
    id: 'dare.countdown',
    label: 'Start a countdown',
    family: 'view',
    about: 'A big countdown on screen. When it hits zero it says Time!',
    kind: 'dare-banner',
    cooldown: 20_000,
    keywords: ['countdown', 'timer', 'clock', 'time', 'beat the clock'],
    parse: cleanCountdown,
    run: async ({ text, seconds }: { text: string | null; seconds: number | null }, ctx: AudienceContext) => {
      // The countdown can carry chat's words too, so it asks on the same terms.
      if (text !== null && !(await askToShowWords(text, ctx.signal))) return;
      const ms = seconds ? seconds * 1000 : dareMs();
      const words = text ?? 'Beat the clock';
      await hold('countdown', { id: 'dare.countdown', label: 'Countdown', ms }, ctx.signal, () => {
        dareScreen.set((s) => ({ ...s, countdown: { text: words, over: false } }));
        return () => dareScreen.set((s) => ({ ...s, countdown: null }));
      });
      if (ctx.signal.aborted) return;
      // Time! for a moment, unless something newer has taken the place.
      const over = { text: words, over: true };
      dareScreen.set((s) => (s.countdown ? s : { ...s, countdown: over }));
      await lasts(2500, ctx.signal);
      dareScreen.set((s) => (s.countdown === over ? { ...s, countdown: null } : s));
    },
  },
];

// ---------------------------------------------------------------- drawing dares

/** What a drawing dare says on screen, so the streamer and the stream both see what happened. Words only. */
const said = (message: string) => void toast(message, { duration: 3500, quill: null, sound: null });

/** Adds `shapes` on a new layer through the one edit this run may make. Says so when it could not. */
function gift(ctx: AudienceContext, name: string, make: (w: number, h: number) => ReturnType<typeof googlyShapes>, hello: string): void {
  if (!ctx.edit) return;
  const problem = giftProblem(store().get().doc);
  if (problem) return said(REFUSAL_WORDS[problem]);
  ctx.edit(`Audience dare: ${name}`, (doc) => {
    addGiftLayer(doc, name, make(doc.width, doc.height));
  });
  said(hello);
}

export const drawingDares: DareDef<any>[] = [
  {
    id: 'dare.googly',
    label: 'Googly eyes',
    family: 'drawing',
    about: 'Drops a pair of googly eyes onto the drawing, on a new layer of their own.',
    kind: 'dare-draw',
    cooldown: 25_000,
    keywords: ['googly', 'eyes', 'sticker', 'silly', 'add'],
    run: (_: undefined, ctx: AudienceContext) => gift(ctx, 'Googly eyes', (w, h) => googlyShapes(w, h, rng), 'Googly eyes! One Undo takes them off.'),
  },
  {
    id: 'dare.shape',
    label: 'Drop in a shape',
    family: 'drawing',
    about: 'A star, a heart, a blob or a triangle lands somewhere on the drawing, on a new layer of its own.',
    kind: 'dare-draw',
    cooldown: 25_000,
    keywords: ['shape', 'star', 'heart', 'blob', 'triangle', 'sticker', 'add', 'drop'],
    run: (_: undefined, ctx: AudienceContext) => gift(ctx, 'Dropped shape', (w, h) => dropShape(w, h, rng), 'A shape dropped in. One Undo takes it back.'),
  },
  {
    id: 'dare.splat',
    label: 'Paint splat',
    family: 'drawing',
    about: 'A splat of bright paint, a little see-through, on a new layer of its own.',
    kind: 'dare-draw',
    cooldown: 25_000,
    keywords: ['splat', 'splash', 'paint', 'splatter', 'blob', 'add', 'drop'],
    run: (_: undefined, ctx: AudienceContext) => gift(ctx, 'Paint splat', (w, h) => splatShapes(w, h, rng), 'Splat! One Undo wipes it off.'),
  },
  {
    id: 'dare.jelly',
    label: 'Jelly wobble',
    family: 'drawing',
    about: 'Ripples the lines on your current layer a tiny bit, like jelly. Nothing is removed, and the lines stay smooth.',
    kind: 'dare-draw',
    cooldown: 25_000,
    keywords: ['wobble', 'jelly', 'wiggle', 'ripple', 'wavy', 'shake'],
    run: (_: undefined, ctx: AudienceContext) => {
      if (!ctx.edit) return;
      const { ui, doc } = store().get();
      const target = wobbleTarget(doc, ui.activeLayerId, ui.frame);
      if (!target) return said('A dare waited: nothing on this layer to wobble.');
      ctx.edit('Audience dare: jelly wobble', (d) => {
        const drawing = d.drawings[target.drawingId];
        if (drawing && drawing.kind === 'vector') wobbleShapes(drawing.shapes, wobbleSetup(d.width, d.height, rng));
      });
      said('Jelly wobble! One Undo makes it set again.');
    },
  },
  {
    id: 'dare.budge',
    label: 'Budge the drawing',
    family: 'drawing',
    about: 'Slides the drawing on your current layer a little way in a random direction. It is only moved, and Undo moves it back.',
    kind: 'dare-draw',
    cooldown: 25_000,
    keywords: ['nudge', 'budge', 'shove', 'move', 'slide', 'offset'],
    run: (_: undefined, ctx: AudienceContext) => {
      if (!ctx.edit) return;
      const { ui, doc } = store().get();
      const target = nudgeTarget(doc, ui.activeLayerId, ui.frame);
      if (!target) return said('A dare waited: nothing on this layer to budge.');
      const step = nudgeStep(doc.width, doc.height, rng);
      ctx.edit('Audience dare: budge', (d) => void applyNudge(d, target, step));
      said('Budged! One Undo slides it back.');
    },
  },
  {
    id: 'dare.colour',
    label: 'Colour roulette',
    family: 'drawing',
    about: 'Changes the colour you draw with to a random one for a while. Then it goes back to yours, unless you picked another colour meanwhile.',
    kind: 'dare-draw',
    cooldown: 25_000,
    keywords: ['colour', 'color', 'roulette', 'random colour', 'pen colour', 'brush colour', 'swap'],
    run: (_: undefined, ctx: AudienceContext) =>
      hold('colour', { id: 'dare.colour', label: 'Colour roulette', ms: dareMs() }, ctx.signal, () => {
        const was = store().get().ui.color;
        const pick = pickOf(GIFT_COLOURS.filter((c) => c !== was));
        store().setUi({ color: pick });
        said(`Colour roulette: you are drawing in ${pick} for a bit.`);
        // Put back only if the colour in hand is still the dare's: a colour the streamer chose since is theirs.
        return () => {
          if (store().get().ui.color === pick) store().setUi({ color: was });
        };
      }),
  },
];

export const allDares: DareDef<any>[] = [...viewDares, ...drawingDares];
export const dareById = (id: string): DareDef<any> | undefined => allDares.find((d) => d.id === id);
/** `dare.flip` becomes `flip`, for command ids. */
export const shortId = (id: string): string => id.replace(/^dare\./, '');
