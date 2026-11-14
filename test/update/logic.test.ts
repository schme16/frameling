// Updates, the thinking: reading and comparing versions, picking the release to offer, the three answers, how this
// copy was installed, the file to get, the calm moment and the release notes. All pure.
import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  compareVersions,
  copyOf,
  decide,
  isReleaseAddress,
  notesLines,
  parseReleases,
  parseVersion,
  pickAsset,
  quietEnough,
  versionText,
  type CopyFacts,
  type Release,
} from '../../src/update/logic';

const rel = (tag: string, o: Partial<Release> = {}): Release => ({ tag, name: tag, notes: '', page: `https://github.com/schme16/frameling/releases/tag/${tag}`, draft: false, prerelease: false, assets: [], ...o });
const want = (o: Partial<Parameters<typeof decide>[1]> = {}) => ({ current: '0.1.0', beta: false, skipped: '', later: '', manual: false, ...o });

describe('versions', () => {
  it('reads the usual spellings', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] });
    expect(parseVersion('1.2')).toEqual({ major: 1, minor: 2, patch: 0, pre: [] });
    expect(parseVersion('1.2.3-beta.2+build5')).toEqual({ major: 1, minor: 2, patch: 3, pre: ['beta', '2'] });
    expect(parseVersion('nightly')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
  it('has one plain spelling', () => {
    expect(versionText('v1.2')).toBe('1.2.0');
    expect(versionText('1.2.0')).toBe('1.2.0');
    expect(versionText('v2.0.0-beta.1')).toBe('2.0.0-beta.1');
    expect(versionText('x')).toBe('');
  });
  it('compares numbers as numbers, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.2.3', '1.3.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });
  it('puts a release above its own beta, and betas in order', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.3')).toBe(1);
    expect(compareVersions('1.0.0-beta.3', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.9')).toBe(1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-beta.9')).toBe(1);
    expect(compareVersions('1.0.0-beta', '1.0.0-beta.1')).toBe(-1);
    expect(compareVersions('1.0.0-1', '1.0.0-beta')).toBe(-1);
  });
  it('treats something unreadable as older than anything readable', () => {
    expect(compareVersions('nightly', '0.0.1')).toBe(-1);
    expect(compareVersions('0.0.1', 'nightly')).toBe(1);
  });
});

describe('what GitHub says', () => {
  it('keeps the few fields used and drops what is not a release', () => {
    const got = parseReleases([
      { tag_name: 'v0.2.0', name: 'Turning', body: '- a', html_url: 'https://github.com/schme16/frameling/releases/tag/v0.2.0', draft: false, prerelease: false, assets: [{ name: 'F.AppImage', browser_download_url: 'https://github.com/schme16/frameling/releases/download/v0.2.0/F.AppImage', size: 5, digest: 'sha256:ab' }, { name: 'x' }] },
      { tag_name: 'not-a-version' },
      null,
      'nope',
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ tag: 'v0.2.0', name: 'Turning', notes: '- a', draft: false });
    expect(got[0].assets).toEqual([{ name: 'F.AppImage', url: 'https://github.com/schme16/frameling/releases/download/v0.2.0/F.AppImage', size: 5, digest: 'sha256:ab' }]);
  });
  it('falls back to the releases page when the page address is somewhere else', () => {
    expect(parseReleases([{ tag_name: 'v1.0.0', html_url: 'https://evil.example/x' }])[0].page).toBe('https://github.com/schme16/frameling/releases');
  });
  it('is empty for anything that is not a list', () => {
    expect(parseReleases({ message: 'Not Found' })).toEqual([]);
    expect(parseReleases(undefined)).toEqual([]);
  });
  it('only trusts addresses on this repository', () => {
    expect(isReleaseAddress('https://github.com/schme16/frameling/releases/download/v1/x')).toBe(true);
    expect(isReleaseAddress('https://github.com/schme16/frameling-evil/releases')).toBe(false);
    expect(isReleaseAddress('https://github.com/other/frameling/releases')).toBe(false);
    expect(isReleaseAddress('http://github.com/schme16/frameling/releases')).toBe(false);
  });
});

describe('which release is offered', () => {
  it('offers the newest one that is newer than this copy', () => {
    const v = decide([rel('v0.1.0'), rel('v0.3.0'), rel('v0.2.0')], want());
    expect(v.kind).toBe('offer');
    expect(v.kind === 'offer' && v.release.tag).toBe('v0.3.0');
  });
  it('says it is the newest when nothing is newer, or there are no releases at all', () => {
    expect(decide([rel('v0.1.0'), rel('v0.0.9')], want()).kind).toBe('newest');
    expect(decide([], want()).kind).toBe('newest');
  });
  it('never offers a draft or a pre-release to an ordinary copy', () => {
    expect(decide([rel('v0.2.0', { draft: true }), rel('v0.3.0', { prerelease: true })], want()).kind).toBe('newest');
    const v = decide([rel('v0.2.0'), rel('v0.3.0', { prerelease: true })], want());
    expect(v.kind === 'offer' && v.release.tag).toBe('v0.2.0');
  });
  it('offers them to a beta copy', () => {
    const v = decide([rel('v0.2.0'), rel('v0.3.0-beta.1', { prerelease: true }), rel('v0.4.0', { draft: true })], want({ beta: true }));
    expect(v.kind === 'offer' && v.release.tag).toBe('v0.4.0');
  });
  it('does not offer a version again once it was skipped, in any spelling', () => {
    expect(decide([rel('v0.2.0')], want({ skipped: '0.2.0' })).kind).toBe('skipped');
    expect(decide([rel('v0.2.0')], want({ skipped: 'v0.2' })).kind).toBe('skipped');
  });
  it('still offers a newer one after a skip', () => {
    expect(decide([rel('v0.2.0'), rel('v0.2.1')], want({ skipped: '0.2.0' })).kind).toBe('offer');
  });
  it('holds back a version put off for this run, but only that one', () => {
    expect(decide([rel('v0.2.0')], want({ later: '0.2.0' })).kind).toBe('later');
    expect(decide([rel('v0.2.1')], want({ later: '0.2.0' })).kind).toBe('offer');
  });
  it('offers a skipped or put-off one when you ask by hand', () => {
    expect(decide([rel('v0.2.0')], want({ skipped: '0.2.0', manual: true })).kind).toBe('offer');
    expect(decide([rel('v0.2.0')], want({ later: '0.2.0', manual: true })).kind).toBe('offer');
  });
});

describe('the three answers', () => {
  const none = { skipped: '', later: '' };
  it('Update now remembers nothing and starts the update', () => {
    expect(applyAnswer(none, 'now', 'v0.2.0')).toEqual({ mem: none, install: true });
  });
  it('Skip this one is remembered for good, in plain spelling, and does not install', () => {
    expect(applyAnswer(none, 'skip', 'v0.2.0')).toEqual({ mem: { skipped: '0.2.0', later: '' }, install: false });
  });
  it('Not right now is remembered for this run only, and does not install', () => {
    expect(applyAnswer(none, 'later', 'v0.2.0')).toEqual({ mem: { skipped: '', later: '0.2.0' }, install: false });
  });
  it('a later skip replaces an earlier one, and Not right now leaves a skip alone', () => {
    expect(applyAnswer({ skipped: '0.2.0', later: '' }, 'skip', 'v0.3.0').mem.skipped).toBe('0.3.0');
    expect(applyAnswer({ skipped: '0.2.0', later: '' }, 'later', 'v0.3.0').mem.skipped).toBe('0.2.0');
  });
  it('after each answer the offer comes out as it should', () => {
    const releases = [rel('v0.2.0')];
    const skip = applyAnswer(none, 'skip', 'v0.2.0').mem;
    expect(decide(releases, want(skip)).kind).toBe('skipped');
    const later = applyAnswer(none, 'later', 'v0.2.0').mem;
    expect(decide(releases, want(later)).kind).toBe('later');
    // A new run forgets Not right now (the page keeps it in memory only) but not a skip.
    expect(decide(releases, want({ skipped: skip.skipped, later: '' })).kind).toBe('skipped');
    expect(decide(releases, want({ skipped: '', later: '' })).kind).toBe('offer');
  });
});

describe('how this copy was installed', () => {
  const base: CopyFacts = { platform: 'linux', arch: 'x64', packaged: true, profile: '', appImage: '/mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage', portable: false };
  it('the Linux AppImage swaps itself', () => {
    expect(copyOf(base)).toEqual({ how: 'appimage', beta: false, why: '' });
  });
  it('the Windows installer runs the new installer', () => {
    expect(copyOf({ ...base, platform: 'win32', appImage: '' })).toMatchObject({ how: 'installer', beta: false });
  });
  it('the Windows portable build, a Mac and a Linux copy outside an AppImage say where to get it', () => {
    for (const f of [{ platform: 'win32', portable: true, appImage: '' }, { platform: 'darwin', appImage: '' }, { appImage: '' }]) {
      const c = copyOf({ ...base, ...f });
      expect(c.how, JSON.stringify(f)).toBe('page');
      expect(c.why.length).toBeGreaterThan(10);
    }
  });
  it('a run from the source folder never swaps itself', () => {
    expect(copyOf({ ...base, packaged: false }).how).toBe('page');
  });
  it('the beta copy is never replaced by an ordinary release, whatever it was installed as', () => {
    for (const platform of ['linux', 'win32', 'darwin']) {
      const c = copyOf({ ...base, platform, profile: 'beta' });
      expect(c, platform).toMatchObject({ how: 'page', beta: true });
      expect(c.why).toMatch(/beta/i);
    }
  });
});

describe('the file to get', () => {
  const url = (n: string) => `https://github.com/schme16/frameling/releases/download/v0.2.0/${n}`;
  const a = (name: string) => ({ name, url: url(name), size: 1 });
  const all = [a('Frameling-0.2.0-linux-x86_64.AppImage'), a('Frameling-0.2.0-setup-x64.exe'), a('Frameling-0.2.0-portable-x64.exe'), a('Frameling-0.2.0-mac-arm64.dmg')];
  it('picks the AppImage for an AppImage and the setup file for an installer, never the portable one', () => {
    expect(pickAsset('appimage', all, 'x64')?.name).toBe('Frameling-0.2.0-linux-x86_64.AppImage');
    expect(pickAsset('installer', all, 'x64')?.name).toBe('Frameling-0.2.0-setup-x64.exe');
  });
  it('prefers the one for this chip, and takes a lone file when none says', () => {
    const two = [a('F-arm64.AppImage'), a('F-x86_64.AppImage')];
    expect(pickAsset('appimage', two, 'arm64')?.name).toBe('F-arm64.AppImage');
    expect(pickAsset('appimage', two, 'x64')?.name).toBe('F-x86_64.AppImage');
    expect(pickAsset('appimage', [a('F.AppImage')], 'x64')?.name).toBe('F.AppImage');
    expect(pickAsset('appimage', two, 'ia32')).toBeNull();
  });
  it('has nothing to get when the copy only opens the page, or the release has no file', () => {
    expect(pickAsset('page', all, 'x64')).toBeNull();
    expect(pickAsset('appimage', [a('Frameling.dmg')], 'x64')).toBeNull();
  });
  it('ignores a file hosted anywhere but this repository', () => {
    expect(pickAsset('appimage', [{ name: 'F.AppImage', url: 'https://evil.example/F.AppImage', size: 1 }], 'x64')).toBeNull();
  });
});

describe('the calm moment', () => {
  it('waits while a button or pen is down, and for a few seconds after the last key or move', () => {
    expect(quietEnough(10_000, 9_000, false)).toBe(false);
    expect(quietEnough(10_000, 4_000, true)).toBe(false);
    expect(quietEnough(10_000, 4_000, false)).toBe(true);
    expect(quietEnough(10_000, 9_000, false, 500)).toBe(true);
  });
});

describe('the release notes', () => {
  it('turns Markdown into plain lines, in the release\'s own words', () => {
    const { lines, more } = notesLines('## What is new\n\n- **Turn** the view\n- See [the guide](https://x.example) for `more`\n\n---\nThanks!\r\n');
    expect(lines).toEqual([
      { kind: 'heading', text: 'What is new' },
      { kind: 'item', text: 'Turn the view' },
      { kind: 'item', text: 'See the guide for more' },
      { kind: 'text', text: 'Thanks!' },
    ]);
    expect(more).toBe(false);
  });
  it('cuts a long list and says there is more', () => {
    const body = Array.from({ length: 30 }, (_, i) => `- item ${i}`).join('\n');
    const r = notesLines(body, 5);
    expect(r.lines).toHaveLength(5);
    expect(r.more).toBe(true);
  });
  it('drops images, html and comments, and copes with nothing at all', () => {
    expect(notesLines('![shot](a.png)\n<!-- hidden -->\n<b>bold</b> text').lines).toEqual([{ kind: 'text', text: 'bold text' }]);
    expect(notesLines('').lines).toEqual([]);
    expect(notesLines(undefined as unknown as string).lines).toEqual([]);
  });
});
