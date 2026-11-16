// The streamer's links from Twitch events to audience actions, and the pure rules for using them. A link holds no
// viewer data: only which kind of event, an optional filter (one reward, a number of bits or of raiders), which action
// and any words to send with it. Nothing here runs an action: the gate does, through the link in ./link.ts.
import { isKind, type TwitchEvent, type TwitchKind } from '../shared/twitch';
import { isWelcomeAction, SAMPLE_NAME } from '../quillreacts/welcome';

export interface TwitchRule {
  id: string;
  event: TwitchKind;
  /** An audience action id from the gate. */
  action: string;
  /** For a redemption: the one reward it is for. Left out, any reward. */
  rewardId?: string;
  /** The reward's name when it was picked, only so the row can say it. */
  rewardTitle?: string;
  /** For cheers (bits) and raids (people): the least that counts. Left out, any. */
  min?: number;
  /** Words sent along to an action that takes them (a message, a sign, a prompt). */
  text?: string;
  /** For a redemption that asks the viewer for words: send those instead. They are cleaned by the action, shown at most, and never kept by Frameling. */
  useViewerText?: boolean;
  on: boolean;
}

export const MAX_RULES = 40;
const TEXT_MAX = 120;

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;

/** Reads rules from storage, keeping only what is well formed. Anything else (an old or hand-edited file) is dropped. */
export function cleanRules(raw: unknown): TwitchRule[] {
  if (!Array.isArray(raw)) return [];
  const out: TwitchRule[] = [];
  const ids = new Set<string>();
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || !isKind(r.event) || typeof r.action !== 'string' || !ID_RE.test(r.action)) continue;
    let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : '';
    if (!id || ids.has(id)) id = `r${out.length}-${Math.random().toString(36).slice(2, 7)}`;
    ids.add(id);
    const rule: TwitchRule = { id, event: r.event, action: r.action, on: r.on !== false };
    if (r.event === 'redemption' && typeof r.rewardId === 'string' && r.rewardId) {
      rule.rewardId = r.rewardId.slice(0, 80);
      if (typeof r.rewardTitle === 'string') rule.rewardTitle = r.rewardTitle.slice(0, 100);
    }
    if ((r.event === 'cheer' || r.event === 'raid') && typeof r.min === 'number' && Number.isFinite(r.min) && r.min > 0) rule.min = Math.min(1_000_000, Math.floor(r.min));
    if (typeof r.text === 'string' && r.text.trim()) rule.text = r.text.slice(0, TEXT_MAX);
    if (r.event === 'redemption' && r.useViewerText === true) rule.useViewerText = true;
    out.push(rule);
    if (out.length >= MAX_RULES) break;
  }
  return out;
}

/** The rules an event sets off, in the order the streamer listed them. */
export function matchRules(rules: TwitchRule[], e: TwitchEvent): TwitchRule[] {
  return rules.filter((r) => {
    if (!r.on || r.event !== e.kind) return false;
    switch (e.kind) {
      case 'redemption':
        return !r.rewardId || r.rewardId === e.rewardId;
      case 'cheer':
        return e.bits >= (r.min ?? 1);
      case 'raid':
        return e.viewers >= (r.min ?? 1);
      default:
        return true;
    }
  });
}

/** What goes to the action as its payload: the viewer's words when the rule says so (and there are some), else the streamer's words, else nothing. */
export function payloadFor(rule: TwitchRule, e: TwitchEvent): unknown {
  // A welcome gets the event's size and, when one was asked for, the display name. It is cleaned by the action (never here).
  if (isWelcomeAction(rule.action)) return welcomePayload(e);
  if (rule.useViewerText && e.kind === 'redemption' && e.text) return e.text;
  return rule.text || undefined;
}

/** What a Quill welcome is told about an event: how big it is, whether it is a return, and the name if there is one. */
export function welcomePayload(e: TwitchEvent): { name?: string; amount?: number; resub?: boolean } {
  switch (e.kind) {
    case 'cheer':
      return { amount: e.bits, ...(e.name ? { name: e.name } : {}) };
    case 'raid':
      return { amount: e.viewers, ...(e.name ? { name: e.name } : {}) };
    case 'sub':
      return { ...(e.resub ? { resub: true } : {}), ...(e.name ? { name: e.name } : {}) };
    case 'follow':
      return e.name ? { name: e.name } : {};
    default:
      return {};
  }
}

/** A pretend event of a rule's kind, for the Try it button. Carries no one's words but the rule's own, and a made-up name. */
export function sampleEvent(rule: TwitchRule): TwitchEvent {
  switch (rule.event) {
    case 'redemption':
      return { kind: 'redemption', rewardId: rule.rewardId ?? 'sample', rewardTitle: rule.rewardTitle ?? 'A reward', ...(rule.text ? { text: rule.text } : {}) };
    case 'cheer':
      return { kind: 'cheer', bits: Math.max(1, rule.min ?? 100), name: SAMPLE_NAME };
    case 'raid':
      return { kind: 'raid', viewers: Math.max(1, rule.min ?? 5), name: SAMPLE_NAME };
    case 'sub':
      return { kind: 'sub', resub: false, name: SAMPLE_NAME };
    default:
      return { kind: 'follow', name: SAMPLE_NAME };
  }
}

/**
 * The links a new connection starts with: small, view-only reactions from Quill, for the actions that exist. A follow, sub,
 * cheer or raid is a welcome (he says the name unless you ask him to check first); the rest are the plain reactions, which is also what a
 * build without welcomes falls back to.
 */
export function starterRules(have: (id: string) => boolean): TwitchRule[] {
  const wish: [TwitchKind, string[]][] = [
    ['redemption', ['quill.cheer']],
    ['raid', ['quill.welcome.raid', 'quill.wave']],
    ['follow', ['quill.welcome.follow', 'quill.hop']],
    ['sub', ['quill.welcome.sub', 'quill.nuzzle']],
    ['cheer', ['quill.welcome.cheer', 'quill.snack']],
  ];
  return wish
    .map(([event, ids]) => [event, ids.find(have)] as const)
    .filter((w): w is readonly [TwitchKind, string] => !!w[1])
    .map(([event, action], i) => ({ id: `starter-${i}`, event, action, on: true }));
}

let counter = 0;
/** A new, empty link for a kind, pointing at nothing yet. */
export const newRule = (event: TwitchKind, action: string): TwitchRule => ({ id: `r-${Date.now().toString(36)}-${counter++}`, event, action, on: true });
