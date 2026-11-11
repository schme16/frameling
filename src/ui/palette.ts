// What the command palette searches and how it ranks. The component (CommandPalette.tsx) is only the looks.
import { allCommands, allHelp, type Command, type HelpTopic } from '../core/registry';
import { store } from '../core/store';
import { scoreWord, wordsOf } from './match';
import { readRaw, writeJson } from './mini';
import { toast } from './toast';

export type PaletteItem =
  | { kind: 'command'; id: string; label: string; category: string; description: string; command: Command }
  | { kind: 'help'; id: string; label: string; category: string; description: string; topic: HelpTopic };

export interface PaletteHit {
  item: PaletteItem;
  score: number;
}

export function paletteItems(commands: Command[] = allCommands(), topics: HelpTopic[] = allHelp()): PaletteItem[] {
  const items: PaletteItem[] = commands.map((c) => ({ kind: 'command', id: c.id, label: c.label, category: c.category, description: c.description ?? '', command: c }));
  for (const t of topics) items.push({ kind: 'help', id: t.id, label: t.title, category: 'Help', description: t.summary, topic: t });
  return items;
}

function itemText(it: PaletteItem): { label: string[]; extra: string[] } {
  const keywords = it.kind === 'command' ? it.command.keywords ?? [] : it.topic.keywords ?? [];
  return {
    label: wordsOf(it.label),
    extra: wordsOf(`${it.category} ${it.description} ${keywords.join(' ')} ${it.kind === 'command' ? it.id.replace(/\./g, ' ') : ''}`),
  };
}

/** Scores one item for a query: every word has to match somewhere, and words in the label count most. 0 means no match. */
export function scoreItem(query: string, it: PaletteItem): number {
  const qs = wordsOf(query);
  if (!qs.length) return 0;
  const { label, extra } = itemText(it);
  let total = 0;
  for (const q of qs) {
    const inLabel = scoreWord(q, label);
    const inExtra = scoreWord(q, extra) * 0.5;
    const s = Math.max(inLabel, inExtra);
    if (s <= 0) return 0;
    total += s;
  }
  const labelLower = it.label.toLowerCase();
  // Things whose whole name starts with what was typed come first, then commands ahead of help.
  if (labelLower.startsWith(query.trim().toLowerCase())) total += 40;
  if (it.kind === 'command') total += 5;
  return total / qs.length + (labelLower.length ? Math.min(10, 40 / labelLower.length) : 0);
}

/** Ranked results for a query. With no query: recently used commands first, then everything by category. */
export function rankPalette(query: string, items: PaletteItem[] = paletteItems(), recent: string[] = recentCommands(), limit = 60): PaletteHit[] {
  if (!query.trim()) {
    const byId = new Map(items.map((i) => [`${i.kind}:${i.id}`, i]));
    const out: PaletteHit[] = [];
    const seen = new Set<string>();
    recent.forEach((id, n) => {
      const it = byId.get(`command:${id}`);
      if (it) {
        out.push({ item: it, score: 1000 - n });
        seen.add(`command:${id}`);
      }
    });
    const rest = items.filter((i) => i.kind === 'command' && !seen.has(`command:${i.id}`)).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
    for (const it of rest) out.push({ item: it, score: 0 });
    return out.slice(0, limit);
  }
  const hits: PaletteHit[] = [];
  for (const it of items) {
    const score = scoreItem(query, it);
    if (score > 0) hits.push({ item: it, score });
  }
  hits.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
  return hits.slice(0, limit);
}

/** Is this command usable right now? */
export function commandEnabled(c: Command): boolean {
  try {
    return c.enabled ? c.enabled(store().get()) : true;
  } catch {
    return false;
  }
}

const RECENT_KEY = 'frameling.recentCommands';

export function recentCommands(): string[] {
  return readRaw<string[]>(RECENT_KEY, []).slice(0, 5);
}

export function noteRecentCommand(id: string): void {
  writeJson(RECENT_KEY, [id, ...recentCommands().filter((x) => x !== id)].slice(0, 8));
}

/** Runs a command the way a click would: skips disabled ones, and says so (gently) if it fails. */
/** What to say when someone picks a command that can't run right now, instead of nothing happening. */
export function notNowMessage(c: Pick<Command, 'label' | 'help'>): string {
  return `"${c.label}" can't be used right now.${c.help ? ' Its help page says what it needs.' : ' Try selecting something or moving to a frame with a drawing first.'}`;
}

export function runCommand(c: Command): boolean {
  if (!commandEnabled(c)) return false;
  try {
    const r = c.run();
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch((err) => toast(`That didn't work: ${err instanceof Error ? err.message : String(err)}`, { kind: 'error' }));
  } catch (err) {
    toast(`That didn't work: ${err instanceof Error ? err.message : String(err)}`, { kind: 'error' });
    return false;
  }
  return true;
}
