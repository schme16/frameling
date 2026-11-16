// The thinking behind updates, kept apart from Electron and the page so tests can run all of it: reading a version,
// choosing which release to offer, how this copy was installed, what each of the three answers does, and turning a
// release's notes into a few plain lines. Nothing here touches the network or the disk.

// ---------------------------------------------------------------- versions

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** The part after the dash ("beta.2"), split on dots. Empty for a plain release. */
  pre: string[];
}

/** Reads "1.2.3", "v1.2.3", "1.2" or "1.2.3-beta.2" (anything after a + is ignored). Null when it isn't a version. */
export function parseVersion(text: string): Version | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +(m[2] ?? 0), patch: +(m[3] ?? 0), pre: m[4] ? m[4].split('.') : [] };
}

/** The version as one plain spelling ("1.2.3" or "1.2.3-beta.2"), so two spellings of one version compare equal. Empty when unreadable. */
export function versionText(text: string): string {
  const v = parseVersion(text);
  return v ? `${v.major}.${v.minor}.${v.patch}${v.pre.length ? '-' + v.pre.join('.') : ''}` : '';
}

const isNum = (s: string) => /^\d+$/.test(s);

/** Which is newer: -1 when a is older, 1 when a is newer, 0 when they are the same. A release beats its own beta (1.0.0 > 1.0.0-beta.3). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] > y[k] ? 1 : -1;
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (isNum(p) && isNum(q)) return +p > +q ? 1 : -1;
    if (isNum(p) !== isNum(q)) return isNum(p) ? -1 : 1;
    return p > q ? 1 : -1;
  }
  return 0;
}

// ---------------------------------------------------------------- releases

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  /** "sha256:..." as GitHub reports it, when it does. */
  digest?: string;
}

export interface Release {
  /** The tag, e.g. "v0.2.0". */
  tag: string;
  name: string;
  /** What is new, in the release's own words (Markdown as written). */
  notes: string;
  /** The release's page on GitHub. */
  page: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

/** This repository's releases: the only place Frameling looks, and the only place a download may come from. */
export const REPO = 'schme16/frameling';
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

/** An address on this repository's releases (the page, or a file attached to one). */
export const isReleaseAddress = (url: string): boolean => typeof url === 'string' && url.startsWith(`https://github.com/${REPO}/releases`);

/** Reads what GitHub answers (a list of releases) into the few fields used. Anything that isn't a release is dropped. */
export function parseReleases(json: unknown): Release[] {
  if (!Array.isArray(json)) return [];
  const out: Release[] = [];
  for (const r of json) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const tag = typeof o.tag_name === 'string' ? o.tag_name : '';
    if (!parseVersion(tag)) continue;
    const assets: ReleaseAsset[] = [];
    for (const a of Array.isArray(o.assets) ? o.assets : []) {
      const x = a as Record<string, unknown>;
      if (typeof x?.name !== 'string' || typeof x.browser_download_url !== 'string') continue;
      assets.push({ name: x.name, url: x.browser_download_url, size: typeof x.size === 'number' ? x.size : 0, ...(typeof x.digest === 'string' ? { digest: x.digest } : {}) });
    }
    out.push({
      tag,
      name: typeof o.name === 'string' && o.name ? o.name : tag,
      notes: typeof o.body === 'string' ? o.body.slice(0, 8000) : '',
      page: typeof o.html_url === 'string' && isReleaseAddress(o.html_url) ? o.html_url : RELEASES_PAGE,
      draft: o.draft === true,
      prerelease: o.prerelease === true,
      assets,
    });
  }
  return out;
}

/** Drafts and pre-releases are for a beta copy only. */
export const offerable = (r: Release, beta: boolean): boolean => beta || (!r.draft && !r.prerelease);

export interface OfferWanted {
  /** The version this copy is. */
  current: string;
  beta: boolean;
  /** The version the person chose to skip ("Skip this one"), or empty. */
  skipped: string;
  /** A version already put off for this run ("Not right now"), or empty. */
  later: string;
  /** Asked for by hand (Check for updates): skipping and putting off are ignored, since you did ask. */
  manual: boolean;
}

export type Verdict = { kind: 'offer'; release: Release } | { kind: 'newest' } | { kind: 'skipped'; release: Release } | { kind: 'later'; release: Release };

/** What to do with a list of releases: offer the newest one that is newer than this copy, unless it was skipped or put off. */
export function decide(releases: Release[], w: OfferWanted): Verdict {
  let best: Release | null = null;
  for (const r of releases) {
    if (!offerable(r, w.beta) || compareVersions(r.tag, w.current) <= 0) continue;
    if (!best || compareVersions(r.tag, best.tag) > 0) best = r;
  }
  if (!best) return { kind: 'newest' };
  if (!w.manual) {
    if (w.skipped && versionText(best.tag) === versionText(w.skipped)) return { kind: 'skipped', release: best };
    if (w.later && versionText(best.tag) === versionText(w.later)) return { kind: 'later', release: best };
  }
  return { kind: 'offer', release: best };
}

// ---------------------------------------------------------------- the three answers

export type Answer = 'now' | 'skip' | 'later';

export interface Memory {
  /** Remembered for good, in Preferences' settings file. */
  skipped: string;
  /** Remembered for this run only. */
  later: string;
}

/** What an answer does: what is remembered afterwards, and whether the update starts. Pure. */
export function applyAnswer(mem: Memory, answer: Answer, version: string): { mem: Memory; install: boolean } {
  const v = versionText(version);
  if (answer === 'skip') return { mem: { ...mem, skipped: v }, install: false };
  if (answer === 'later') return { mem: { ...mem, later: v }, install: false };
  return { mem, install: true };
}

// ---------------------------------------------------------------- how this copy was installed

export interface CopyFacts {
  platform: string;
  arch: string;
  /** A built app, not `npm run dev`. */
  packaged: boolean;
  /** The profile baked in at build time: "beta" for the beta copy, empty for an ordinary one. */
  profile: string;
  /** The AppImage's own path (the APPIMAGE variable), when it was started from one. */
  appImage: string;
  /** The Windows portable build (it runs from a temporary copy of itself). */
  portable: boolean;
}

/**
 * What can be done about an update for this copy:
 * - appimage: get the new AppImage and put it where this one is.
 * - installer: get the Windows installer and run it.
 * - page: Frameling can't put it in by itself, so it says where to get it and opens the page.
 */
export type InstallHow = 'appimage' | 'installer' | 'page';

export interface CopyInfo {
  how: InstallHow;
  beta: boolean;
  /** Plain words for the "page" cases: why it can't do it itself. Empty otherwise. */
  why: string;
}

export function copyOf(f: CopyFacts): CopyInfo {
  const beta = f.profile !== '';
  if (beta) return { how: 'page', beta, why: "This is the beta copy, so an ordinary release never replaces it. Get the new beta from the page." };
  if (!f.packaged) return { how: 'page', beta, why: "This copy is running from the source folder, so it can't swap itself." };
  if (f.platform === 'linux') {
    return f.appImage
      ? { how: 'appimage', beta, why: '' }
      : { how: 'page', beta, why: "This copy wasn't started from an AppImage, so Frameling can't swap it. Get the AppImage from the page." };
  }
  if (f.platform === 'win32') {
    return f.portable
      ? { how: 'page', beta, why: "The portable version has no installer to run. Get the new portable file from the page and use it instead of this one." }
      : { how: 'installer', beta, why: '' };
  }
  if (f.platform === 'darwin') return { how: 'page', beta, why: "On a Mac the new app is a download to open and drag over this one. Get it from the page." };
  return { how: 'page', beta, why: "Frameling can't swap this copy by itself. Get the new one from the page." };
}

/** What the desktop side tells the page about this copy. */
export interface UpdateFacts extends CopyInfo {
  version: string;
  platform: string;
  arch: string;
  /** Whether this run may look for updates at all: a built app does; a run from the source folder doesn't. */
  canCheck: boolean;
}

const archWords = (arch: string): string[] => (arch === 'arm64' ? ['arm64', 'aarch64'] : arch === 'x64' ? ['x64', 'x86_64', 'amd64'] : [arch]);

/** The file on a release that suits this copy, or null when there isn't one (then the page is opened instead). */
export function pickAsset(how: InstallHow, assets: ReleaseAsset[], arch: string, allowed: (url: string) => boolean = isReleaseAddress): ReleaseAsset | null {
  const want = how === 'appimage' ? /\.AppImage$/i : how === 'installer' ? /setup.*\.exe$/i : null;
  if (!want) return null;
  const fit = assets.filter((a) => want.test(a.name) && allowed(a.url));
  const words = archWords(arch);
  return fit.find((a) => words.some((w) => a.name.toLowerCase().includes(w))) ?? (fit.length === 1 ? fit[0] : null);
}

// ---------------------------------------------------------------- the moment to offer

/** Nobody is drawing: no button or pen is down, and the last key or movement was a few seconds ago. */
export function quietEnough(now: number, lastInput: number, pointerDown: boolean, quietMs = 5000): boolean {
  return !pointerDown && now - lastInput >= quietMs;
}

// ---------------------------------------------------------------- the notes

export interface NoteLine {
  kind: 'heading' | 'item' | 'text';
  text: string;
}

/** Plain-ish Markdown in, a few clean lines out: marks removed, links reduced to their words, cut to `max` lines. */
export function notesLines(body: string, max = 12): { lines: NoteLine[]; more: boolean } {
  const all: NoteLine[] = [];
  for (const raw of String(body ?? '').replace(/\r/g, '').split('\n')) {
    let t = raw.trim();
    if (!t || /^(-{3,}|\*{3,}|_{3,})$/.test(t) || t.startsWith('```') || t.startsWith('<!--')) continue;
    let kind: NoteLine['kind'] = 'text';
    const h = /^#{1,6}\s+(.*)$/.exec(t);
    const li = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(t);
    if (h) {
      kind = 'heading';
      t = h[1];
    } else if (li) {
      kind = 'item';
      t = li[1];
    }
    t = t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/(\*\*|__|\*|_|`)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (t) all.push({ kind, text: t.length > 220 ? t.slice(0, 219).trimEnd() + '...' : t });
  }
  return { lines: all.slice(0, max), more: all.length > max };
}
