// Quill welcoming somebody new: a follower, a subscriber, a cheer, a raid. The pure part: what an arrival is, how a crowd
// of them is gathered into a turn, what Quill says for each, and the short in-memory lists that stop him greeting the
// same person twice or a person you said no to. Nothing here shows anything, keeps anything on disk, or reads a name
// without it having been through `cleanDisplayName`. The flow that shows it is welcomeFlow.ts.
import { cleanDisplayName } from '../audience/cleanText';
import { lines } from '../ui/mascot/lines';
import type { Script } from '../ui/mascot/timing';

export type WelcomeKind = 'follow' | 'sub' | 'cheer' | 'raid';

/** One person (or one raid) arriving. `name` is already clean; `amount` is bits for a cheer and people for a raid. */
export interface Arrival {
  kind: WelcomeKind;
  name?: string;
  amount?: number;
  resub?: boolean;
}

/** The audience actions a Twitch link (or a stream tool) can point at. */
export const WELCOME_ACTIONS: { id: string; label: string; kind: WelcomeKind }[] = [
  { id: 'quill.welcome.follow', label: 'Quill welcomes a new follower', kind: 'follow' },
  { id: 'quill.welcome.sub', label: 'Quill thanks a new subscriber', kind: 'sub' },
  { id: 'quill.welcome.cheer', label: 'Quill thanks a cheer', kind: 'cheer' },
  { id: 'quill.welcome.raid', label: 'Quill welcomes a raid', kind: 'raid' },
];

/** The name a pretend welcome uses (the Try commands, Try it on a link). Made up here, so nobody's name is ever used to try it. */
export const SAMPLE_NAME = 'Sam';

export const isWelcomeAction = (id: string): boolean => WELCOME_ACTIONS.some((a) => a.id === id);

/** The most any one number may say: bits and raiders are cut here, so a made-up one cannot be silly. */
export const AMOUNT_MAX = 10_000_000;

/**
 * What an arrival is, from whatever came in with the action: nothing at all, or an object with a name and a number.
 * It never refuses (a welcome without a name is still a welcome). The name is dropped unless `names` is true, and a
 * name that cleans down to nothing is dropped too, so Quill simply welcomes without one. Pure.
 */
export function parseArrival(kind: WelcomeKind, raw: unknown, names: boolean): Arrival {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const name = names ? cleanDisplayName(o.name) : null;
  const n = typeof o.amount === 'number' && Number.isFinite(o.amount) ? Math.min(AMOUNT_MAX, Math.max(0, Math.floor(o.amount))) : 0;
  return { kind, ...(name ? { name } : {}), ...(n ? { amount: n } : {}), ...(o.resub === true ? { resub: true } : {}) };
}

/** A short list of names kept in memory only, newest last, so it can be asked about and never grows. */
export interface Names {
  list: string[];
  cap: number;
}
export const newNames = (cap: number): Names => ({ list: [], cap });
const keyOf = (name: string): string => name.normalize('NFC').toLocaleLowerCase();
export const hasName = (n: Names, name: string): boolean => n.list.includes(keyOf(name));
export function addName(n: Names, name: string): void {
  const k = keyOf(name);
  n.list = [...n.list.filter((x) => x !== k), k].slice(-n.cap);
}

/** How many names are kept to stop repeats (people already welcomed) and to leave out (people you said no to). */
export const RECENT_CAP = 40;
export const DECLINED_CAP = 40;

/** Everyone waiting for Quill's next turn, as counts. Names kept are few: a crowd is a number, not a list. */
interface Group {
  count: number;
  names: string[];
  amount: number;
  resubs: number;
}
export interface Pile {
  follow: Group;
  sub: Group;
  cheer: Group;
  raids: Arrival[];
}

/** The most names held for one group, and the most raids held, whatever arrives. */
export const MAX_NAMES = 4;
export const MAX_RAIDS = 3;

const empty = (): Group => ({ count: 0, names: [], amount: 0, resubs: 0 });
export const newPile = (): Pile => ({ follow: empty(), sub: empty(), cheer: empty(), raids: [] });
export const pileSize = (p: Pile): number => p.follow.count + p.sub.count + p.cheer.count + p.raids.length;

/**
 * Adds one arrival. A follower or subscriber already welcomed this session is skipped altogether (a follow, unfollow,
 * follow again is not three welcomes; somebody who followed may still subscribe). A name you said no to is counted but its name is left out. Past the held names
 * or raids it is only counted, so nothing grows with a crowd. Returns whether it was taken.
 */
export type Recent = Record<'follow' | 'sub', Names>;
export const newRecent = (): Recent => ({ follow: newNames(RECENT_CAP), sub: newNames(RECENT_CAP) });

export function addArrival(p: Pile, a: Arrival, recent: Recent, declined: Names): boolean {
  let name = a.name;
  if (name && (a.kind === 'follow' || a.kind === 'sub') && hasName(recent[a.kind], name)) return false;
  if (name && hasName(declined, name)) name = undefined;
  if (a.kind === 'raid') {
    if (p.raids.length >= MAX_RAIDS) return false;
    p.raids.push({ ...a, ...(name ? { name } : { name: undefined }) });
    return true;
  }
  const g = p[a.kind];
  g.count++;
  g.amount += a.amount ?? 0;
  if (a.resub) g.resubs++;
  if (name && g.names.length < MAX_NAMES && !g.names.includes(name)) g.names.push(name);
  return true;
}

/** What Quill does in one go: one kind of arrival, everyone of that kind who was waiting. */
export interface Turn {
  kind: WelcomeKind;
  /** How many people (a raid counts as one turn; its size is `amount`). */
  count: number;
  /** The one name he would say, if there is one. */
  name?: string;
  /** Everyone else in the turn, said as a number. */
  others: number;
  /** Bits for cheers, people for a raid. */
  amount: number;
  /** Everyone in the turn is back for another go (resubscribers). */
  resub: boolean;
}

/** Quill's priority: a raid before a cheer before a subscriber before a follower. */
export const ORDER: WelcomeKind[] = ['raid', 'cheer', 'sub', 'follow'];

/** The next turn, taken out of the pile, or null when nobody is waiting. */
export function takeTurn(p: Pile): Turn | null {
  for (const kind of ORDER) {
    if (kind === 'raid') {
      const r = p.raids.shift();
      if (r) return { kind, count: 1, ...(r.name ? { name: r.name } : {}), others: 0, amount: r.amount ?? 0, resub: false };
      continue;
    }
    const g = p[kind];
    if (!g.count) continue;
    // Several cheers are said as a total, with no name: whose cheer it was would be a guess.
    const name = kind === 'cheer' && g.count > 1 ? undefined : g.names[0];
    const turn: Turn = { kind, count: g.count, ...(name ? { name } : {}), others: name ? g.count - 1 : 0, amount: g.amount, resub: g.resubs === g.count };
    p[kind] = empty();
    return turn;
  }
  return null;
}

/** What a turn looks like on screen: what Quill does, which clip the overlay plays, how long he stays. */
export interface Look {
  anim: Script;
  moment: 'cheer' | 'hop' | 'eat' | 'nuzzle' | 'wave';
  ms: number;
}

const LOOKS: Record<WelcomeKind, Look> = {
  follow: { anim: 'wave', moment: 'wave', ms: 3800 },
  sub: { anim: [{ anim: 'nuzzle', hold: 2600 }], moment: 'nuzzle', ms: 4200 },
  cheer: { anim: 'cheer', moment: 'cheer', ms: 4200 },
  // A raid is the biggest hello there is: a wave that turns into a cheer.
  raid: { anim: [{ anim: 'wave' }, { anim: 'cheer' }], moment: 'cheer', ms: 6000 },
};
export const lookFor = (kind: WelcomeKind): Look => LOOKS[kind];

/** Which of a set, from a number between 0 and 1. */
export const pick = (xs: readonly string[], rand: number): string => xs[Math.min(xs.length - 1, Math.max(0, Math.floor(rand * xs.length)))];

/**
 * The words for a turn. `named` says whether the name may be said (the streamer said yes, or it is not being asked);
 * without it the same turn is welcomed with no name, never with nothing.
 */
export function welcomeWords(t: Turn, named: boolean, rand: () => number = Math.random): string {
  const name = named ? t.name : undefined;
  const many = t.count > 1;
  const vars = { name: name ?? '', others: t.others, count: t.count, bits: t.amount, raiders: Math.max(1, t.amount) };
  let set: string[];
  switch (t.kind) {
    case 'raid':
      set = name ? lines('stream.welcome.raid.named', vars) : lines('stream.welcome.raid', vars);
      break;
    case 'cheer':
      set = name && !many ? lines('stream.welcome.cheer.named', vars) : many ? lines('stream.welcome.cheer.many', vars) : lines('stream.welcome.cheer', vars);
      break;
    case 'sub':
      set = name ? (many ? lines('stream.welcome.sub.crowd.named', vars) : t.resub ? lines('stream.welcome.resub.named', vars) : lines('stream.welcome.sub.named', vars)) : many ? lines('stream.welcome.sub.crowd', vars) : lines('stream.welcome.sub', vars);
      break;
    default:
      set = name ? (many ? lines('stream.welcome.follow.crowd.named', vars) : lines('stream.welcome.follow.named', vars)) : many ? lines('stream.welcome.follow.crowd', vars) : lines('stream.welcome.follow', vars);
  }
  return pick(set, rand());
}

/** The question before a name is said, built from his lines. The name is in it, so it is shown covered until read. */
export function askWords(t: Turn): string {
  const vars = { name: t.name ?? '', others: t.others };
  return (t.others > 0 ? lines('stream.welcome.ask.more', vars) : lines('stream.welcome.ask', vars))[0];
}
