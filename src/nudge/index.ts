// Two gentle nudges for a person looking at a new, empty page: a faint line on the page itself ("Draw something. The
// brush is ready.") that goes at the first stroke, and one warm line from Quill after the first drawing, about what
// comes next. Both stay quiet with Show Quill off, and each has its own switch in Preferences > Behaviour. The rules
// are in rules.ts. The line is drawn on the overlay, so it is never in an export, can't be picked or drawn over, and
// can't end up in a picture of real work.
import { currentChoice, onChoiceChange, registerChoice, setChoice } from '../core/choices';
import type { Doc, Id } from '../core/format';
import { getCommand, getTool, registerCommands } from '../core/registry';
import { store, type Store } from '../core/store';
import { registerDecoration } from '../canvas/decorations';
import { requestOverlay } from '../canvas/controller';
import { inHarness } from '../pixel/harness';
import { line, lines } from '../ui/mascot/lines';
import { getPrefs } from '../ui/prefs';
import { strokeIsOn } from '../tablet/check/state';
import { toast } from '../ui/toast';
import { MAX_SHOWS, drawnNudgeShows, isFreshVectorPage, drawsStraightAway, pageLineInk, pageLineShows, type Mood, type NudgeChoice } from './rules';
import { choiceWord } from '../words/choices';

export const PAGE_CHOICE = 'nudge.page';
export const DRAWN_CHOICE = 'nudge.drawn';
const KEY = 'frameling.nudges';

const options: { value: NudgeChoice; label: string; detail: string }[] = [
  { value: 'on', label: 'Yes please', detail: 'A little nudge when it can help, never more than a few times.' },
  { value: 'off', label: 'No thank you', detail: 'Nothing is said.' },
];

registerChoice<NudgeChoice>({
  id: PAGE_CHOICE,
  title: choiceWord('choice.nudge.page.title'),
  question: choiceWord('choice.nudge.page.question'),
  category: 'Quill',
  silent: true,
  default: 'on',
  help: 'It is a faint line on the page itself, and it goes the moment you draw. It needs Show Quill to be on.',
  options,
});

registerChoice<NudgeChoice>({
  id: DRAWN_CHOICE,
  title: choiceWord('choice.nudge.drawn.title'),
  question: choiceWord('choice.nudge.drawn.question'),
  category: 'Quill',
  silent: true,
  default: 'on',
  help: 'One line, a few times at most, and never again after Not now. It needs Show Quill to be on.',
  options,
});

const mood = (id: string): Mood => ({ quill: getPrefs().showQuill, choice: currentChoice<NudgeChoice>(id), harness: inHarness() });

// How many times Quill has said it, kept on this computer (and in memory, for when there's no storage).
let shownMem: number | null = null;

function shownCount(): number {
  if (shownMem !== null) return shownMem;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { shown?: unknown };
    shownMem = typeof v.shown === 'number' && v.shown >= 0 ? v.shown : 0;
  } catch {
    shownMem = 0;
  }
  return shownMem;
}

function setShown(n: number): void {
  shownMem = n;
  try {
    localStorage.setItem(KEY, JSON.stringify({ shown: n }));
  } catch {
    // not remembered this time
  }
}

/** Files that have had their first stroke: undoing back to blank doesn't bring the page line back. */
const drawnOn = new Set<Id>();
const freshMemo = new WeakMap<Doc, boolean>();

function fresh(doc: Doc): boolean {
  let f = freshMemo.get(doc);
  if (f === undefined) freshMemo.set(doc, (f = isFreshVectorPage(doc)));
  return f;
}

const hasShapes = (doc: Doc): boolean => Object.values(doc.drawings).some((d) => d.kind === 'vector' && d.shapes.length > 0);

// Which of the lines this drawing gets. Picked once per drawing, so the page says the same thing while you look at it
// and something else on the next one, and so the canvas redrawing never makes it flicker.
const picked = new Map<string, number>();
function pageLine(docId: Id, id: 'nudge.page' | 'nudge.page.other', vars: Record<string, string>): string {
  const all = id === 'nudge.page' ? lines('nudge.page', vars) : lines('nudge.page.other');
  const key = `${docId}:${id}`;
  let at = picked.get(key);
  if (at === undefined || at >= all.length) {
    at = Math.floor(Math.random() * all.length);
    picked.set(key, at);
  }
  return all[at];
}

/** One of Quill's lines for the first drawing, a different one each time it shows. */
const drawnLine = (): string => {
  const all = lines('nudge.drawn');
  return all[Math.floor(Math.random() * all.length)];
};

/** The faint line on the page, in document coordinates: sized to read at any zoom, and shrunk to fit a small page. */
registerDecoration((g, ctx) => {
  const { doc, ui } = store().get();
  if (!pageLineShows({ ...mood(PAGE_CHOICE), fresh: fresh(doc), drawnOn: drawnOn.has(doc.id), playing: ui.playing, stroking: strokeIsOn() })) return;
  const tool = getTool(ui.tool);
  const named = drawsStraightAway(tool?.id ?? '');
  const text = pageLine(doc.id, named ? 'nudge.page' : 'nudge.page.other', { tool: (tool?.label ?? 'brush').toLowerCase() });
  let px = 22 / ctx.zoom;
  g.font = `500 ${px}px system-ui, sans-serif`;
  const w = g.measureText(text).width;
  const room = doc.width * 0.86;
  if (w > room) {
    px *= room / w;
    g.font = `500 ${px}px system-ui, sans-serif`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = pageLineInk(doc.background);
  g.fillText(text, doc.width / 2, doc.height / 2);
});

function sayDrawn(s: Store): void {
  const { doc, ui } = s.get();
  const shown = shownCount();
  if (!drawnNudgeShows({ ...mood(DRAWN_CHOICE), firstStroke: true, shown, frames: doc.length, playing: ui.playing })) return;
  setShown(shown + 1);
  toast(drawnLine(), {
    kind: 'info',
    quill: 'cheer',
    duration: 10000,
    action: {
      label: 'Play it',
      id: 'nudge-play',
      run: () => {
        setShown(MAX_SHOWS);
        void getCommand('timeline.play')?.run();
      },
    },
    decline: { label: 'Not now', id: 'nudge-not-now', run: () => setChoice(DRAWN_CHOICE, 'off') },
  });
}

/** Watches the document for the first stroke. Returns a way to stop. */
export function installNudges(s: Store = store(), wait = 900): () => void {
  let watched: Id | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const look = (): void => {
    const { doc, ui } = s.get();
    if (drawnOn.has(doc.id)) return;
    if (fresh(doc)) {
      watched = doc.id;
      return;
    }
    if (watched !== doc.id || !ui.dirty || !hasShapes(doc)) return;
    watched = null;
    drawnOn.add(doc.id);
    clearTimeout(timer);
    timer = setTimeout(() => sayDrawn(s), wait);
  };
  look();
  const off = s.subscribe(look);
  const offChoice = onChoiceChange((id) => id === PAGE_CHOICE && requestOverlay());
  return () => {
    off();
    offChoice();
    clearTimeout(timer);
  };
}

/** For tests. */
export function _resetNudges(): void {
  drawnOn.clear();
  shownMem = null;
}

registerCommands([
  {
    id: 'quill.nudges',
    label: 'Gentle nudges on or off',
    category: 'Help',
    description: 'The faint line on an empty page and Quill\'s tip after your first drawing: turns both on or both off.',
    keywords: ['nudge', 'hint', 'tip', 'empty page', 'blank page', 'quill', 'quiet', 'draw something'],
    help: 'empty-page',
    run: () => {
      const on = currentChoice(PAGE_CHOICE) === 'on' || currentChoice(DRAWN_CHOICE) === 'on';
      const v = on ? 'off' : 'on';
      setChoice(PAGE_CHOICE, v);
      setChoice(DRAWN_CHOICE, v);
      if (v === 'on') setShown(0);
      toast(on ? 'Nudges are off.' : 'Nudges are on. Quill has your back.');
    },
  },
]);
