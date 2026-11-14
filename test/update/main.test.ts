// Updates, the desktop side: what is downloaded and how it is checked, and that Update now picks the right case. The
// network is a pretend one (a function that hands back bytes), and the files go in a folder made for the test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true, getVersion: () => '0.1.0' }, net: { fetch: () => Promise.reject(new Error('no network in tests')) }, shell: { openExternal: () => {} } }));

import { downloadTo, fetchReleases, installUpdate, mayDownload, placeAppImage, type InstallDeps } from '../../src/main/update';
import type { CopyFacts, Release } from '../../src/update/logic';

const BASE = 'https://github.com/schme16/frameling/releases/download/v0.2.0/';
const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from('the new appimage')]);
const sha = (b: Buffer) => 'sha256:' + createHash('sha256').update(b).digest('hex');
const answer = (bytes: Buffer | null, status = 200) => ({ ok: status < 300, status, body: bytes ? new Response(new Uint8Array(bytes)).body : null, json: async () => ({}) });

let dir: string;
beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-update-'))));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('where a download may come from', () => {
  it('only this repository\'s releases, or the test feed\'s own address', () => {
    expect(mayDownload(BASE + 'x', '')).toBe(true);
    expect(mayDownload('https://example.com/x', '')).toBe(false);
    expect(mayDownload('http://127.0.0.1:9/x', 'http://127.0.0.1:9')).toBe(true);
    expect(mayDownload('http://127.0.0.1:99/x', 'http://127.0.0.1:9')).toBe(false);
  });
});

describe('the list of releases', () => {
  it('reads what GitHub answers', async () => {
    const r = await fetchReleases(async () => ({ ok: true, status: 200, body: null, json: async () => [{ tag_name: 'v0.2.0' }] }));
    expect(r.ok && r.releases[0].tag).toBe('v0.2.0');
  });
  it('says why in plain words when it cannot', async () => {
    const limited = await fetchReleases(async () => answer(null, 403));
    expect(!limited.ok && limited.message).toMatch(/too many/);
    const offline = await fetchReleases(async () => Promise.reject(new TypeError('fetch failed')));
    expect(!offline.ok && offline.message).toMatch(/internet/);
    const slow = await fetchReleases(async () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })));
    expect(!slow.ok && slow.message).toMatch(/in time/);
  });
});

describe('downloading', () => {
  const file = () => path.join(dir, 'new.AppImage');
  const asset = (o: object = {}) => ({ name: 'F.AppImage', url: BASE + 'F.AppImage', size: elf.length, digest: sha(elf), ...o });

  it('keeps a file that is the right size, matches its checksum and starts like an AppImage', async () => {
    const pct: number[] = [];
    const r = await downloadTo(async () => answer(elf), asset(), file(), 'appimage', (p) => pct.push(p), '');
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(file()).equals(elf)).toBe(true);
    expect(pct.at(-1)).toBe(100);
  });
  it('throws away a file of the wrong size', async () => {
    const r = await downloadTo(async () => answer(elf), asset({ size: elf.length + 1 }), file(), 'appimage', () => {}, '');
    expect(!r.ok && r.message).toMatch(/wrong size/);
    expect(fs.existsSync(file())).toBe(false);
  });
  it('throws away a file whose checksum does not match', async () => {
    const r = await downloadTo(async () => answer(elf), asset({ digest: 'sha256:' + '0'.repeat(64) }), file(), 'appimage', () => {}, '');
    expect(!r.ok && r.message).toMatch(/checksum/);
    expect(fs.existsSync(file())).toBe(false);
  });
  it('throws away a file that is not the kind it should be', async () => {
    const text = Buffer.from('<html>not found</html>');
    const r = await downloadTo(async () => answer(text), asset({ size: text.length, digest: sha(text) }), file(), 'appimage', () => {}, '');
    expect(!r.ok && r.message).toMatch(/right kind/);
    expect(fs.existsSync(file())).toBe(false);
  });
  it('refuses an address that is not on this project\'s releases, without asking the network', async () => {
    const get = vi.fn();
    const r = await downloadTo(get, asset({ url: 'https://example.com/F.AppImage' }), file(), 'appimage', () => {}, '');
    expect(r.ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
  it('says so when the download will not start', async () => {
    const r = await downloadTo(async () => answer(null, 404), asset(), file(), 'appimage', () => {}, '');
    expect(!r.ok && r.message).toMatch(/404/);
  });
  it('says so when the connection drops part way', async () => {
    const r = await downloadTo(async () => Promise.reject(new Error('reset')), asset(), file(), 'appimage', () => {}, '');
    expect(!r.ok && r.message).toMatch(/stopped/);
  });
});

describe('putting the AppImage in place', () => {
  it('replaces the old file in one step and makes it runnable', () => {
    const target = path.join(dir, 'frameling.AppImage');
    fs.writeFileSync(target, 'old');
    const part = target + '.download';
    fs.writeFileSync(part, elf);
    expect(placeAppImage(part, target).ok).toBe(true);
    expect(fs.readFileSync(target).equals(elf)).toBe(true);
    expect(fs.statSync(target).mode & 0o111).not.toBe(0);
    expect(fs.existsSync(part)).toBe(false);
  });
  it('leaves the old file alone and says so when it cannot', () => {
    const target = path.join(dir, 'frameling.AppImage');
    fs.writeFileSync(target, 'old');
    const r = placeAppImage(path.join(dir, 'missing.download'), target);
    expect(r.ok).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('old');
  });
});

describe('Update now', () => {
  const release: Release = {
    tag: 'v0.2.0', name: 'v0.2.0', notes: '', page: 'https://github.com/schme16/frameling/releases/tag/v0.2.0', draft: false, prerelease: false,
    assets: [{ name: 'Frameling-0.2.0-linux-x86_64.AppImage', url: BASE + 'Frameling-0.2.0-linux-x86_64.AppImage', size: elf.length, digest: sha(elf) }],
  };
  const facts = (o: Partial<CopyFacts> = {}): CopyFacts => ({ platform: 'linux', arch: 'x64', packaged: true, profile: '', appImage: path.join(dir, 'frameling.AppImage'), portable: false, ...o });
  const deps = (o: Partial<InstallDeps> = {}): InstallDeps => ({ doFetch: async () => answer(elf), facts: () => facts(), releases: () => [release], progress: () => {}, tempDir: () => dir, startInstaller: () => {}, ...o });

  it('an AppImage is replaced where it lives, and the answer says to restart', async () => {
    fs.writeFileSync(facts().appImage, 'old');
    const r = await installUpdate('v0.2.0', deps());
    expect(r).toEqual({ ok: true, next: 'restart' });
    expect(fs.readFileSync(facts().appImage).equals(elf)).toBe(true);
  });
  it('a Windows installer is downloaded to a temporary folder and run', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.from('installer')]);
    const rel = { ...release, assets: [{ name: 'Frameling-0.2.0-setup-x64.exe', url: BASE + 'Frameling-0.2.0-setup-x64.exe', size: exe.length, digest: sha(exe) }] };
    const started: string[] = [];
    const r = await installUpdate('v0.2.0', deps({ doFetch: async () => answer(exe), facts: () => facts({ platform: 'win32', appImage: '' }), releases: () => [rel], startInstaller: (f) => void started.push(f) }));
    expect(r).toEqual({ ok: true, next: 'installer' });
    expect(started).toEqual([path.join(dir, 'Frameling-update', 'Frameling-0.2.0-setup-x64.exe')]);
  });
  it('the beta copy is never replaced, and nothing is downloaded', async () => {
    const get = vi.fn();
    const r = await installUpdate('v0.2.0', deps({ doFetch: get, facts: () => facts({ profile: 'beta' }) }));
    expect(r.ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(fs.existsSync(facts().appImage)).toBe(false);
  });
  it('a Mac or a source run downloads nothing either', async () => {
    const get = vi.fn();
    expect((await installUpdate('v0.2.0', deps({ doFetch: get, facts: () => facts({ platform: 'darwin', appImage: '' }) }))).ok).toBe(false);
    expect((await installUpdate('v0.2.0', deps({ doFetch: get, facts: () => facts({ packaged: false }) }))).ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
  it('only a release this side has seen can be asked for', async () => {
    const get = vi.fn();
    const r = await installUpdate('v9.9.9', deps({ doFetch: get }));
    expect(!r.ok && r.message).toMatch(/Check for updates/);
    expect(get).not.toHaveBeenCalled();
  });
  it('a folder it may not write to says so and downloads nothing', async () => {
    const get = vi.fn();
    const r = await installUpdate('v0.2.0', deps({ doFetch: get, facts: () => facts({ appImage: path.join(dir, 'no', 'such', 'folder', 'f.AppImage') }) }));
    expect(r.ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
  it('a release with no file for this computer says so', async () => {
    const r = await installUpdate('v0.2.0', deps({ releases: () => [{ ...release, assets: [] }] }));
    expect(!r.ok && r.message).toMatch(/no file/);
  });
});
