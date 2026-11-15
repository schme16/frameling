// The drawing window's end of the link to the Stream control board. A message port arrives (from the desktop side)
// whenever the board opens or the link is made again. From then on this sends the board what it shows, and does what
// its buttons ask. Every button runs a command from the registry, the same one the palette and the menus run; nothing
// here does a streaming job by itself.
//
// What stays covered in the main window stays covered here (src/audience/spoilers.ts): the pulled prompt's words are
// left out of the message while they are covered, and the secret word of a guessing game is never sent at all.
import { audience } from '../audience';
import { covering, VIEW_CHOICE } from '../audience/spoilers';
import { onChoiceChange, rememberedChoice, withChoice } from '../core/choices';
import { getCommand } from '../core/registry';
import { scrubText, subscribeStreamSafe } from '../core/streamSafe';
import { cssVar, subscribeTheme } from '../canvas/theme';
import { onFeaturesChange } from '../features/host';
import { dareScreen } from '../dares/fx';
import { guessScreen } from '../guess/state';
import { isDarkColour, subscribePopout } from '../popout/link';
import { jar } from '../promptjar/jar';
import { jarRead, jarShown } from '../promptjar/card';
import { obs } from '../streamsafe/obs';
import { livePill } from '../ui/liveState';
import { commandEnabled, commandReason, runCommand } from '../ui/palette';
import { voteScreen } from '../votes/state';
import { FRONT_CHOICE } from './choices';
import { layoutStore, resetLayout, setLayout } from './layoutStore';
import { boardView, MISSING_WHY, pressPlan, type BoardTheme, type BoardView, type CommandInfo, type FrontChoice, type ObsWord } from './model';
import type { FromBoard, ToBoard } from './protocol';
import { readSituation } from './situation';
import { STOP_COMMAND, tileById } from './tiles';

interface Session {
  port: MessagePort;
  stop(): void;
}

let session: Session | null = null;
const listeners = new Set<() => void>();

export const isBoardOpen = (): boolean => session !== null;

/** Calls `fn` when the board opens or goes (for the menu tick). Returns the unsubscribe. */
export function subscribeBoard(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const tell = () => {
  for (const f of listeners) f();
};

/** What the registry says about a command, for the pure side. */
export function infoFor(id: string): CommandInfo {
  const c = getCommand(id);
  if (!c) return { exists: false, enabled: false };
  const enabled = commandEnabled(c);
  return { exists: true, enabled, ...(enabled ? {} : { reason: commandReason(c) }) };
}

function readTheme(): BoardTheme {
  const bg = cssVar('--bg', '#17151f');
  return {
    dark: isDarkColour(bg),
    bg,
    panel: cssVar('--panel', '#211e2c'),
    text: cssVar('--text', '#f4efe6'),
    muted: cssVar('--muted', '#b3aac4'),
    accent: cssVar('--accent', '#9b7bff'),
    raised: cssVar('--raised', '#322d43'),
    line: cssVar('--line-soft', '#2e2a40'),
  };
}

/** The OBS part of the pill, in the pill's own words and colours (red only while OBS is really going out). */
function obsWord(): ObsWord {
  const m = livePill({ audience: false, waiting: 0, obs: obs.state })?.obs;
  return m ? { word: m.word, colour: m.colour } : null;
}

export function currentView(): BoardView {
  return boardView({
    situation: readSituation(),
    layout: layoutStore.get(),
    info: infoFor,
    covers: covering(),
    hand: jar.get().hand,
    readId: jarRead.get(),
    scrub: scrubText,
    obs: obsWord(),
    theme: readTheme(),
  });
}

const bridge = () => window.frameling?.streamboard;

function start(port: MessagePort): void {
  session?.stop();
  const unsubs: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = '';
  let ready = false;

  const send = (m: ToBoard) => {
    try {
      port.postMessage(m);
    } catch {
      queueMicrotask(stop);
    }
  };
  const say = (text: string, ok = false) => send({ t: 'said', text, ok });

  const push = () => {
    timer = null;
    if (!ready) return;
    const view = currentView();
    const key = JSON.stringify(view);
    if (key === last) return;
    last = key;
    send({ t: 'view', view });
  };
  // Several stores change together (a vote ending), and a vote's count changes in bursts: one message per short wait.
  const later = () => {
    if (!timer) timer = setTimeout(push, 60);
  };

  const run = (tile: string) => {
    const s = readSituation();
    const face = tileById(tile)?.face(s);
    const info = face ? infoFor(face.command) : undefined;
    const front = rememberedChoice(FRONT_CHOICE) as FrontChoice | undefined;
    const plan = pressPlan(tile, s, info, front);
    if (plan.kind === 'say') return say(plan.say);
    if (plan.raise) void bridge()?.raiseMain();
    const go = () => {
      const c = face && getCommand(face.command);
      if (c) runCommand(c);
      later();
    };
    // A button that opens a setup window asks once whether to come forward for it, in the window where the answer is seen.
    if (plan.ask) withChoice(FRONT_CHOICE, () => go());
    else go();
  };

  const stopEverything = () => {
    const c = getCommand(STOP_COMMAND);
    if (!c) return say(MISSING_WHY);
    runCommand(c);
    say('Stopped. Audience participation is off. Press its button to turn it back on.', true);
  };

  port.onmessage = (e) => {
    const m = e.data as FromBoard | null;
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        ready = true;
        last = '';
        push();
        break;
      case 'press':
        if (typeof m.tile === 'string') run(m.tile);
        break;
      case 'stop':
        stopEverything();
        break;
      case 'layout':
        setLayout(m.layout);
        break;
      case 'reset':
        resetLayout();
        break;
      case 'prompt': {
        const hand = jar.get().hand;
        // Only the slip in hand can be read, so a stale message about an old one does nothing.
        if (!hand || hand.id !== m.id) break;
        if (m.do === 'read') jarRead.set(hand.id);
        else {
          jarRead.set(null);
          jarShown.set(null);
        }
        break;
      }
    }
  };
  port.start();
  port.addEventListener('close', () => stop());

  unsubs.push(
    audience.subscribe(later),
    voteScreen.subscribe(later),
    guessScreen.subscribe(later),
    jar.subscribe(later),
    jarRead.subscribe(later),
    dareScreen.subscribe(later),
    obs.subscribe(later),
    layoutStore.subscribe(later),
    subscribeStreamSafe(later),
    subscribePopout(later),
    subscribeTheme(later),
    onFeaturesChange(later),
    onChoiceChange((id) => (id === VIEW_CHOICE || id.startsWith('audience.')) && later()),
  );

  function stop(): void {
    if (session?.port !== port) return;
    session = null;
    for (const u of unsubs.splice(0)) u();
    if (timer) clearTimeout(timer);
    try {
      port.close();
    } catch {
      // Already closed.
    }
    tell();
  }

  session = { port, stop };
  tell();
}

/** Stops following (the board is gone). */
export function stopBoard(): void {
  session?.stop();
}

let installed = false;
/** Listens for the link arriving from the desktop side. Call once at start-up; does nothing in a plain browser. */
export function installBoardLink(): void {
  if (installed || typeof window === 'undefined') return;
  const api = bridge();
  if (!api) return;
  installed = true;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data !== 'frameling-streamboard-port' || !e.ports[0]) return;
    start(e.ports[0]);
  });
  api.onClosed(stopBoard);
}
