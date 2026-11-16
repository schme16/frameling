// Shared facts for the findability audits: the real app loaded the way it starts, every way into a command, and the
// situations the app can be in that change what is on offer. Nothing here is a fixture; it all reads the real registry.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allCommands, allPanels, allTools, loadHelpBodies, type Command } from '../../src/core/registry';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, LayerKind, PathShape } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { isStaleCommand, syncDynamicCommands } from '../../src/ui/dynamic';
import { KEYMAP_SETS } from '../../src/ui/keymapSets';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';
import { paletteItems } from '../../src/ui/palette';
import { railFor, type RailTool } from '../../src/ui/toolArrange';
import { addTilemapLayer } from '../../src/tiles/ops';
import { audience, setAudienceOn } from '../../src/audience';
import { setChoice } from '../../src/core/choices';
import { dareScreen } from '../../src/dares/fx';
import { penEffect } from '../../src/penmods/active';
import { jar, addToJar, pullOne } from '../../src/promptjar/jar';
import { overlayReady } from '../../src/streamoverlay/state';
import { doorStatus } from '../../src/streamdoor/state';
import { twitchStatus } from '../../src/twitch/state';
import { closeVote, endVote, startVote } from '../../src/votes/state';
import { closeRound, startRound } from '../../src/guess/state';
import { closedStatus } from '../../src/shared/streamDoor';
import { signedOutStatus } from '../../src/shared/twitch';
import { addCamera } from '../../src/camera/ops';
import { setPrefs } from '../../src/ui/prefs';
import { editSymbol, makeSymbolFromSelection } from '../../src/symbols/ops';
import { newTile, pickTile, solidTile, addTerrain, setTerrainOf } from '../../src/tiles/ops';
import { addBone, ensureRig, bendLayer, currentRig } from '../../src/rig/ops';
import { setRigUi } from '../../src/rig/state';
import { setTl } from '../../src/timeline/state';
import { setPixelText } from '../../src/text/pixel/settings';
import { DEFAULT_PIXEL_TEXT } from '../../src/text/pixel/font';
import { newParticles } from '../../src/particles/model';
import { resetDrawingState } from '../../src/core/fresh';
import '../../src/renderer/features';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The app as it is at start: everything registered, the tool, panel and workspace commands made, help words in. */
export async function loadApp(): Promise<void> {
  await loadHelpBodies();
  syncDynamicCommands();
}

// ---------------------------------------------------------------- situations

export interface Situation {
  id: string;
  /** In plain words, for the report. */
  about: string;
  /** Puts the store in this situation. */
  set(): void;
}

const square = (id: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 60 }] }], fill: '#ff0000', stroke: null, opacity: 1 }) as PathShape;

/** A vector drawing with one shape on its only layer. */
function vectorDoc(): Doc {
  const doc = newDoc({ width: 400, height: 300, length: 24 });
  const d = newVectorDrawing();
  d.shapes.push(square('shape-a'));
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'cel-a', start: 0, length: 24, drawingId: d.id });
  return doc;
}

const fresh = (doc: Doc) => {
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[doc.layers.length - 1].id, frame: 0, selection: [], playing: false });
};

export const SITUATIONS: Situation[] = [
  // The usual empty drawing, with animation on: how every drawing was before animation became opt in. The still drawing Frameling
  // opens to now is STILL_SITUATION, measured on its own in still.test.ts, so the numbers here keep meaning "most on offer".
  { id: 'blank', about: 'A new, empty drawing with animation on (the welcome sheet sits on top).', set: () => fresh(newDoc({ animated: true })) },
  { id: 'vector', about: 'A vector drawing with a shape on it and nothing selected.', set: () => fresh(vectorDoc()) },
  {
    id: 'vector-selected',
    about: 'The same drawing with the shape selected.',
    set: () => {
      fresh(vectorDoc());
      store().setUi({ selection: ['shape-a'] });
    },
  },
  { id: 'pixel', about: 'A pixel art drawing, on a pixel layer.', set: () => fresh(newDoc({ pixel: { pixelSize: 1 } })) },
  {
    id: 'tilemap',
    about: 'A tilemap layer is the one being drawn on.',
    set: () => {
      fresh(vectorDoc());
      addTilemapLayer();
    },
  },
  {
    id: 'symbol-open',
    about: 'Inside a symbol, editing it by itself.',
    set: () => {
      fresh(vectorDoc());
      store().setUi({ selection: ['shape-a'] });
      makeSymbolFromSelection('Thing');
      const id = Object.keys(store().get().doc.symbols ?? {})[0];
      if (id) editSymbol(id);
    },
  },
  {
    id: 'playing',
    about: 'The animation is playing.',
    set: () => {
      fresh(vectorDoc());
      store().setUi({ playing: true });
    },
  },
  {
    id: 'has-clips',
    about: 'The drawing has a named clip (a stretch of frames). Which clip is selected lives in the panel, not the store, so this is the closest the store can say.',
    set: () => {
      const doc = vectorDoc();
      doc.clips.push({ id: 'clip-a', name: 'Walk', start: 0, end: 11 } as Doc['clips'][number]);
      fresh(doc);
    },
  },
];

/** What Frameling opens to: one still picture, with no animation until Add animation. Kept out of SITUATIONS (see above). */
export const STILL_SITUATION: Situation = { id: 'still', about: 'A new, empty drawing with no animation, which is what Frameling opens to.', set: () => fresh(newDoc({ animated: false })) };

// ---------------------------------------------------------------- feature states

/**
 * A state of a FEATURE, as opposed to a state of the document: a vote is going, the jar holds a prompt, OBS is
 * linked, there is no desktop at all. The document situations above never set one of these up, so for a long time the
 * commands of the audience family were only ever looked at while every one of them was idle, or greyed for the one
 * reason a test run has (no desktop). Each state says what it must turn on and what it must leave off, so a state
 * that set up nothing cannot pass for one that did.
 */
export interface FeatureState {
  id: string;
  /** In plain words, for the report. */
  about: string;
  /** Is the desktop app there? Matters for any reason that says "needs the desktop app". */
  desktop: boolean;
  /** Puts the app in this state, starting from the quiet one (see `quietWorld`). */
  set(): void;
  /** What this state exists to show: commands that must be on, and ones that must be grey. */
  proves: { on?: string[]; grey?: string[] };
}

type FramelingWindow = { frameling?: unknown };

/** The app as an idle viewer-less session has it: no desktop, no vote, no round, jar empty, nothing linked, audience off. */
export function quietWorld(): void {
  delete (window as FramelingWindow).frameling;
  setAudienceOn(false);
  audience.kill();
  closeVote();
  closeRound();
  jar.set({ slips: [], hand: null, saidFull: false });
  dareScreen.set({ held: [], banner: null, countdown: null });
  penEffect.set(null);
  doorStatus.set(closedStatus());
  overlayReady.set(false);
  twitchStatus.set(signedOutStatus());
  setPrefs({ showQuill: true });
  setChoice('guess.peek', undefined);
  setChoice('audience.view', undefined);
  SITUATIONS[0].set();
  // Things that live outside the store but belong to one drawing (a picked tile, a picked bone, a picked clip), and
  // the pixel text size, which is kept in storage.
  resetDrawingState();
  setPixelText({ scale: DEFAULT_PIXEL_TEXT.scale });
}

/** A plain desktop app with the audience side switched off: what a streamer has just after install. */
const withDesktop = (): void => {
  (window as FramelingWindow).frameling = { files: {}, door: {}, overlay: {}, twitch: {} };
};
/** Audience features on, the actions door and the overlay up. */
const live = (): void => {
  withDesktop();
  setChoice('audience.strictness', 'balanced');
  setAudienceOn(true);
  doorStatus.set({ running: true, port: 47213, address: 'http://127.0.0.1:47213', moved: false, problem: '' });
  overlayReady.set(true);
};

export const FEATURE_STATES: FeatureState[] = [
  {
    id: 'no-desktop',
    about: 'Frameling in a plain browser tab: no desktop app, so nothing that needs one can work.',
    desktop: false,
    set: () => {},
    proves: { on: ['streamdoor.settings', 'votes.start', 'promptjar.add'], grey: ['streamdoor.copyKey', 'twitch.connect', 'votes.end'] },
  },
  {
    id: 'desktop-just-installed',
    about: 'The desktop app, just installed: audience features off, nothing linked.',
    desktop: true,
    set: withDesktop,
    proves: { on: ['streamdoor.copyKey', 'twitch.connect', 'streamoverlay.settings'], grey: ['streamdoor.copyAddress', 'streamoverlay.test', 'twitch.disconnect'] },
  },
  {
    id: 'audience-live',
    about: 'Audience features on, the actions door and the overlay running.',
    desktop: true,
    set: live,
    proves: { on: ['streamdoor.copyAddress', 'streamoverlay.test', 'streamoverlay.copyAddress'], grey: ['votes.end', 'guess.end'] },
  },
  {
    id: 'twitch-waiting',
    about: 'Twitch sign-in is open, waiting for the streamer to approve it.',
    desktop: true,
    set: () => {
      live();
      twitchStatus.set({ ...signedOutStatus(), state: 'signing-in' });
    },
    proves: { on: ['twitch.cancel', 'twitch.disconnect'], grey: ['twitch.connect'] },
  },
  {
    id: 'twitch-connected',
    about: 'Signed in to Twitch and listening.',
    desktop: true,
    set: () => {
      live();
      twitchStatus.set({ ...signedOutStatus(), state: 'signed-in', login: 'someone', listening: 'listening' });
    },
    proves: { on: ['twitch.disconnect'], grey: ['twitch.connect', 'twitch.cancel'] },
  },
  {
    id: 'vote-going',
    about: 'A chat vote is open.',
    desktop: true,
    set: () => {
      live();
      startVote({ question: 'Which colour next?', options: ['Red', 'Blue', 'Green'], seconds: null });
    },
    proves: { on: ['votes.end', 'votes.close'], grey: ['votes.start'] },
  },
  {
    id: 'vote-result',
    about: 'The vote is over and its result is on screen.',
    desktop: true,
    set: () => {
      live();
      startVote({ question: 'Which colour next?', options: ['Red', 'Blue', 'Green'], seconds: null });
      endVote();
    },
    proves: { on: ['votes.close'], grey: ['votes.start', 'votes.end'] },
  },
  {
    id: 'round-going',
    about: 'A guessing round is open.',
    desktop: true,
    set: () => {
      live();
      startRound({ word: 'elephant', seconds: null, ending: 'first' });
    },
    proves: { on: ['guess.end', 'guess.close'], grey: ['guess.start'] },
  },
  {
    id: 'jar-has-prompts',
    about: 'The prompt jar holds a few prompts.',
    desktop: true,
    set: () => {
      live();
      addToJar('a sleepy fox');
      addToJar('a tiny castle');
    },
    proves: { on: ['promptjar.pull', 'promptjar.empty'], grey: ['promptjar.pass', 'promptjar.putBack'] },
  },
  {
    id: 'jar-prompt-in-hand',
    about: 'A prompt has been pulled out of the jar.',
    desktop: true,
    set: () => {
      live();
      addToJar('a sleepy fox');
      pullOne(() => 0);
    },
    proves: { on: ['promptjar.pass', 'promptjar.putBack'], grey: [] },
  },
  {
    id: 'dare-going',
    about: 'A dare is holding the view (a flipped canvas).',
    desktop: true,
    set: () => {
      live();
      dareScreen.set({ held: [{ resource: 'view', id: 'dare.flip', label: 'Flipped view', startedAt: 0, endsAt: 1 }], banner: null, countdown: null });
    },
    proves: { on: ['dares.stop'], grey: ['penmods.stop'] },
  },
  {
    id: 'pen-modifier-on',
    about: 'A pen modifier is on (a shaky hand).',
    desktop: true,
    set: () => {
      live();
      dareScreen.set({ held: [{ resource: 'pen', id: 'penmod.shaky', label: 'Shaky hand', startedAt: 0, endsAt: 1 }], banner: null, countdown: null });
    },
    proves: { on: ['penmods.stop'], grey: [] },
  },
  {
    id: 'round-peek-allowed',
    about: 'A guessing round is open and the streamer allows peeking at the word.',
    desktop: true,
    set: () => {
      live();
      setChoice('guess.peek', 'allow');
      // Peeking only works when your viewers cannot see this window.
      setChoice('audience.view', 'capture');
      startRound({ word: 'elephant', seconds: null, ending: 'first' });
    },
    proves: { on: ['guess.peek'], grey: ['guess.start'] },
  },
  {
    id: 'has-sound',
    about: 'The drawing has a sound clip on its audio track.',
    desktop: false,
    set: () => {
      const doc = vectorDoc();
      doc.audio = [{ id: 'audio-a', name: 'Beat', start: 0, data: new Uint8Array(4), mime: 'audio/wav', duration: 1 }];
      fresh(doc);
    },
    proves: { on: ['audio.startHere', 'audio.mute', 'audio.remove'], grey: [] },
  },
  {
    id: 'has-camera',
    about: 'The drawing has a camera layer.',
    desktop: false,
    set: () => {
      fresh(vectorDoc());
      addCamera();
    },
    proves: { on: ['camera.lookThrough', 'camera.reset', 'camera.pick'], grey: ['camera.add'] },
  },
  {
    id: 'text-selected',
    about: 'A piece of text is selected.',
    desktop: false,
    set: () => {
      const doc = vectorDoc();
      (Object.values(doc.drawings)[0] as unknown as { shapes: unknown[] }).shapes.push({ id: 'text-a', type: 'text', text: 'Hi', font: 'Nunito', size: 24, weight: 400, color: '#000000', align: 'left', opacity: 1, transform: { x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } } as never);
      fresh(doc);
      store().setUi({ selection: ['text-a'] });
    },
    proves: { on: ['text.toShapes', 'text.animate.fade'], grey: [] },
  },
  {
    id: 'quill-hidden',
    about: 'Quill is switched off in Preferences, so there is no hedgehog to fuss over.',
    desktop: false,
    set: () => setPrefs({ showQuill: false }),
    proves: { on: [], grey: ['quillPet.pat', 'quillPet.give'] },
  },
  {
    id: 'tile-picked',
    about: 'A tilemap layer is active and a tile is picked, with a solid shape and a terrain on it.',
    desktop: false,
    set: () => {
      fresh(vectorDoc());
      addTilemapLayer();
      const key = newTile();
      pickTile(key);
      solidTile(key);
      setTerrainOf(key, addTerrain('Grass'));
    },
    proves: { on: ['tiles.edit', 'tiles.flipX', 'tiles.rotate', 'tiles.nextTile', 'tiles.duplicate', 'tiles.clearShapes', 'tiles.autoEdges', 'tiles.export'], grey: ['tiles.done'] },
  },
  {
    id: 'tile-open',
    about: 'A tile is open on the canvas to be drawn.',
    desktop: false,
    set: () => {
      fresh(vectorDoc());
      addTilemapLayer();
      newTile({ open: true });
    },
    proves: { on: ['tiles.done', 'tiles.drawBox'], grey: ['tiles.clearShapes'] },
  },
  {
    id: 'rig-bent-layer',
    about: 'A drawing with a three-bone skeleton, a bone picked, and the art layer bending with the bones.',
    desktop: false,
    set: () => {
      fresh(vectorDoc());
      const art = store().get().ui.activeLayerId!;
      const rig = ensureRig();
      const a = addBone(rig, { x: 30, y: 150 }, { x: 30, y: 100 }, null)!;
      const b = addBone(rig, { x: 30, y: 100 }, { x: 30, y: 60 }, a)!;
      addBone(rig, { x: 30, y: 60 }, { x: 30, y: 30 }, b);
      store().setUi({ activeLayerId: art });
      bendLayer(art, currentRig()!.id);
      setRigUi({ selected: b });
    },
    proves: { on: ['rig.autoAttach', 'rig.paintWeights', 'rig.detachLayer', 'rig.deleteBranch', 'rig.pickParent', 'rig.pickChild'], grey: [] },
  },
  {
    id: 'clip-picked',
    about: 'A clip is picked in the Clips panel.',
    desktop: false,
    set: () => {
      const doc = vectorDoc();
      doc.clips.push({ id: 'clip-a', name: 'Walk', start: 0, end: 11 } as Doc['clips'][number]);
      fresh(doc);
      setTl({ clipId: 'clip-a' });
    },
    proves: { on: ['flow.fromAny'], grey: [] },
  },
  {
    id: 'particles-selected',
    about: 'A particle emitter is selected.',
    desktop: false,
    set: () => {
      const doc = vectorDoc();
      (Object.values(doc.drawings)[0] as unknown as { shapes: unknown[] }).shapes.push(newParticles('particles-a', 'sparkle', { x: 50, y: 50 }));
      fresh(doc);
      store().setUi({ selection: ['particles-a'] });
    },
    proves: { on: ['particles.shuffle'], grey: [] },
  },
  {
    id: 'pixel-text-big',
    about: 'New pixel text is set above its smallest size.',
    desktop: false,
    set: () => setPixelText({ scale: 3 }),
    proves: { on: ['text.pixelSmaller'], grey: [] },
  },
];

/**
 * Runs `fn` with the app in this feature state, then puts the quiet world back. `fn` must be synchronous: given an async
 * body this tidies up as soon as it first awaits, and everything after the await sees the quiet world (see `inState` in
 * commands-run.test.ts).
 */
export function inFeatureState<T>(state: FeatureState, fn: () => T): T {
  quietWorld();
  state.set();
  syncDynamicCommands();
  try {
    return fn();
  } finally {
    quietWorld();
    syncDynamicCommands();
  }
}

// ---------------------------------------------------------------- menu shape

export interface MenuList {
  /** "View > Audience features", the names a person clicks through. */
  path: string[];
  /** Entries a person reads in this list: commands and submenus, not separators or headings. */
  entries: number;
  /** Commands directly in it. */
  commands: string[];
}

/** Every list in every menu (the menu itself and each submenu, however deep), in the current state. */
export function menuLists(): MenuList[] {
  const out: MenuList[] = [];
  const walk = (items: MenuItem[], path: string[]): void => {
    out.push({
      path,
      entries: items.filter((i) => i.kind === 'command' || i.kind === 'submenu').length,
      commands: items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : [])),
    });
    for (const i of items) if (i.kind === 'submenu') walk(i.items, [...path, i.label]);
  };
  for (const m of resolveMenus()) walk(m.items, [m.menu.label]);
  return out;
}

/** Every list, with the most entries it has in any situation, and every command that is ever in it. */
export function menuListsWorstCase(): Map<string, { entries: number; commands: Set<string> }> {
  const worst = new Map<string, { entries: number; commands: Set<string> }>();
  for (const s of SITUATIONS) {
    s.set();
    syncDynamicCommands();
    for (const l of menuLists()) {
      const key = l.path.join(' > ');
      const w = worst.get(key) ?? { entries: 0, commands: new Set<string>() };
      w.entries = Math.max(w.entries, l.entries);
      for (const id of l.commands) w.commands.add(id);
      worst.set(key, w);
    }
  }
  SITUATIONS[0].set();
  return worst;
}

/**
 * The fewest clicks from the menu bar to each command, over every situation: "View" is one, "View > Zoom in" is two.
 * A command in several menus counts at its shallowest.
 */
export function menuDepths(): Map<string, { steps: number; path: string[] }> {
  const best = new Map<string, { steps: number; path: string[] }>();
  for (const s of SITUATIONS) {
    s.set();
    syncDynamicCommands();
    for (const l of menuLists()) for (const id of l.commands) if (!best.has(id) || l.path.length + 1 < best.get(id)!.steps) best.set(id, { steps: l.path.length + 1, path: l.path });
  }
  return best;
}

// ---------------------------------------------------------------- ways in

export type Way = 'palette' | 'menu' | 'rail' | 'keys' | 'screen';

/** The commands in every menu, in one situation. */
function menuIds(): Set<string> {
  const ids = new Set<string>();
  const walk = (list: MenuItem[]) => {
    for (const i of list) {
      if (i.kind === 'command') ids.add(i.command.id);
      else if (i.kind === 'submenu') walk(i.items);
    }
  };
  for (const m of resolveMenus()) walk(m.items);
  return ids;
}

/** Commands in the palette right now (what the palette lists, hidden and stale ones left out). */
export function paletteIds(): Set<string> {
  syncDynamicCommands();
  return new Set(paletteItems().filter((i) => i.kind === 'command' && !isStaleCommand(i.id)).map((i) => i.id));
}

/** The tools on the rail for each kind of layer, with greyed ones counted (the rail shows those where they sit). */
function railIds(): Set<string> {
  const out = new Set<string>();
  const tools = allTools() as RailTool[];
  for (const kind of [null, 'vector', 'pixel', 'tilemap', 'camera'] as (LayerKind | null)[]) for (const id of railFor(tools, kind, undefined, true).shown) out.add(`tools.${id}`);
  return out;
}

// Files whose mentions of a command id are a way in a person can see: the components (panels, bars, buttons, dialogs
// and context menus: a static read cannot tell those apart, so they all count as 'screen') and the few plain files that build menus and rails. Tutorials, help and the shortcut sets are not.
const SURFACE_TS = /(menu|rail|strip|bar|switcher|welcome|tips)[A-Za-z]*\.ts$/i;
const NOT_SURFACE = /(^|\/)(quests|plugins|beta|help|templates)(\/|$)|quest[A-Za-z-]*\.ts$|keymapSets|\.bodies\.ts$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const f = path.join(dir, name);
    if (statSync(f).isDirectory()) sourceFiles(f, out);
    else if (/\.tsx?$/.test(name)) out.push(f);
  }
  return out;
}

export interface Mention {
  /** The id, or the start of one ("view.panel." from a template like `view.panel.${id}`). */
  text: string;
  prefix: boolean;
  file: string;
}

let mentions: Mention[] | undefined;
/** Every command id named in a file that draws something a person can press, leaving out the places a command is defined. */
export function surfaceMentions(): Mention[] {
  if (mentions) return mentions;
  mentions = [];
  for (const abs of sourceFiles(path.join(root, 'src'))) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (NOT_SURFACE.test(rel)) continue;
    if (!(abs.endsWith('.tsx') || SURFACE_TS.test(rel))) continue;
    const text = readFileSync(abs, 'utf8');
    const re = /(['"`])([a-z][\w.-]*)(\$\{|\1)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!m[2].includes('.')) continue;
      // `id: 'x'` is a definition, not a way in.
      if (/\bid:\s*$/.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
      mentions.push({ text: m[2], prefix: m[3] === '${', file: rel });
    }
  }
  return mentions;
}

/** Every key a person can press for a command: its own default, or one a shortcut set gives it. */
function keyedIds(commands: Command[]): Set<string> {
  const ids = new Set(commands.filter((c) => (c.keys ?? []).length > 0).map((c) => c.id));
  for (const s of KEYMAP_SETS) for (const [id, keys] of Object.entries(s.keys)) if ((keys as string[]).length) ids.add(id);
  return ids;
}

export interface Reach {
  /** Every way in, by command id. */
  ways: Map<string, Way[]>;
  commands: Command[];
}

/**
 * Every way a person can reach each command: the palette, a menu (in any of the situations above), the tool rail, a
 * key, and something on screen (a panel, bar, button or context menu). Put the store in each situation to read the
 * menus, then leave it as it found it.
 */
export function reachability(): Reach {
  syncDynamicCommands();
  const commands = allCommands().filter((c) => !isStaleCommand(c.id));
  const ways = new Map<string, Set<Way>>(commands.map((c) => [c.id, new Set<Way>()]));
  const add = (id: string, w: Way) => ways.get(id)?.add(w);

  for (const id of paletteIds()) add(id, 'palette');
  for (const s of SITUATIONS) {
    s.set();
    syncDynamicCommands();
    for (const id of menuIds()) add(id, 'menu');
  }
  for (const id of railIds()) add(id, 'rail');
  for (const id of keyedIds(commands)) add(id, 'keys');
  for (const m of surfaceMentions()) {
    for (const c of commands) {
      const hit = m.prefix ? c.id.startsWith(m.text) : c.id === m.text;
      if (!hit) continue;
      add(c.id, 'screen');
    }
  }
  return { ways: new Map([...ways].map(([id, set]) => [id, [...set]])), commands };
}

export const panelsNow = () => allPanels();
