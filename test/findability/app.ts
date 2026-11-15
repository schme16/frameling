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
import { editSymbol, makeSymbolFromSelection } from '../../src/symbols/ops';
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
  { id: 'blank', about: 'A new, empty drawing, which is what Frameling opens to (the welcome sheet sits on top).', set: () => fresh(newDoc()) },
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
