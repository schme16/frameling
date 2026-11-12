// Quill's little moments in the pixel flow: a warm line at the right time, mostly once. Each is a toast with a tiny
// Quill, the words live in src/ui/mascot/lines.json. They stay quiet when Quill is turned off in Preferences.
import type { Id } from '../core/format';
import { line } from '../ui/mascot/lines';
import { getPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import type { QuillAnim } from '../ui/mascot/timing';

const KEY = 'frameling.pixelMoments';
const seen = new Set<string>(load());
const thisSession = new Set<string>();

function load(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function remember(id: string): void {
  seen.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // not remembered this time
  }
}

export type Once = 'ever' | 'session' | { doc: Id };

/**
 * Says a line (`say` returns it, from lines.json), at most once for how long `once` says. Returns true when it was said. With Quill off in Preferences,
 * nothing is said and nothing is counted, so turning him back on brings the moments back.
 */
export function moment(id: string, say: () => string, once: Once = 'ever', anim: QuillAnim = 'cheer'): boolean {
  if (!getPrefs().showQuill) return false;
  const key = typeof once === 'object' ? `${id}@${once.doc}` : id;
  if (once === 'ever' ? seen.has(key) : thisSession.has(key)) return false;
  if (once === 'ever') remember(key);
  else thisSession.add(key);
  toast(say(), { kind: 'info', quill: anim, duration: 6000 });
  return true;
}

/** For tests. */
export function _resetMoments(): void {
  seen.clear();
  thisSession.clear();
}

const ENGINES: Record<string, string> = { godot: 'Godot', unity: 'Unity', phaser: 'Phaser', pixi: 'PixiJS' };

/** After a sprite sheet is exported: the engine's name when it is one Quill knows, and a nod when there are lots of frames. */
export function sheetExported(engine: string, frames: number): void {
  moment('sheet.baked', () => line('pixel.sheet.baked', { engine: ENGINES[engine] ?? 'your engine' }), 'session');
  if (frames >= 100) moment('sheet.many', () => line('pixel.sheet.many'), 'session', 'wave');
}
