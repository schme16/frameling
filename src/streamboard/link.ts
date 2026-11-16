// The drawing window's end of the link to the Stream control board. A message port arrives (from the desktop side)
// whenever the board opens or the link is made again. From then on this sends the board what it shows, and does what
// its buttons ask. Every button runs a command from the registry, the same one the palette and the menus run; nothing
// here does a streaming job by itself.
//
// The board is private or it is not (privacy.ts), and that decides what may be in a message at all. On a private board the
// vote, the secret word, the guesses and the whole waiting list of the prompt jar go across plainly. When it is not
// private, the same covering rules the main window keeps apply (src/audience/spoilers.ts): viewers' words and the secret
// word are left out of the message, so they never reach the board's page until the streamer presses to read them.
import { audience } from '../audience';
import { VIEW_CHOICE } from '../audience/spoilers';
import { currentChoice, onChoiceChange, rememberedChoice, setChoice, withChoice } from '../core/choices';
import { getCommand } from '../core/registry';
import { scrubText, subscribeStreamSafe } from '../core/streamSafe';
import { cssVar, subscribeTheme } from '../canvas/theme';
import { onFeaturesChange } from '../features/host';
import { dareScreen } from '../dares/fx';
import { cleanSetup as cleanRound } from '../guess/round';
import { LENGTHS as GUESS_LENGTHS, lastLength as lastGuessLength, rememberLength as rememberGuessLength } from '../guess/setup';
import { currentRound, guessScreen, roundIsOpen, startRound, withAudienceOn as withAudienceOnForRound } from '../guess/state';
import { isDarkColour, subscribePopout } from '../popout/link';
import { jar, pullSlip } from '../promptjar/jar';
import { JAR_MAX } from '../promptjar/logic';
import { jarRead, jarShown } from '../promptjar/card';
import { obs } from '../streamsafe/obs';
import { livePill } from '../ui/liveState';
import { commandEnabled, commandReason, runCommand } from '../ui/palette';
import { LENGTHS as VOTE_LENGTHS, lastLength as lastVoteLength, rememberLength as rememberVoteLength } from '../votes/setup';
import { cleanSetup as cleanVote } from '../votes/tally';
import { startVote, voteScreen, withAudienceOn as withAudienceOnForVote } from '../votes/state';
import { FRONT_CHOICE } from './choices';
import { boardCovers, ONSTREAM_CHOICE, onStreamNow, type PrivacyFacts } from './privacy';
import { guessSide, jarSide, keepRead, voteSide, type GuessSide, type JarSide, type VoteSide } from './side';
import { layoutStore, resetLayout, setLayout } from './layoutStore';
import { boardView, MISSING_WHY, pressPlan, type BoardTheme, type BoardView, type CommandInfo, type FrontChoice, type ObsWord } from './model';
import type { FromBoard, ToBoard } from './protocol';
import { audienceWouldAsk, readSituation } from './situation';
import { STOP_COMMAND, tileById } from './tiles';

interface Session {
  port: MessagePort;
  stop(): void;
}

let session: Session | null = null;
const listeners = new Set<() => void>();

export const isBoardOpen = (): boolean => session !== null;

// Whether the board is on a different screen from the drawing window (Electron tells us when it moves).
let apart = false;
// Waiting prompts and guesses the streamer pressed to read while the board was not private. Ids and a flag, never words.
let readSlips = new Set<number>();
let guessRead = false;
const coverAgain = () => {
  readSlips = new Set();
  guessRead = false;
};

/** What is known about whether the board is private right now. */
export const privacyFacts = (): PrivacyFacts => ({ answer: currentChoice<string>(VIEW_CHOICE), onStream: onStreamNow(), apart });

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

const scrubOrNull = (t: string | undefined): string | null => (t ? scrubText(t) : null);

/** The vote, the guessing game and the waiting prompts as the board may see them. A part whose command is missing is left out. */
function sides(covers: boolean): { vote: VoteSide | null; guess: GuessSide | null; jar: JarSide | null } {
  const has = (id: string) => infoFor(id).exists;
  const round = currentRound();
  const j = jar.get();
  readSlips = keepRead(readSlips, j.slips);
  return {
    vote: has('votes.start') ? voteSide(voteScreen.get(), { lengths: VOTE_LENGTHS, seconds: lastVoteLength() }) : null,
    guess: has('guess.start')
      ? guessSide({
          screen: guessScreen.get(),
          secret: !covers && roundIsOpen() ? scrubOrNull(round?.secret()) : null,
          recent: round?.recent() ?? [],
          covers,
          read: guessRead,
          scrub: scrubText,
          setup: { lengths: GUESS_LENGTHS, seconds: lastGuessLength() },
        })
      : null,
    jar: has('promptjar.pull') ? jarSide(j.slips, JAR_MAX, covers, readSlips, scrubText) : null,
  };
}

export function currentView(): BoardView {
  const privacy = privacyFacts();
  return boardView({
    situation: readSituation(),
    layout: layoutStore.get(),
    info: infoFor,
    privacy,
    ...sides(boardCovers(privacy)),
    hand: jar.get().hand,
    readId: jarRead.get(),
    scrub: scrubText,
    obs: obsWord(),
    theme: readTheme(),
  });
}

const bridge = () => window.frameling?.streamboard;

const apartListeners = new Set<() => void>();
const onApart = (fn: () => void): (() => void) => {
  apartListeners.add(fn);
  return () => void apartListeners.delete(fn);
};
/** Electron says the board moved to another screen, or back. Everything read is covered again, as the privacy changed. */
export function setApart(now: boolean): void {
  if (apart === now) return;
  apart = now;
  coverAgain();
  for (const f of apartListeners) f();
}

function start(port: MessagePort): void {
  session?.stop();
  coverAgain();
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
      case 'slip': {
        if (m.do === 'read') readSlips = new Set([...readSlips, m.id]);
        else if (pullSlip(m.id)) jarRead.set(null), jarShown.set(null);
        later();
        break;
      }
      case 'slips':
        if (m.do === 'read') readSlips = new Set(jar.get().slips.map((x) => x.id));
        else readSlips = new Set();
        later();
        break;
      case 'guesses':
        guessRead = m.do === 'read';
        later();
        break;
      case 'vote': {
        const cleaned = cleanVote({ question: m.question, options: m.options, seconds: m.seconds || null });
        if (!cleaned.ok) return say(cleaned.reason);
        rememberVoteLength(m.seconds);
        if (audienceWouldAsk()) void bridge()?.raiseMain();
        withAudienceOnForVote(() => {
          const r = startVote(cleaned.setup);
          say(r.ok ? 'The vote is on. It is counting now.' : r.reason, r.ok);
          later();
        });
        break;
      }
      case 'round': {
        // The word is typed here only while the board is private. Anything else would put it on a screen somebody may see.
        if (boardCovers(privacyFacts())) return say('This board is not private, so the word is not typed here. Press Start a guessing game and type it in Frameling.');
        const cleaned = cleanRound({ word: m.word, seconds: m.seconds || null, ending: currentChoice('guess.ending') });
        if (!cleaned.ok) return say(cleaned.reason);
        rememberGuessLength(m.seconds);
        if (audienceWouldAsk()) void bridge()?.raiseMain();
        withAudienceOnForRound(() => {
          const r = startRound(cleaned.setup);
          say(r.ok ? 'The game is on. Chat is guessing.' : r.reason, r.ok);
          later();
        });
        break;
      }
      case 'onstream':
        setChoice(ONSTREAM_CHOICE, m.on ? 'onstream' : 'private');
        break;
      case 'viewers': {
        void bridge()?.raiseMain();
        const c = getCommand('audience.view');
        if (c) runCommand(c);
        break;
      }
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
    onChoiceChange((id) => {
      // A different answer about who can see this board covers everything again, so nothing read before stays read.
      if (id === VIEW_CHOICE || id === ONSTREAM_CHOICE) coverAgain();
      if (id === VIEW_CHOICE || id === ONSTREAM_CHOICE || id.startsWith('audience.') || id.startsWith('guess.')) later();
    }),
    onApart(later),
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
  api.onApart?.(setApart);
  void api.apart?.().then(setApart);
}
