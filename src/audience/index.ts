// Audience features, the app's side: the one gate (see ./gate.ts for the rules and how to register against it), the
// master switch's memory, the commands, the choices and the help. The On air pill and its card are in ../ui/LivePill.tsx.
//
// FOR OTHER FEATURES, the whole surface is these four things:
//   registerAudienceAction({ id, label, kind, cooldown, touchesDrawing?, parse?, run })   what the audience may make happen
//     (`touchesDrawing: true` for anything that changes the document; its `run` then changes it only through `ctx.edit`)
//   registerAudienceDoor({ id, label, open, close })                     a way in, opened and closed by the switch
//   submitAudience(id, raw?)                                             what a door calls when it hears something
//   lasts(ms, signal)                                                    wait for an effect that ends by itself
// Register inside your feature's `activate()` (or at the top level of its descriptor) and it goes when the feature does.
import { askAgain, currentChoice, onChoiceChange, registerChoice, setChoice, withChoice } from '../core/choices';
import { ownedUndo, removeOwned, withOwner } from '../core/owners';
import { registerCommands, registerHelpTopics, type Command } from '../core/registry';
import { addKeptOutHelp, onFeaturesChange } from '../features/host';
import { streamingOn } from '../features/streamFamily';
import { store } from '../core/store';
import { readJson, writeJson } from '../ui/mini';
import { openHelp } from '../ui/overlays';
import { toast } from '../ui/toast';
import { audienceChoices } from './choices';
import { VIEW_CHOICE } from './spoilers';
import { createGate, limitsFor, lasts, refusal, type AudienceActionDef, type AudienceDoorDef, type Gate, type Verdict } from './gate';
import { audienceHelp, coverHelp, startHelp } from './help';
import { desktop } from '../io/desktop';
import { globalStop, showAudienceCard } from './card';
import { registerQuietFamily } from '../ui/palette';
import { STREAM_WORDS } from '../ui/streamWords';

export { lasts, refusal };
export type { AudienceActionDef, AudienceContext, AudienceDoorDef, AudienceCounts, GateLimits, RejectReason, Strictness, Refusal, Verdict } from './gate';

const KEY = 'frameling.audience.v1';
const GATE_OWNER = 'audience-gate';

/** The app's one gate, on the real clock, with the strictness the streamer chose. Everything below is this object. */
export const audience: Gate = createGate({
  now: () => Date.now(),
  later: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
  limits: () => limitsFor(currentChoice('audience.strictness')),
  // The one way an audience action reaches the document: a single step, so one Undo takes it back.
  edit: (label, recipe) => store().update(label, recipe),
});

/** Adds one thing the audience may do. Refused ids are rejected by the gate, so this is the allowlist. Returns the way to take it back. */
export function registerAudienceAction<P = undefined>(def: AudienceActionDef<P>): () => void {
  const off = audience.registerAction(def);
  ownedUndo(off);
  return off;
}

/** Adds a way in from outside. It is opened only while the switch is on, and closed by the switch, Stop and kill. */
export function registerAudienceDoor(def: AudienceDoorDef): () => void {
  const off = audience.registerDoor(def);
  ownedUndo(off);
  return off;
}

/** What a door calls with what it heard. Returns what happened; never throws. */
export const submitAudience = (id: string, raw?: unknown): Verdict => audience.submit(id, raw);

/** True when the switch was left on and the person asked for it to be remembered. Pure, for tests. */
export function startsOn(saved: boolean, startup: string): boolean {
  return saved && startup === 'keep';
}

const saved = (): { on: boolean; drawing: boolean } => {
  const v = readJson<{ on: boolean; drawing: boolean }>(KEY, { on: false, drawing: false });
  return { on: v.on === true, drawing: v.drawing === true };
};

/** "Let the audience interrupt your drawing": off after install. While off, actions that reach the drawing are refused. */
export const setAudienceDrawing = (allowed: boolean): void => audience.setDrawingAllowed(allowed);

/** Turns audience features on, asking the first time how careful to be. Off needs no question. */
export function setAudienceOn(on: boolean): void {
  if (!on) return audience.setOn(false);
  // Two first-time questions, both before anything can arrive: how careful, then what your viewers can see.
  withChoice('audience.strictness', () => withChoice(VIEW_CHOICE, () => audience.setOn(true)));
}

/** The big red button: queue cleared, effects stopped, doors closed, switch off. Says so, with a way back. */
export function stopAudience(): void {
  audience.kill();
  toast('Stopped. Audience features are off.', { action: { label: 'Turn back on', run: () => setAudienceOn(true) }, duration: 6000 });
}

export function emptyAudienceQueue(): number {
  const n = audience.clearQueue();
  toast(n ? `Emptied the queue (${n} waiting).` : 'The queue was already empty.');
  return n;
}

let installed = false;
let gateCommands: Command[] = [];
let gateShown = false;

/**
 * Puts the gate's own commands (the switch, Stop, the queue) in the palette and the menus while any streaming feature
 * is on, and takes them out while all are tucked away, so somebody who never streams does not see them. The gate and
 * its help stay, and switching any streaming feature on brings the commands back.
 */
// The route page's picture is still in use while it is tucked away, so the help audit counts it.
addKeptOutHelp(() => (gateShown ? [] : [...startHelp, ...coverHelp]));

export function syncGateCommands(): void {
  const want = streamingOn();
  if (want === gateShown) return;
  gateShown = want;
  if (want) {
    withOwner(GATE_OWNER, () => {
      registerCommands(gateCommands);
      // The cover page goes with the command that opens it, so it leaves when the streaming tools are tucked away.
      registerHelpTopics(startHelp);
      registerHelpTopics(coverHelp);
    });
  }
  else {
    removeOwned(GATE_OWNER);
    // Nothing is left that could use it, so the switch goes off with the last of them.
    if (audience.isOn()) audience.setOn(false);
  }
}

export function installAudience(): void {
  if (installed) return;
  installed = true;
  // Until audience features are on, ordinary words ("settings", "test", "stop") find ordinary things first.
  registerQuietFamily({
    has: (c) => c.category === 'Audience',
    words: STREAM_WORDS,
    quiet: () => !audience.isOn(),
  });
  registerHelpTopics(audienceHelp);
  for (const c of audienceChoices) registerChoice(c);
  gateCommands = [
    {
      id: 'audience.toggle',
      label: 'Audience features',
      category: 'Audience',
      description: 'Let viewers and stream tools take part in a small, safe way. Off until you switch it on. Shows a red On air pill while it is on.',
      help: 'audience',
      keywords: ['stream', 'streamer', 'twitch', 'youtube', 'chat', 'viewers', 'audience', 'on air', 'live', 'switch', 'obs', 'interactive'],
      global: true,
      checked: () => audience.isOn(),
      run: () => setAudienceOn(!audience.isOn()),
    },
    {
      id: 'audience.drawing',
      label: 'Let the audience interrupt your drawing',
      category: 'Audience',
      description: 'Lets audience actions that reach your drawing (dares, pen tricks) run, each as one step that Undo takes back. Off after install: then they are refused.',
      help: 'audience',
      keywords: ['interrupt', 'dares', 'debuff', 'debuffs', 'troll', 'trolls', 'chaos', 'drawing', 'document', 'audience', 'stream', 'allow', 'pen modifier', 'sabotage', 'mess up'],
      global: true,
      checked: () => audience.snapshot().drawingAllowed,
      run: () => setAudienceDrawing(!audience.snapshot().drawingAllowed),
    },
    {
      id: 'audience.view',
      label: 'What can your viewers see?',
      category: 'Audience',
      description: 'Tell Frameling whether your viewers can see your screen or only the capture window. Secret words, pulled prompts and words from chat stay covered until you press to read them, unless only the capture window is seen.',
      help: 'cover-spoilers',
      keywords: ['viewers', 'see', 'cover', 'covered', 'hide', 'hidden', 'secret', 'spoiler', 'spoilers', 'surprise', 'privacy', 'private', 'capture', 'screen', 'stream', 'streamer', 'word', 'words', 'prompt', 'prompts', 'chat', 'crude', 'rude', 'showing', 'swear', 'swearing', 'viewer', 'stop'],
      global: true,
      run: () => void askAgain(VIEW_CHOICE, currentChoice(VIEW_CHOICE)).then((r) => r && setChoice(VIEW_CHOICE, r.value)),
    },
    {
      id: 'audience.kill',
      label: 'Stop everything from the audience',
      category: 'Audience',
      description: 'Empties the queue, stops every effect, closes every way in and switches audience features off, all at once.',
      help: 'audience',
      keywords: ['kill', 'panic', 'stop', 'emergency', 'off', 'trolls', 'raid', 'stream', 'clear', 'halt'],
      keys: ['Mod+Alt+K'],
      global: true,
      run: stopAudience,
    },
    {
      id: 'audience.clearQueue',
      label: 'Empty the audience queue',
      category: 'Audience',
      description: 'Throws away everything waiting its turn. What is already happening carries on.',
      help: 'audience',
      keywords: ['queue', 'clear', 'empty', 'waiting', 'stream', 'viewers'],
      keys: ['Mod+Alt+Shift+K'],
      global: true,
      enabled: () => audience.snapshot().queue.length > 0,
      reason: () => 'Nothing is waiting.',
      run: () => void emptyAudienceQueue(),
    },
    {
      id: 'audience.start',
      label: 'How to get your viewers taking part',
      category: 'Audience',
      description: 'The whole route in one page: connect Twitch for rewards and cheers, add a chat bot for votes and guesses, import the setup file, run your first vote.',
      help: 'viewers-take-part',
      keywords: ['stream', 'streamer', 'twitch', 'viewers', 'audience', 'chat', 'vote', 'voting', 'guess', 'prompt', 'suggest', 'suggestions', 'interact', 'interaction', 'participate', 'get started', 'start', 'set up', 'setup', 'how do i', 'firebot', 'streamer.bot', 'bot', 'go live', 'first time'],
      global: true,
      run: () => openHelp('viewers-take-part'),
    },
    {
      id: 'audience.show',
      label: 'Show the audience queue and counts',
      category: 'Audience',
      description: 'Opens the On air card: what is waiting, what the audience has done, and the Stop button.',
      help: 'audience',
      keywords: ['queue', 'counts', 'on air', 'stream', 'what is waiting', 'log'],
      global: true,
      enabled: () => audience.isOn(),
      reason: () => 'Switch audience features on first (Preferences > Streaming).',
      run: showAudienceCard,
    },
  ];
  syncGateCommands();
  // The commands and the View > Audience features menu are only there while a streaming feature is on.
  onFeaturesChange(syncGateCommands);

  // The switch comes back on only when the person said that is what they want. By default every start is quiet.
  const was = saved();
  // Whether the audience may reach the drawing is the streamer's standing choice, so it is remembered as it was left.
  audience.setDrawingAllowed(was.drawing);
  if (startsOn(was.on, currentChoice('audience.startup'))) audience.setOn(true);
  let lastOn = audience.isOn();
  let lastDrawing = audience.snapshot().drawingAllowed;
  audience.subscribe(() => {
    const on = audience.isOn();
    const drawing = audience.snapshot().drawingAllowed;
    if (drawing !== lastDrawing) {
      lastDrawing = drawing;
      writeJson(KEY, { on, drawing });
    }
    if (on === lastOn) return;
    lastOn = on;
    writeJson(KEY, { on, drawing });
    // While on air the Stop key is asked to work from any window. Best effort: some desktops say no.
    void Promise.resolve(desktop()?.app.setPanicKey?.(on)).then(
      (ok) => globalStop.set(on && ok === true),
      () => globalStop.set(false),
    );
  });
  desktop()?.app.onPanicKey?.(stopAudience);
  // A new strictness acts at once, and the card shows it.
  onChoiceChange((id) => id === 'audience.strictness' && audience.refresh());
}
