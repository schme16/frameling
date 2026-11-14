// Updates, the desktop side: looks at this repository's GitHub releases when the page asks, and (only when the person
// has pressed Update now) downloads the right file and puts it in. The page can't reach the network or the disk, so it
// asks here, and it can only ask for a release this side has already seen, never for an address of its own.
// Nothing runs by itself: no check at start-up from here, and nothing is downloaded until `update:install`.
import { app, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { copyOf, isReleaseAddress, parseReleases, pickAsset, RELEASES_API, type CopyFacts, type Release, type ReleaseAsset, type UpdateFacts } from '../update/logic';
import { PROFILE } from './profileName';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;
type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; body: unknown }>;

export type InstallResult = { ok: true; next: 'restart' | 'installer' } | { ok: false; message: string };

// TEST AUTOMATION. FRAMELING_UPDATE_FEED points the check at a local file of releases, and FRAMELING_UPDATE_CHECK=1 lets a
// run from the source folder check. Neither is ever set by anything but a script under scripts/.
const FEED = process.env.FRAMELING_UPDATE_FEED || '';
const feedOrigin = (): string => {
  try {
    return FEED ? new URL(FEED).origin : '';
  } catch {
    return '';
  }
};

export function copyFacts(): CopyFacts {
  return {
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged || process.env.FRAMELING_UPDATE_CHECK === '1',
    profile: PROFILE,
    appImage: process.env.APPIMAGE ?? '',
    portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
  };
}

export function updateFacts(): UpdateFacts {
  const f = copyFacts();
  return { ...copyOf({ ...f, packaged: app.isPackaged }), version: app.getVersion(), platform: f.platform, arch: f.arch, canCheck: f.packaged };
}

/** The releases GitHub lists for this repository, in the few fields Frameling uses. Never throws. */
export async function fetchReleases(doFetch: Fetch = (u, i) => net.fetch(u, i) as never, url: string = FEED || RELEASES_API, timeoutMs = 15000): Promise<{ ok: true; releases: Release[] } | { ok: false; message: string }> {
  try {
    const r = await doFetch(url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return { ok: false, message: r.status === 403 || r.status === 429 ? 'GitHub says too many people have asked lately. Try again in a little while.' : `GitHub answered ${r.status}.` };
    return { ok: true, releases: parseReleases(await r.json()) };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    return { ok: false, message: name === 'TimeoutError' || name === 'AbortError' ? "GitHub didn't answer in time." : "Couldn't reach GitHub. Is the internet on?" };
  }
}

/** A download may only come from this repository's releases (or the test feed's own address). */
export const mayDownload = (url: string, origin: string = feedOrigin()): boolean => isReleaseAddress(url) || (!!origin && url.startsWith(origin + '/'));

const MAGIC: Record<InstallFile, number[]> = { appimage: [0x7f, 0x45, 0x4c, 0x46], installer: [0x4d, 0x5a] };
type InstallFile = 'appimage' | 'installer';

/**
 * Downloads one file to `file`, checking as it goes: the size matches what the release says, the sha256 matches when
 * GitHub gave one, and it starts like the kind of file it should be. A file that fails any of that is deleted.
 */
export async function downloadTo(doFetch: Fetch, asset: ReleaseAsset, file: string, kind: InstallFile, onProgress: (pct: number) => void = () => {}, origin: string = feedOrigin()): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!mayDownload(asset.url, origin)) return { ok: false, message: "That file isn't on this project's releases, so Frameling won't get it." };
  const bad = (message: string) => {
    fs.rmSync(file, { force: true });
    return { ok: false as const, message };
  };
  try {
    const r = await doFetch(asset.url);
    if (!r.ok || !r.body) return bad(`The download didn't start (GitHub answered ${r.status}).`);
    const hash = createHash('sha256');
    let got = 0;
    const source = Readable.fromWeb(r.body as never);
    source.on('data', (c: Buffer) => {
      hash.update(c);
      got += c.length;
      if (asset.size > 0) onProgress(Math.min(99, Math.floor((got / asset.size) * 100)));
    });
    await pipeline(source, fs.createWriteStream(file));
    if (asset.size > 0 && got !== asset.size) return bad("The download came out the wrong size, so it wasn't used. Try again.");
    const want = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '')?.[1];
    if (want && hash.digest('hex') !== want.toLowerCase()) return bad("The download didn't match its checksum, so it wasn't used. Try again.");
    const head = Buffer.alloc(4);
    const fd = fs.openSync(file, 'r');
    try {
      fs.readSync(fd, head, 0, 4, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (!MAGIC[kind].every((b, i) => head[i] === b)) return bad("That didn't look like the right kind of file, so it wasn't used.");
    onProgress(100);
    return { ok: true };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOSPC') return bad("There isn't enough space on the disk to get the update.");
    return bad("The download stopped part way. Check the internet and try again.");
  }
}

/** Puts a downloaded AppImage in place of the running one. A rename is one step, so the old one stays whole until the new one is complete. */
export function placeAppImage(downloaded: string, target: string): { ok: true } | { ok: false; message: string } {
  try {
    fs.chmodSync(downloaded, 0o755);
    fs.renameSync(downloaded, target);
    return { ok: true };
  } catch (e) {
    fs.rmSync(downloaded, { force: true });
    const code = (e as NodeJS.ErrnoException)?.code;
    return { ok: false, message: code === 'EACCES' || code === 'EPERM' ? "Frameling isn't allowed to replace itself in its folder. Get the new one from the page instead." : "Couldn't put the new version in place. Get it from the page instead." };
  }
}

let last: Release[] = [];

export interface InstallDeps {
  doFetch: Fetch;
  facts: () => CopyFacts;
  releases: () => Release[];
  progress: (pct: number) => void;
  tempDir: () => string;
  startInstaller: (file: string) => void;
}

/** Update now: gets the file that suits this copy for a release this side has seen, and puts it in. */
export async function installUpdate(tag: string, d: InstallDeps): Promise<InstallResult> {
  const facts = d.facts();
  const info = copyOf(facts);
  const release = d.releases().find((r) => r.tag === tag);
  if (!release) return { ok: false, message: "That release isn't on the list any more. Check for updates again." };
  if (info.how === 'page') return { ok: false, message: info.why };
  const asset = pickAsset(info.how, release.assets, facts.arch, (u) => mayDownload(u));
  if (!asset) return { ok: false, message: "This release has no file for this computer yet. Get it from the page instead." };
  if (info.how === 'appimage') {
    const target = facts.appImage;
    try {
      fs.accessSync(path.dirname(target), fs.constants.W_OK);
    } catch {
      return { ok: false, message: "Frameling isn't allowed to replace itself in its folder. Get the new one from the page instead." };
    }
    const part = `${target}.download`;
    const got = await downloadTo(d.doFetch, asset, part, 'appimage', d.progress);
    if (!got.ok) return got;
    const put = placeAppImage(part, target);
    return put.ok ? { ok: true, next: 'restart' } : put;
  }
  const dir = path.join(d.tempDir(), 'Frameling-update');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, path.basename(asset.name));
  const got = await downloadTo(d.doFetch, asset, file, 'installer', d.progress);
  if (!got.ok) return got;
  try {
    d.startInstaller(file);
  } catch {
    return { ok: false, message: "Couldn't open the installer. It is in your temporary folder if you want to run it yourself." };
  }
  return { ok: true, next: 'installer' };
}

export function registerUpdateIpc(handle: Handle, win: () => Electron.BrowserWindow | null, finish: (relaunchInto: string | null) => void): void {
  handle('update:facts', () => updateFacts());
  handle('update:releases', async () => {
    if (!updateFacts().canCheck) return { ok: false, message: "This copy is running from the source folder, so it doesn't look for updates." };
    const got = await fetchReleases();
    if (got.ok) last = got.releases;
    return got;
  });
  handle('update:install', (_e, tag: unknown) =>
    installUpdate(String(tag), {
      doFetch: (u, i) => net.fetch(u, i) as never,
      facts: copyFacts,
      releases: () => last,
      progress: (pct) => {
        const w = win();
        if (w && !w.isDestroyed()) w.webContents.send('update:progress', pct);
      },
      tempDir: () => os.tmpdir(),
      startInstaller: (file) => void spawn(file, [], { detached: true, stdio: 'ignore' }).unref(),
    }),
  );
  handle('update:openPage', (_e, url: unknown) => {
    if (typeof url === 'string' && isReleaseAddress(url)) void shell.openExternal(url);
  });
  // The new copy is in: open it (an AppImage), or just close so the installer can work (Windows).
  handle('update:finish', () => finish(process.env.APPIMAGE && !PROFILE ? process.env.APPIMAGE : null));
}
