// Connecting to Twitch, the parts the desktop side (src/main/twitch*.ts) and the page (src/twitch) both need: which
// events there are, which permission each one needs and what it is for, the shapes passed between them, and how a raw
// Twitch notice becomes a small event with nobody's name in it. No Electron, no browser, so it is tested alone.

/** The kinds of thing Twitch can tell us about that a streamer may link to an action. */
export type TwitchKind = 'redemption' | 'cheer' | 'follow' | 'sub' | 'raid';

export interface TwitchKindInfo {
  kind: TwitchKind;
  /** Plain words, shown on the tick list and the mapping screen. */
  label: string;
  /** What the permission is for, in plain words. Empty when none is needed. */
  why: string;
  /** The Twitch permission (scope) it needs, or '' for none. */
  scope: string;
  /** The Twitch subscriptions that carry it. `condition` builds the filter from the streamer's own user id. */
  subs: { type: string; version: string; condition(userId: string): Record<string, string> }[];
}

export const KIND_INFO: Record<TwitchKind, TwitchKindInfo> = {
  redemption: {
    kind: 'redemption',
    label: 'A channel point reward is redeemed',
    why: 'Lets Frameling hear when a viewer spends channel points on one of your rewards. It also lets Frameling read the names of your rewards, so you can pick one. It cannot change or refund them.',
    scope: 'channel:read:redemptions',
    subs: [{ type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: (id) => ({ broadcaster_user_id: id }) }],
  },
  cheer: {
    kind: 'cheer',
    label: 'Someone cheers with bits',
    why: 'Lets Frameling hear when someone cheers in your channel, and how many bits.',
    scope: 'bits:read',
    subs: [{ type: 'channel.cheer', version: '1', condition: (id) => ({ broadcaster_user_id: id }) }],
  },
  follow: {
    kind: 'follow',
    label: 'Someone follows',
    why: 'Lets Frameling hear when someone follows your channel. Twitch calls this reading your followers.',
    scope: 'moderator:read:followers',
    subs: [{ type: 'channel.follow', version: '2', condition: (id) => ({ broadcaster_user_id: id, moderator_user_id: id }) }],
  },
  sub: {
    kind: 'sub',
    label: 'Someone subscribes',
    why: 'Lets Frameling hear when someone subscribes, resubscribes or is gifted a sub.',
    scope: 'channel:read:subscriptions',
    subs: [
      { type: 'channel.subscribe', version: '1', condition: (id) => ({ broadcaster_user_id: id }) },
      { type: 'channel.subscription.message', version: '1', condition: (id) => ({ broadcaster_user_id: id }) },
    ],
  },
  raid: {
    kind: 'raid',
    label: 'Another channel raids you',
    why: 'Needs no permission: raids are public. Lets Frameling hear when a raid arrives, and how many people it brings.',
    scope: '',
    subs: [{ type: 'channel.raid', version: '1', condition: (id) => ({ to_broadcaster_user_id: id }) }],
  },
};

export const KINDS = Object.keys(KIND_INFO) as TwitchKind[];

/** What is ticked to begin with. Raids need no permission and rewards are what most streamers want. */
export const DEFAULT_KINDS: TwitchKind[] = ['redemption', 'raid'];

export const isKind = (v: unknown): v is TwitchKind => typeof v === 'string' && v in KIND_INFO;

/** Keeps only real kinds, once each, in the usual order. */
export const cleanKinds = (v: unknown): TwitchKind[] => (Array.isArray(v) ? KINDS.filter((k) => v.includes(k)) : []);

/** The least that has to be asked for: one permission per ticked kind, none for the ones that need none, no repeats. */
export function scopesFor(kinds: TwitchKind[]): string[] {
  return [...new Set(kinds.map((k) => KIND_INFO[k].scope).filter(Boolean))].sort();
}

/** Which of `kinds` the granted permissions cover. */
export const coveredKinds = (kinds: TwitchKind[], granted: string[]): TwitchKind[] => kinds.filter((k) => !KIND_INFO[k].scope || granted.includes(KIND_INFO[k].scope));

/**
 * What the page hears. Never an id of a person and never a message: only what a rule can match on. `text` is what a
 * viewer typed when they redeemed a reward that asks for words; it is passed on in memory and nothing keeps it.
 *
 * `name` is the one exception, and it is there only when the page asked for names (a link to a Quill welcome is on and
 * the streamer has not said never to use names): the display name Twitch shows, cut to a sensible length and nothing
 * more. It is other people's words, so the page treats it like a typed sign: cleaned, covered until read, never kept.
 * Without the ask, no name is ever read from a notice.
 */
export type TwitchEvent =
  | { kind: 'redemption'; rewardId: string; rewardTitle: string; text?: string }
  | { kind: 'cheer'; bits: number; name?: string }
  | { kind: 'follow'; name?: string }
  | { kind: 'sub'; resub: boolean; name?: string }
  | { kind: 'raid'; viewers: number; name?: string };

/** The longest display name Twitch allows. Anything longer is cut, so rubbish costs nothing. */
export const NAME_MAX = 25;

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Turns one Twitch notice into an event, reading only the few fields a rule needs. Everything else in the notice (who
 * did it, their id, their message) is never read, so it cannot leak by accident. Null for a type we do not use.
 */
export function normaliseNotice(type: string, event: unknown, opts: { names?: boolean } = {}): TwitchEvent | null {
  const e = obj(event);
  // The display name, and only when asked for. An anonymous cheer has none.
  const named = (v: unknown): { name?: string } => {
    const n = opts.names ? str(v, NAME_MAX * 2).trim() : '';
    return n ? { name: n } : {};
  };
  switch (type) {
    case 'channel.channel_points_custom_reward_redemption.add': {
      const r = obj(e.reward);
      const id = str(r.id, 80);
      if (!id) return null;
      const text = str(e.user_input, 500);
      return { kind: 'redemption', rewardId: id, rewardTitle: str(r.title, 100), ...(text ? { text } : {}) };
    }
    case 'channel.cheer':
      return { kind: 'cheer', bits: num(e.bits), ...(e.is_anonymous === true ? {} : named(e.user_name)) };
    case 'channel.follow':
      return { kind: 'follow', ...named(e.user_name) };
    case 'channel.subscribe':
      return { kind: 'sub', resub: false, ...named(e.user_name) };
    case 'channel.subscription.message':
      return { kind: 'sub', resub: true, ...named(e.user_name) };
    case 'channel.raid':
      return { kind: 'raid', viewers: num(e.viewers), ...named(e.from_broadcaster_user_name) };
    default:
      return null;
  }
}

/** One reward the streamer has made, for picking in the mapping screen. */
export interface TwitchReward {
  id: string;
  title: string;
  cost: number;
}

export type TwitchRewardsAnswer = { ok: true; rewards: TwitchReward[] } | { ok: false; why: 'signed-out' | 'not-affiliate' | 'failed' };

export type TwitchProblem = '' | 'needs-sign-in' | 'expired' | 'denied' | 'failed' | 'offline' | 'no-app';

/** What the settings screen shows. Never a token, never the device code. */
export interface TwitchStatus {
  /** Whose Twitch app signs in: this build's own, one the streamer pasted in, or none yet. */
  app: 'built-in' | 'own' | 'none';
  /** Whether a sign-in can be kept across restarts here (the computer has a real key store). */
  canSave: boolean;
  state: 'signed-out' | 'signing-in' | 'signed-in';
  /** The streamer's own Twitch name while signed in. */
  login: string;
  /** The permissions Twitch granted. */
  scopes: string[];
  listening: 'off' | 'connecting' | 'listening' | 'reconnecting';
  /** Kinds Twitch refused to subscribe to (a missing permission, or a channel without channel points). */
  refused: TwitchKind[];
  problem: TwitchProblem;
}

export const signedOutStatus = (): TwitchStatus => ({ app: 'none', canSave: false, state: 'signed-out', login: '', scopes: [], listening: 'off', refused: [], problem: '' });

/** Twitch's own pages. The approval page is only ever opened when it is one of these. */
export function isTwitchApprovalAddress(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'www.twitch.tv' || u.hostname === 'id.twitch.tv' || u.hostname === 'twitch.tv') && u.username === '' && u.password === '';
  } catch {
    return false;
  }
}
