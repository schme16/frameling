import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const home = vi.hoisted(() => ({ dir: '' }));
vi.mock('electron', () => ({ app: { getPath: () => home.dir }, dialog: {}, shell: {} }));

import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { _resetChoicesForTests } from '../../src/core/choices';
import { listLibrary, writeLibrary } from '../../src/main/library';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { DEFAULT_LIMITS, parseIndex, pruneVersions, safeDocKey, timeAgo, versionFileId, versionLabel, type VersionMeta } from '../../src/io/version-rules';
import { deleteVersion, listVersions, markVersionBaseline, maybeTakeTimedVersion, renameVersion, restoreVersion, takeVersion, versionOnSave } from '../../src/io/versions';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 10, 12, 15, 30).getTime();

const v = (ago: number, extra: Partial<VersionMeta> = {}): VersionMeta => ({ id: `v${ago}`, docId: 'd', takenAt: NOW - ago, size: 1000, ...extra });

describe('which versions are kept', () => {
  it('keeps every automatic version from the last hour', () => {
    const list = [v(1 * MIN), v(10 * MIN), v(20 * MIN), v(59 * MIN)];
    expect(pruneVersions(list, NOW).drop).toEqual([]);
  });

  it('keeps one an hour for a day, then one a day for two weeks, then none', () => {
    const list = [v(2 * HOUR + 5 * MIN), v(2 * HOUR + 15 * MIN), v(5 * HOUR), v(3 * DAY), v(3 * DAY + 10 * MIN), v(20 * DAY)];
    const { keep, drop } = pruneVersions(list, NOW);
    const ids = (l: VersionMeta[]) => l.map((x) => x.id).sort();
    // The two from the same hour: the newer stays. Same day, 3 days ago: the newer stays. 20 days: gone.
    expect(ids(drop)).toEqual(ids([v(2 * HOUR + 15 * MIN), v(3 * DAY + 10 * MIN), v(20 * DAY)]));
    expect(keep).toHaveLength(3);
  });

  it('never drops a named version, however old', () => {
    const named = v(400 * DAY, { name: 'First pose' });
    expect(pruneVersions([named, v(30 * DAY)], NOW).keep).toEqual([named]);
  });

  it('caps automatic versions by count and size, newest first', () => {
    const list = Array.from({ length: 10 }, (_, i) => v(i * MIN, { size: 100 }));
    expect(pruneVersions(list, NOW, { ...DEFAULT_LIMITS, maxAuto: 4 }).keep.map((x) => x.id)).toEqual(['v0', `v${MIN}`, `v${2 * MIN}`, `v${3 * MIN}`]);
    expect(pruneVersions(list, NOW, { ...DEFAULT_LIMITS, maxAutoBytes: 250 }).keep).toHaveLength(2);
    // Named ones don't count against the caps.
    expect(pruneVersions([...list, v(5 * DAY, { name: 'x', size: 10_000 })], NOW, { ...DEFAULT_LIMITS, maxAuto: 1 }).keep).toHaveLength(2);
  });
});

describe('version names and ids', () => {
  it('makes library-safe ids from any document id', () => {
    expect(safeDocKey('d-abc_12/..\\x')).toBe('dabc12x');
    expect(safeDocKey('')).toBe('doc');
    expect(versionFileId('d1', 36 ** 3, 'ab')).toBe('d1_1000_ab');
    expect(/^[A-Za-z0-9_-]{1,80}$/.test(versionFileId('x'.repeat(200), Date.now(), 'abc'))).toBe(true);
  });

  it('reads plain times', () => {
    expect(timeAgo(NOW - 10_000, NOW)).toBe('just now');
    expect(timeAgo(NOW - 5 * MIN, NOW)).toBe('5 minutes ago');
    expect(timeAgo(NOW - 2 * HOUR, NOW)).toMatch(/^2 hours ago \(/);
    expect(timeAgo(NOW - DAY, NOW)).toMatch(/^yesterday at /);
  });

  it('labels versions by name or by why they were taken', () => {
    expect(versionLabel(v(0, { name: 'Hi' }))).toBe('Hi');
    expect(versionLabel(v(0, { reason: 'save' }))).toBe('When you saved');
    expect(versionLabel(v(0))).toBe('Automatic');
  });

  it('ignores a broken index', () => {
    expect(parseIndex('nope')).toEqual([]);
    expect(parseIndex(JSON.stringify({ versions: [{ id: 'a', docId: 'd', takenAt: 1, size: 1 }, { bad: 1 }] }))).toHaveLength(1);
  });
});

describe('the desktop library keeps versions', () => {
  beforeEach(() => {
    home.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-ver-'));
  });
  afterAll(() => fs.rmSync(home.dir, { recursive: true, force: true }));

  it('as .frameling files with a .json index beside them', () => {
    const write = (f: string, b: Uint8Array | string) => fs.writeFileSync(f, b);
    writeLibrary('versions', 'd1_abc', new Uint8Array([1]), write);
    writeLibrary('versions-index', 'd1', new Uint8Array([2]), write);
    expect(fs.existsSync(path.join(home.dir, 'library', 'versions', 'd1_abc.frameling'))).toBe(true);
    expect(fs.existsSync(path.join(home.dir, 'library', 'versions-index', 'd1.json'))).toBe(true);
    expect(listLibrary('versions').map((e) => e.id)).toEqual(['d1_abc']);
  });
});

describe('taking and restoring versions', () => {
  beforeEach(async () => {
    for (const k of ['versions', 'versions-index'] as const) for (const e of await memoryLibrary.list(k)) await memoryLibrary.remove(k, e.id);
    setLibraryForTests(memoryLibrary);
    _resetChoicesForTests();
    resetStore(newDoc({ name: 'Ball', length: 4 }));
    markVersionBaseline();
  });
  afterEach(() => setLibraryForTests(null));

  const rename = (name: string) => store().update('Rename', (d) => void (d.name = name));

  it('takes named versions and lists them newest first', async () => {
    const a = await takeVersion({ name: 'First', now: NOW - 5 * MIN });
    rename('Ball 2');
    await takeVersion({ name: 'Second', now: NOW });
    const list = await listVersions(store().get().doc.id);
    expect(list.map((x) => x.name)).toEqual(['Second', 'First']);
    expect(list[0].frames).toBe(4);
    expect(a?.id).toBe(list[1].id);
  });

  it('takes a timed version only when something changed and 10 minutes passed', async () => {
    const t0 = Date.now();
    markVersionBaseline(store().rootDoc(), t0);
    expect(await maybeTakeTimedVersion(t0 + 11 * MIN)).toBeNull();
    rename('Changed');
    expect(await maybeTakeTimedVersion(t0 + 2 * MIN)).toBeNull();
    const got = await maybeTakeTimedVersion(t0 + 11 * MIN);
    expect(got?.reason).toBe('timer');
    // Nothing new since: no second copy.
    expect(await maybeTakeTimedVersion(t0 + 30 * MIN)).toBeNull();
  });

  it('keeps a version on save only when the drawing changed', async () => {
    await versionOnSave(store().rootDoc());
    expect(await listVersions(store().get().doc.id)).toHaveLength(0);
    rename('Saved');
    await versionOnSave(store().rootDoc());
    const list = await listVersions(store().get().doc.id);
    expect(list.map((x) => x.reason)).toEqual(['save']);
  });

  it('brings a version back in place as one undo step, keeping a version of the newer work', async () => {
    const id = store().get().doc.id;
    const first = (await takeVersion({ name: 'Round' }))!;
    rename('Square');
    store().update('Longer', (d) => void (d.length = 9));
    expect(await restoreVersion(first, 'in-place')).toBe(true);
    expect(store().get().doc.name).toBe('Ball');
    expect(store().get().doc.length).toBe(4);
    expect(store().get().doc.id).toBe(id);
    const list = await listVersions(id);
    expect(list.some((x) => x.reason === 'restore')).toBe(true);
    store().undo();
    expect(store().get().doc.name).toBe('Square');
    expect(store().get().doc.length).toBe(9);
  });

  it('opens a version as a separate copy with its own id', async () => {
    const id = store().get().doc.id;
    const first = (await takeVersion({ name: 'Round' }))!;
    store().markSaved('/x/ball.frameling');
    rename('Square');
    store().markSaved('/x/ball.frameling');
    expect(await restoreVersion(first, 'copy')).toBe(true);
    expect(store().get().doc.id).not.toBe(id);
    expect(store().get().doc.name).toBe('Ball (Round)');
    expect(store().get().ui.filePath).toBeNull();
    expect(store().get().ui.dirty).toBe(true);
  });

  it('renames and deletes', async () => {
    const t = (await takeVersion({ reason: 'timer' }))!;
    await renameVersion(t, '  Keeper ');
    let list = await listVersions(t.docId);
    expect(list[0].name).toBe('Keeper');
    await deleteVersion(list[0]);
    list = await listVersions(t.docId);
    expect(list).toEqual([]);
    expect(await memoryLibrary.list('versions')).toEqual([]);
  });
});
