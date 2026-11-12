// Help search: titles and headings count most, then keywords, then the words in the text. Typos are forgiven.
import { allHelp, helpBody, type HelpTopic } from '../../core/registry';
import { scoreWord, wordsOf } from '../match';
import { plain, slug } from './markdown';

export interface HelpHit {
  topic: HelpTopic;
  /** The heading inside the topic that matched, if it was a section and not the opening. */
  anchor?: string;
  heading?: string;
  snippet: string;
  score: number;
}

interface Entry {
  topic: HelpTopic;
  anchor?: string;
  heading?: string;
  text: string;
  headWords: string[];
  bodyWords: string[];
  titleLower: string;
  /** The topic's keywords, on its opening entry only. */
  keywords: string[];
}

// A few indexes at once: the topics on show, and the ones of features that are turned off (searched to offer turning them on).
const indexes = new Map<string, Entry[]>();

function build(topics: HelpTopic[]): Entry[] {
  const out: Entry[] = [];
  for (const t of topics) {
    // One entry for the opening of the topic and one for each heading's section.
    const parts = helpBody(t).split(/\n(?=#{1,4}\s)/);
    parts.forEach((part, i) => {
      const m = /^#{1,4}\s+(.*)\n?/.exec(part);
      const heading = i > 0 && m ? m[1] : undefined;
      const text = plain(m && i > 0 ? part.slice(m[0].length) : part);
      const head = `${t.title} ${heading ?? ''} ${i === 0 ? `${t.summary} ${(t.keywords ?? []).join(' ')}` : ''}`;
      out.push({ topic: t, anchor: heading ? slug(heading) : undefined, heading, text, headWords: wordsOf(head), bodyWords: wordsOf(text), titleLower: t.title.toLowerCase().replace(/^the /, ''), keywords: i === 0 ? (t.keywords ?? []).map((k) => k.toLowerCase()) : [] });
    });
  }
  return out;
}

/** Forget the index (when topics change). Done automatically when the number of topics changes. */
export function resetHelpIndex(): void {
  indexes.clear();
}

/** Ranked matches, best first, at most three from any one topic. */
export function searchHelp(query: string, limit = 12, topics: HelpTopic[] = allHelp()): HelpHit[] {
  const words = wordsOf(query);
  if (!words.length) return [];
  const key = topics.map((t) => t.id + helpBody(t).length).join('|');
  let index = indexes.get(key);
  if (!index) {
    if (indexes.size >= 4) indexes.delete(indexes.keys().next().value!);
    index = build(topics);
    indexes.set(key, index);
  }
  const hits: HelpHit[] = [];
  for (const e of index) {
    let score = 0;
    let all = true;
    for (const w of words) {
      const head = scoreWord(w, e.headWords);
      const body = scoreWord(w, e.bodyWords) * 0.4;
      if (head <= 0 && body <= 0) {
        all = false;
        break;
      }
      score += Math.max(head, body);
    }
    if (!all) continue;
    score /= words.length;
    if (words.length === 1 && e.titleLower.startsWith(words[0])) score += 20;
    // Typed exactly what a keyword says ("save", "lost my work"): that's the topic people mean.
    else if (e.keywords.includes(query.trim().toLowerCase())) score += 15;
    if (!e.anchor) score += 3;
    hits.push({ topic: e.topic, anchor: e.anchor, heading: e.heading, snippet: snippet(e.text, words[0]), score });
  }
  hits.sort((a, b) => b.score - a.score);
  const per = new Map<string, number>();
  return hits
    .filter((h) => {
      const n = per.get(h.topic.id) ?? 0;
      per.set(h.topic.id, n + 1);
      return n < 3;
    })
    .slice(0, limit);
}

function snippet(text: string, word: string): string {
  const i = text.toLowerCase().indexOf(word);
  if (i < 0) return text.slice(0, 140);
  const start = Math.max(0, i - 50);
  return (start ? '…' : '') + text.slice(start, start + 150) + (start + 150 < text.length ? '…' : '');
}

/** Contents order: the way a beginner meets things, from the first drawing to sharing it. Anything else after, alphabetically. */
export const SECTION_ORDER = ['Getting started', 'Basics', 'Drawing', 'Animating', 'Pixel art', 'Symbols and motion', 'Rigging', 'Effects', 'Sound', 'Files', 'Exporting', 'Workspace', 'Settings', 'Plugins'];

export function sections(topics: HelpTopic[] = allHelp()): { name: string; topics: HelpTopic[] }[] {
  const map = new Map<string, HelpTopic[]>();
  for (const t of topics) {
    const list = map.get(t.section);
    if (list) list.push(t);
    else map.set(t.section, [t]);
  }
  const rank = (n: string) => {
    const i = SECTION_ORDER.indexOf(n);
    return i < 0 ? SECTION_ORDER.length : i;
  };
  return [...map.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, list]) => ({ name, topics: list.sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title)) }));
}
