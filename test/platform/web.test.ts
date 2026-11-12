import { IDBFactory } from 'fake-indexeddb';
import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { getHelp } from '../../src/core/registry';
import { can, describePlace, guessOs, platformKind } from '../../src/platform';
import '../../src/platform/help';
import type { Question } from '../../src/platform/ask';
import { openDb } from '../../src/platform/web/idb';
import { createWebApi, describeWebPath, KEEP_DAYS, MAX_RECENT, parsePath, pickerTypes, type DirHandleLike, type FileHandleLike, type Pickers, type WebEnv } from '../../src/platform/web/web';

const bytes = (...n: number[]) => new Uint8Array(n);
const DAY = 24 * 3600 * 1000;

/** A file handle kept in memory, standing in for a real one from the browser's pickers. */
class FakeFile implements FileHandleLike {
  kind = 'file' as const;
  data = new Uint8Array();
  modified = 0;
  writes = 0;
  constructor(
    public name: string,
    public permission: PermissionState = 'granted',
  ) {}
  async getFile() {
    return Object.assign(new Blob([this.data as BlobPart]), { lastModified: this.modified });
  }
  async createWritable() {
    const chunks: Uint8Array[] = [];
    return {
      write: async (d: Uint8Array | Blob) => void chunks.push(d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : d),
      close: async () => {
        this.data = new Uint8Array(chunks.flatMap((c) => [...c]));
        this.writes++;
      },
    };
  }
  async queryPermission() {
    return this.permission;
  }
  async requestPermission() {
    return this.permission;
  }
  async isSameEntry(other: unknown) {
    return other === this;
  }
}

class FakeDir implements DirHandleLike {
  kind = 'directory' as const;
  files = new Map<string, FakeFile>();
  constructor(public name: string) {}
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let f = this.files.get(name);
    if (!f) {
      if (!opts?.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      f = new FakeFile(name);
      this.files.set(name, f);
    }
    return f;
  }
}

const abort = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });

function setup(opts: { pickers?: Pickers; factory?: IDBFactory; upload?: File | null; answer?: string; now?: () => number; events?: WebEnv['events'] } = {}) {
  const factory = opts.factory ?? new IDBFactory();
  const downloads: { name: string; bytes: Uint8Array }[] = [];
  const asked: Question[] = [];
  const api = createWebApi({
    db: openDb('test', factory),
    pickers: opts.pickers ?? {},
    download: (name, b) => void downloads.push({ name, bytes: b }),
    pickUpload: async () => opts.upload ?? null,
    ask: async (q) => {
      asked.push(q);
      return opts.answer ?? q.cancel;
    },
    appVersion: '1.2.3',
    platform: 'linux',
    now: opts.now,
    events: opts.events,
  });
  return { api, factory, downloads, asked };
}

describe('web paths', () => {
  it('round-trips and reads in plain words', () => {
    expect(parsePath('file:/abc/Walk cycle.frameling')).toEqual({ kind: 'file', id: 'abc', name: 'Walk cycle.frameling' });
    expect(parsePath('/home/me/walk.frameling')).toBeNull();
    expect(describeWebPath('copy:/x/a.frameling')).toBe('kept in this browser');
    expect(describePlace('file:/x/a.frameling', () => '')).toBe('on this computer');
    expect(describePlace('/home/me/a.frameling', () => '/home/me')).toBe('in /home/me');
  });

  it('turns save filters into picker types with a MIME type each', () => {
    expect(pickerTypes([{ name: 'GIF', extensions: ['gif'] }, { name: 'All', extensions: ['*'] }])).toEqual([{ description: 'GIF', accept: { 'image/gif': ['.gif'] } }]);
    expect(pickerTypes([{ name: 'Odd', extensions: ['tres'] }])[0].accept).toEqual({ 'application/octet-stream': ['.tres'] });
  });

  it('guesses the system from the browser', () => {
    expect(guessOs({ platform: 'MacIntel' })).toBe('darwin');
    expect(guessOs({ userAgentData: { platform: 'Windows' } })).toBe('win32');
    expect(guessOs({ platform: 'Linux x86_64' })).toBe('linux');
  });

  it('reports no platform outside a page, and keeps desktop-only things to the desktop', () => {
    expect(platformKind()).toBe('none');
    expect(can('showInFolder')).toBe(false);
  });

  it('has a help topic', () => {
    expect(getHelp('web-browser')?.body).toContain('Firefox or Safari');
  });
});

describe('opening and saving with the File System Access API', () => {
  it('asks once where to save, then saves in place', async () => {
    const target = new FakeFile('Walk.frameling');
    const showSaveFilePicker = vi.fn(async () => target);
    const { api } = setup({ pickers: { showSaveFilePicker } });
    const r = await api.files.save({ bytes: bytes(1, 2, 3), path: null, suggestedName: 'Walk' });
    expect(r && 'path' in r && parsePath(r.path)?.kind).toBe('file');
    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Walk.frameling' }));
    expect([...target.data]).toEqual([1, 2, 3]);
    const again = await api.files.save({ bytes: bytes(4), path: (r as { path: string }).path, suggestedName: 'Walk' });
    expect(again).toEqual(r);
    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect([...target.data]).toEqual([4]);
  });

  it('lists saved and opened drawings once each in Open recent', async () => {
    const f = new FakeFile('Walk.frameling');
    const { api } = setup({ pickers: { showSaveFilePicker: async () => f, showOpenFilePicker: async () => [f] } });
    const saved = await api.files.save({ bytes: bytes(1), path: null, suggestedName: 'Walk' });
    const opened = await api.files.open();
    expect(opened && 'path' in opened && opened.path).toBe(saved && 'path' in saved && saved.path);
    await api.recent.add((opened as { path: string }).path);
    expect((await api.recent.list()).map((r) => r.name)).toEqual(['Walk']);
  });

  it('opens a picked file and can read it again by its path', async () => {
    const f = new FakeFile('Bounce.frameling');
    f.data = bytes(9, 8);
    const { api } = setup({ pickers: { showOpenFilePicker: async () => [f] } });
    const r = await api.files.open();
    if (!r || 'error' in r) throw new Error('should open');
    expect(r.path.endsWith('/Bounce.frameling')).toBe(true);
    expect([...r.bytes]).toEqual([9, 8]);
    f.data = bytes(7);
    const again = await api.files.read(r.path);
    expect('bytes' in again && [...again.bytes]).toEqual([7]);
  });

  it('treats a cancelled picker as a cancel, not an error', async () => {
    const { api } = setup({ pickers: { showOpenFilePicker: async () => Promise.reject(abort()), showSaveFilePicker: async () => Promise.reject(abort()), showDirectoryPicker: async () => Promise.reject(abort()) } });
    expect(await api.files.open()).toBeNull();
    expect(await api.files.save({ bytes: bytes(1), path: null, suggestedName: 'x' })).toBeNull();
    expect(await api.files.pickExportFile({ suggestedName: 'x.gif', filters: [] })).toBeNull();
    expect(await api.files.pickExportFolder({})).toBeNull();
  });

  it('says so in plain words when the browser refuses access', async () => {
    const f = new FakeFile('Locked.frameling', 'denied');
    const { api } = setup({ pickers: { showOpenFilePicker: async () => [f] } });
    const r = await api.files.open();
    if (!r || 'error' in r) throw new Error('should open');
    const again = await api.files.read(r.path);
    expect('error' in again && again.error).toMatch(/Allow/);
  });

  it('exports to a picked file', async () => {
    const out = new FakeFile('walk.gif');
    const { api, downloads } = setup({ pickers: { showSaveFilePicker: async () => out } });
    const p = await api.files.pickExportFile({ suggestedName: 'walk.gif', filters: [{ name: 'GIF', extensions: ['gif'] }] });
    expect(await api.files.write(p!, bytes(71, 73, 70))).toEqual({ ok: true });
    expect([...out.data]).toEqual([71, 73, 70]);
    expect(downloads).toEqual([]);
  });

  it('writes several files into a picked folder, asking before replacing', async () => {
    const dir = new FakeDir('exports');
    const first = setup({ pickers: { showDirectoryPicker: async () => dir } });
    const folder = (await first.api.files.pickExportFolder({ suggestedName: 'walk' }))!;
    const files = [
      { name: 'walk.png', bytes: bytes(1) },
      { name: 'walk.json', bytes: bytes(2) },
    ];
    const w = await first.api.files.writeMany(folder, files);
    expect(w && 'paths' in w && w.paths.map((p) => p.split('/').pop())).toEqual(['walk.png', 'walk.json']);
    expect([...dir.files.keys()]).toEqual(['walk.png', 'walk.json']);
    // Again: both are there now, so it asks. Cancel leaves them alone.
    expect(await first.api.files.writeMany(folder, [{ name: 'walk.png', bytes: bytes(5) }])).toBeNull();
    expect(first.asked[0].message).toContain('walk.png');
    expect([...dir.files.get('walk.png')!.data]).toEqual([1]);
    const replacing = setup({ pickers: { showDirectoryPicker: async () => dir }, answer: 'replace' });
    const f2 = (await replacing.api.files.pickExportFolder({}))!;
    await replacing.api.files.writeMany(f2, [{ name: 'walk.png', bytes: bytes(5) }]);
    expect([...dir.files.get('walk.png')!.data]).toEqual([5]);
  });
});

describe('opening and saving without it (Firefox, Safari)', () => {
  it('opens through the upload picker and keeps a copy for Open recent', async () => {
    const factory = new IDBFactory();
    const { api } = setup({ factory, upload: new File([bytes(5, 6)], 'Hop.frameling') });
    const r = await api.files.open();
    if (!r || 'error' in r) throw new Error('should open');
    expect(parsePath(r.path)?.kind).toBe('copy');
    await api.recent.add(r.path);
    // A later visit: the list and the copy are still there.
    const later = setup({ factory }).api;
    const list = await later.recent.list();
    expect(list.map((x) => x.name)).toEqual(['Hop']);
    const again = await later.files.read(list[0].path);
    expect('bytes' in again && [...again.bytes]).toEqual([5, 6]);
  });

  it('saves by downloading, and Save again downloads to the same name', async () => {
    const { api, downloads } = setup();
    const r = await api.files.save({ bytes: bytes(1), path: null, suggestedName: 'Walk' });
    if (!r || 'error' in r) throw new Error('should save');
    expect(downloads.map((d) => d.name)).toEqual(['Walk.frameling']);
    const again = await api.files.save({ bytes: bytes(2), path: r.path, suggestedName: 'Walk' });
    expect(again).toEqual(r);
    expect(downloads.map((d) => d.name)).toEqual(['Walk.frameling', 'Walk.frameling']);
    const read = await api.files.read(r.path);
    expect('bytes' in read && [...read.bytes]).toEqual([2]);
  });

  it('cancelling the upload picker is a cancel', async () => {
    expect(await setup().api.files.open()).toBeNull();
  });

  it('downloads single-file exports, and zips multi-file ones', async () => {
    const { api, downloads } = setup();
    const p = (await api.files.pickExportFile({ suggestedName: 'walk.gif', filters: [] }))!;
    expect(await api.files.write(p, bytes(1))).toEqual({ ok: true });
    const folder = (await api.files.pickExportFolder({ title: 'x', suggestedName: 'walk' }))!;
    const w = await api.files.writeMany(folder, [
      { name: 'walk.png', bytes: bytes(1, 2) },
      { name: 'walk.json', bytes: new TextEncoder().encode('{}') },
    ]);
    expect(w && 'paths' in w && w.paths[0].endsWith('/walk.zip')).toBe(true);
    expect(downloads.map((d) => d.name)).toEqual(['walk.gif', 'walk.zip']);
    const unzipped = unzipSync(downloads[1].bytes);
    expect(Object.keys(unzipped).sort()).toEqual(['walk.json', 'walk.png']);
    expect([...unzipped['walk.png']]).toEqual([1, 2]);
  });

  it('refuses to write anywhere that was not picked', async () => {
    const { api } = setup();
    expect(await api.files.write('/etc/passwd', bytes(1))).toHaveProperty('error');
    expect(await api.files.writeMany('/tmp', [])).toHaveProperty('error');
  });
});

describe('recent files', () => {
  it('keeps the newest twelve, newest first, and forgets cleared ones', async () => {
    let t = 1000;
    const { api } = setup({ now: () => t });
    for (let i = 0; i < MAX_RECENT + 3; i++) {
      const r = await api.files.save({ bytes: bytes(i), path: null, suggestedName: `D${i}` });
      t += 10;
      await api.recent.add((r as { path: string }).path);
    }
    const list = await api.recent.list();
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].name).toBe(`D${MAX_RECENT + 2}`);
    await api.recent.remove(list[0].path);
    expect(await api.files.read(list[0].path)).toHaveProperty('error');
    await api.recent.clear();
    expect(await api.recent.list()).toEqual([]);
  });
});

describe('autosave in the browser', () => {
  const meta = { name: 'Walk', filePath: null, docId: 'doc1' };

  it('writes, reads and clears the current copy', async () => {
    const { api } = setup({ now: () => 5000 });
    expect(await api.autosave.read()).toBeNull();
    await api.autosave.write(bytes(1, 2), meta);
    const r = await api.autosave.read();
    expect(r && [...r.bytes]).toEqual([1, 2]);
    expect(r?.meta).toEqual(meta);
    expect(r?.savedAt).toBe(5000);
    expect(r?.fileModifiedAt).toBeNull();
    await api.autosave.clear();
    expect(await api.autosave.read()).toBeNull();
  });

  it('puts aside what the last visit left unsaved, and drops it after 7 days', async () => {
    const factory = new IDBFactory();
    let t = 10 * DAY;
    const first = setup({ factory, now: () => t }).api;
    await first.autosave.write(bytes(3), meta);
    // Next visit: the leftover copy is still offered back, and also kept for a week.
    t += 1000;
    const second = setup({ factory, now: () => t }).api;
    expect(await second.autosave.read()).not.toBeNull();
    const kept = await second.autosave.listKept();
    expect(kept.map((k) => k.name)).toEqual(['Walk']);
    expect(kept[0].keptAt).toBe(t);
    const back = await second.autosave.readKept(kept[0].id);
    expect(back && [...back.bytes]).toEqual([3]);
    // Starting again doesn't restart its clock.
    t += 1000;
    const third = setup({ factory, now: () => t }).api;
    expect((await third.autosave.listKept())[0].keptAt).toBe(kept[0].keptAt);
    t += KEEP_DAYS * DAY;
    expect(await setup({ factory, now: () => t }).api.autosave.listKept()).toEqual([]);
  });

  it('keeps one copy per drawing with its thumbnail, and removes it on request', async () => {
    let t = 1;
    const { api } = setup({ now: () => t });
    await api.autosave.write(bytes(1), meta);
    await api.autosave.keep('data:image/png;base64,AAAA');
    t = 2;
    await api.autosave.write(bytes(2), meta);
    await api.autosave.keep('not a picture');
    const kept = await api.autosave.listKept();
    expect(kept).toHaveLength(1);
    expect(kept[0].thumb).toBeUndefined();
    expect([...(await api.autosave.readKept('doc1'))!.bytes]).toEqual([2]);
    await api.autosave.removeKept('doc1');
    expect(await api.autosave.listKept()).toEqual([]);
  });

  it('puts aside the picture sent with the autosave when the closing page has none to give', async () => {
    const factory = new IDBFactory();
    const first = setup({ factory, now: () => 1000 }).api;
    await first.autosave.write(bytes(4), { ...meta, thumb: 'data:image/png;base64,BBBB' });
    // No page is left to draw one: the next visit keeps the copy with the picture from the autosave.
    const second = setup({ factory, now: () => 2000 }).api;
    expect((await second.autosave.listKept())[0].thumb).toBe('data:image/png;base64,BBBB');
    // A picture that is not a picture is never kept.
    const third = setup({ now: () => 3000 }).api;
    await third.autosave.write(bytes(5), { ...meta, thumb: 'javascript:alert(1)' });
    await third.autosave.keep();
    expect((await third.autosave.listKept())[0].thumb).toBeUndefined();
  });

  it('knows when a picked file is newer than the copy', async () => {
    const f = new FakeFile('Walk.frameling');
    f.modified = 9999;
    const { api } = setup({ pickers: { showOpenFilePicker: async () => [f] }, now: () => 5000 });
    const r = await api.files.open();
    await api.autosave.write(bytes(1), { ...meta, filePath: (r as { path: string }).path });
    expect((await api.autosave.read())?.fileModifiedAt).toBe(9999);
  });
});

describe('the window', () => {
  it('asks "Save changes?" in the page', async () => {
    const save = setup({ answer: 'save' });
    expect(await save.api.app.askSaveChanges('Walk')).toBe('save');
    expect(save.asked[0].message).toBe('Save changes to "Walk"?');
    expect(await setup().api.app.askSaveChanges('Walk')).toBe('cancel');
  });

  it('warns before leaving with unsaved work, and puts the work aside on the way out', async () => {
    const listeners = new Map<string, (e: Event) => void>();
    const events = { addEventListener: (type: string, fn: (e: Event) => void) => void listeners.set(type, fn) } as unknown as WebEnv['events'];
    const { api } = setup({ events });
    const keep = vi.fn(async () => undefined);
    api.app.onKeepUnsaved(keep);
    const clean = new Event('beforeunload', { cancelable: true });
    listeners.get('beforeunload')!(clean);
    expect(clean.defaultPrevented).toBe(false);
    listeners.get('pagehide')!(new Event('pagehide'));
    expect(keep).not.toHaveBeenCalled();
    api.app.setDocumentState({ dirty: true, name: 'Walk', filePath: null });
    const dirty = new Event('beforeunload', { cancelable: true });
    listeners.get('beforeunload')!(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    listeners.get('pagehide')!(new Event('pagehide'));
    expect(keep).toHaveBeenCalledTimes(1);
  });

  it('hands over a file the system opened the app with', async () => {
    const f = new FakeFile('Launch.frameling');
    const { api } = setup();
    await api.receiveFiles([f]);
    const p = await api.app.getLaunchFile();
    expect(p?.endsWith('/Launch.frameling')).toBe(true);
    expect(await api.app.getLaunchFile()).toBeNull();
    const seen: string[] = [];
    api.app.onOpenFile((x) => seen.push(x));
    await api.receiveFiles([f]);
    expect(seen).toHaveLength(1);
  });

  it('says what it is', () => {
    const { api } = setup();
    expect(api.kind).toBe('web');
    expect(api.versions.app).toBe('1.2.3');
    expect(api.versions.electron).toBe('');
  });
});

describe('web library, other files and write-back', () => {
  it('keeps plugins and templates in IndexedDB, apart from each other, across visits', async () => {
    const { api, factory } = setup();
    await api.library!.write('templates', 'walk', bytes(1, 2));
    await api.library!.write('plugins', 'walk', bytes(9));
    expect((await api.library!.list('templates')).map((e) => [e.id, e.size])).toEqual([['walk', 2]]);
    const again = setup({ factory }).api;
    expect(await again.library!.read('templates', 'walk')).toEqual(bytes(1, 2));
    expect(await again.library!.read('plugins', 'walk')).toEqual(bytes(9));
    await again.library!.remove('templates', 'walk');
    expect(await again.library!.list('templates')).toEqual([]);
  });

  it('opens a .flplay with the picker and writes back to the same file', async () => {
    const f = new FakeFile('walk.flplay');
    f.data = bytes(5, 6);
    const { api } = setup({ pickers: { showOpenFilePicker: async () => [f] } });
    const r = await api.files.openOther!({ filters: [{ name: 'Interactives', extensions: ['flplay'] }] });
    if (!r || 'error' in r) throw new Error('expected a file');
    expect(r.bytes).toEqual(bytes(5, 6));
    expect(await api.files.write(r.path, bytes(7))).toEqual({ ok: true });
    expect(f.data).toEqual(bytes(7));
  });

  it('without pickers, an uploaded file is written back as a download', async () => {
    const upload = new File([bytes(1) as BlobPart], 'walk.flplay');
    const { api, downloads } = setup({ upload });
    const r = await api.files.openOther!({ filters: [{ name: 'Interactives', extensions: ['flplay'] }] });
    if (!r || 'error' in r) throw new Error('expected a file');
    await api.files.write(r.path, bytes(2));
    expect(downloads).toEqual([{ name: 'walk.flplay', bytes: bytes(2) }]);
  });
});
