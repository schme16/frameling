import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const home = vi.hoisted(() => ({ dir: '' }));
vi.mock('electron', () => ({ app: { getPath: () => home.dir }, dialog: {}, shell: {} }));

import { addLinked, canOpenOther, cleanFilters, fileFromUrl, isLinked, libraryId, listLibrary, readLibrary, readSmallFolder, removeLibrary, writeLibrary } from '../../src/main/library';

const write = (f: string, b: Uint8Array | string) => fs.writeFileSync(f, b);

describe('the desktop library', () => {
  beforeEach(() => {
    home.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-lib-'));
  });
  afterAll(() => fs.rmSync(home.dir, { recursive: true, force: true }));

  it('keeps plugins as .zip and templates as .frameling files, by id', () => {
    writeLibrary('templates', 'walk-cycle', new Uint8Array([1, 2, 3]), write);
    writeLibrary('plugins', 'flip', new Uint8Array([4]), write);
    expect(fs.existsSync(path.join(home.dir, 'library/templates/walk-cycle.frameling'))).toBe(true);
    // Files dropped in by hand count too; anything else is ignored.
    fs.writeFileSync(path.join(home.dir, 'library/templates/Dropped.frameling'), 'x');
    fs.writeFileSync(path.join(home.dir, 'library/templates/notes.txt'), 'x');
    fs.writeFileSync(path.join(home.dir, 'library/templates/bad name!.frameling'), 'x');
    expect(listLibrary('templates').map((e) => e.id).sort()).toEqual(['Dropped', 'walk-cycle']);
    expect(readLibrary('templates', 'walk-cycle')).toEqual(new Uint8Array([1, 2, 3]));
    expect(readLibrary('plugins', 'missing')).toBeNull();
    removeLibrary('templates', 'walk-cycle');
    expect(listLibrary('templates').map((e) => e.id)).toEqual(['Dropped']);
  });

  it('only takes plain ids', () => {
    expect(libraryId('ok-id_2')).toBe('ok-id_2');
    for (const bad of ['../x', 'a/b', '', 'a b', 5, null, 'x'.repeat(81)]) expect(libraryId(bad)).toBeNull();
  });

  it('opens only the kinds of file it expects', () => {
    expect(cleanFilters([{ name: 'P', extensions: ['zip', 'exe'] }, { name: 'X', extensions: ['sh'] }, 'junk'])).toEqual([{ name: 'P', extensions: ['zip'] }]);
    expect(canOpenOther('/a/b.flplay')).toBe(true);
    expect(canOpenOther('/a/b.png')).toBe(false);
  });

  it('reads a small plugin folder and refuses a big one', () => {
    const dir = path.join(home.dir, 'plug');
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(dir, 'main.js'), '//');
    fs.writeFileSync(path.join(dir, 'lib/x.js'), '//');
    fs.mkdirSync(path.join(dir, 'node_modules'));
    const r = readSmallFolder(dir);
    expect('error' in r ? r : r.map((f) => f.name).sort()).toEqual(['lib/x.js', 'main.js', 'manifest.json']);
    fs.writeFileSync(path.join(dir, 'big.bin'), Buffer.alloc(9 * 1024 * 1024));
    expect(readSmallFolder(dir)).toMatchObject({ error: expect.stringMatching(/too big/) });
  });

  it('remembers Interactives packages it may write back to', () => {
    const p = path.join(home.dir, 'a.flplay');
    expect(isLinked(p)).toBe(false);
    addLinked(p, write);
    expect(isLinked(p)).toBe(true);
    expect(isLinked(path.join(home.dir, 'a.frameling'))).toBe(false);
  });
});

describe('frameling:// links', () => {
  const exists = () => true;
  it('open .frameling and .flplay files by absolute path', () => {
    const abs = path.resolve('/art/walk.flplay');
    expect(fileFromUrl(`frameling://open?path=${encodeURIComponent(abs)}`, exists)).toBe(abs);
    expect(fileFromUrl(`frameling://open?path=${encodeURIComponent(path.resolve('/art/walk.frameling'))}`, exists)).toBe(path.resolve('/art/walk.frameling'));
  });
  it('refuse anything else', () => {
    expect(fileFromUrl('frameling://open?path=relative.flplay', exists)).toBeNull();
    expect(fileFromUrl(`frameling://open?path=${encodeURIComponent(path.resolve('/etc/passwd'))}`, exists)).toBeNull();
    expect(fileFromUrl(`frameling://delete?path=${encodeURIComponent(path.resolve('/a.flplay'))}`, exists)).toBeNull();
    expect(fileFromUrl(`https://open?path=${encodeURIComponent(path.resolve('/a.flplay'))}`, exists)).toBeNull();
    expect(fileFromUrl(`frameling://open?path=${encodeURIComponent(path.resolve('/a.flplay'))}`, () => false)).toBeNull();
    expect(fileFromUrl('not a url', exists)).toBeNull();
  });
});
