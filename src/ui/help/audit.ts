// Checks the in-app help against the rest of the app: commands with no topic, topics with no picture, pictures nobody
// uses, links to nowhere, topics that ramble, and shortcuts a topic names that no command has any more.
// Pure: the caller hands in the registries and the list of files in public/help/, so it runs in a test.
import type { Command, HelpTopic, PanelDef, Tool } from '../../core/registry';
import { normaliseCombo } from '../keys';
import { isVideo, posterFor } from './media';
import { slug } from './markdown';

export interface HelpAuditInput {
  topics: HelpTopic[];
  commands: Command[];
  panels?: PanelDef[];
  tools?: Tool[];
  /** File names in public/help/. */
  files: string[];
  /** Words in a topic body before it counts as long. */
  maxWords?: number;
  /** Shortcuts topics may name that aren't commands (held keys inside a tool, keys in a dialog...). */
  extraKeys?: string[];
}

export interface HelpAudit {
  /** Command ids with no `help` at all. */
  commandsWithoutHelp: string[];
  /** Topic ids with no `media`. */
  topicsWithoutMedia: string[];
  /** `topic -> file` for media named but not in public/help/. */
  missingMedia: string[];
  /** Files in public/help/ no topic uses. */
  orphanFiles: string[];
  /** `topic (n words)` for bodies over the limit. */
  longTopics: string[];
  /** `topic: Ctrl+X` for shortcuts named in a body that no command or tool has. */
  shortcutDrift: string[];
  /** `where -> help:target` for links to a topic or heading that doesn't exist. */
  brokenLinks: string[];
}

const wordCount = (md: string) => md.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;

// Ctrl+Shift+Z, Alt+2, Shift+comma. A gesture word after the plus (Shift+drag, Alt+click) isn't a key.
const COMBO = /\b((?:(?:Ctrl|Cmd|Mod|Alt|Option|Shift)\+)+(?:F\d{1,2}\b|[A-Za-z]+\b|[0-9]\b|[,./;'[\]\\=`-]|\+))/g;
const KEY_WORDS = new Set(['space', 'enter', 'tab', 'esc', 'escape', 'delete', 'del', 'backspace', 'home', 'end', 'pageup', 'pagedown', 'plus', 'comma', 'up', 'down', 'left', 'right', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
// A lone key someone is told to press: "press **G**", "key `b`", "(B)" after a tool name, "**F9**".
const LONE = /(?:[Pp]ress (?:\*\*|`)([A-Z0-9]|F\d{1,2})(?:\*\*|`)|key `([a-z0-9])`|\*\*(F\d{1,2})\*\*|\(([A-Z])\)(?=[\s,.:;)]|$))/g;

/** The shortcuts named in a Markdown body, as written. */
export function shortcutsIn(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(COMBO)) {
    const key = m[1].slice(m[1].lastIndexOf('+', m[1].length - 2) + 1);
    if (/^[a-z]{2,}$/i.test(key) && !/^F\d/.test(key) && !KEY_WORDS.has(key.toLowerCase())) continue;
    out.push(m[1]);
  }
  for (const m of md.matchAll(LONE)) out.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return out;
}

/** The `help:` links in a body, as `topic` or `topic#anchor`. */
export function helpLinksIn(md: string): string[] {
  return [...md.matchAll(/\]\(help:([^)\s]+)\)/g)].map((m) => m[1]);
}

const headingSlugs = (md: string) => new Set([...md.matchAll(/^#{1,4}\s+(.*)$/gm)].map((m) => slug(m[1])));

export function auditHelp(input: HelpAuditInput): HelpAudit {
  const { topics, commands, panels = [], tools = [], files } = input;
  const maxWords = input.maxWords ?? 400;
  const byId = new Map(topics.map((t) => [t.id, t]));
  const slugs = new Map(topics.map((t) => [t.id, headingSlugs(t.body)]));

  const brokenLinks: string[] = [];
  const checkLink = (where: string, target: string) => {
    const [id, anchor] = target.split('#');
    const t = byId.get(id);
    if (!t || (anchor && !slugs.get(id)!.has(anchor))) brokenLinks.push(`${where} -> help:${target}`);
  };
  for (const t of topics) for (const l of helpLinksIn(t.body)) checkLink(t.id, l);
  for (const c of commands) if (c.help) checkLink(`command ${c.id}`, c.help);
  for (const p of panels) if (p.help) checkLink(`panel ${p.id}`, p.help);
  for (const tool of tools) if (tool.help) checkLink(`tool ${tool.id}`, tool.help);

  const used = new Set<string>();
  const missingMedia: string[] = [];
  const have = new Set(files);
  for (const t of topics) {
    if (!t.media) continue;
    const need = isVideo(t.media) ? [t.media, posterFor(t.media)] : [t.media];
    for (const f of need) {
      used.add(f);
      if (!have.has(f)) missingMedia.push(`${t.id} -> ${f}`);
    }
  }

  const known = new Set<string>();
  for (const c of commands) for (const k of c.keys ?? []) known.add(normaliseCombo(k));
  for (const tool of tools) if (tool.key) known.add(normaliseCombo(tool.key));
  for (const k of input.extraKeys ?? []) known.add(normaliseCombo(k));
  const shortcutDrift: string[] = [];
  for (const t of topics) {
    for (const k of new Set(shortcutsIn(t.body))) {
      const n = normaliseCombo(k.replace(/\bOption\b/, 'Alt'));
      if (n && !known.has(n)) shortcutDrift.push(`${t.id}: ${k}`);
    }
  }

  return {
    commandsWithoutHelp: commands.filter((c) => !c.help).map((c) => c.id).sort(),
    topicsWithoutMedia: topics.filter((t) => !t.media).map((t) => t.id).sort(),
    missingMedia,
    orphanFiles: files.filter((f) => !f.startsWith('.') && !used.has(f)).sort(),
    longTopics: topics.map((t) => [t.id, wordCount(t.body)] as const).filter(([, n]) => n > maxWords).map(([id, n]) => `${id} (${n} words)`),
    shortcutDrift,
    brokenLinks,
  };
}

/** The audit as plain text, one heading per check. */
export function formatAudit(a: HelpAudit): string {
  const parts: string[] = [];
  for (const [name, list] of Object.entries(a) as [string, string[]][]) {
    parts.push(`${name}: ${list.length}`);
    for (const x of list) parts.push(`  ${x}`);
  }
  return parts.join('\n');
}
