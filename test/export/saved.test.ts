// What a drawing remembers about exporting: the pure rules, and that it survives a save and an old file opens unchanged.
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { DocExports } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { MAX_WAYS, lastWayName, plainSettings, readExports, sameSettings, withLast, withRenamedWay, withWay, withoutWay } from '../../src/export/saved';
import { DEFAULT_SHEET, type ExportSettings } from '../../src/export/types';

const gif: ExportSettings = { format: 'gif', range: 'all', clipId: null, scale: 2, transparent: false, loop: true, dither: true, sheet: DEFAULT_SHEET };
const sheet: ExportSettings = { ...gif, format: 'sheet', scale: 1, sheet: { ...DEFAULT_SHEET, engine: 'godot', godot: true } };
let n = 0;
const id = () => `w${++n}`;

describe('saved export settings', () => {
  it('keeps plain data only and forgets whether the loop was set by hand', () => {
    const p = plainSettings({ ...gif, loopTouched: true, junk: () => 1, gone: undefined } as unknown as ExportSettings);
    expect(p.loopTouched).toBeUndefined();
    expect('junk' in p).toBe(false);
    expect(p.format).toBe('gif');
    expect((p.sheet as { json: boolean }).json).toBe(true);
  });

  it('compares settings whatever order the keys came in', () => {
    expect(sameSettings(plainSettings(gif), plainSettings({ sheet: DEFAULT_SHEET, dither: true, loop: true, transparent: false, scale: 2, clipId: null, range: 'all', format: 'gif' } as ExportSettings))).toBe(true);
    expect(sameSettings(plainSettings(gif), plainSettings({ ...gif, scale: 3 }))).toBe(false);
  });
});

describe('ways', () => {
  it('adds, names the last one, and replaces a way saved under the same name in other letters', () => {
    const a = withWay(undefined, '  The   sprite sheet ', plainSettings(sheet), id)!;
    expect(a.way.name).toBe('The sprite sheet');
    expect(a.exports.last?.way).toBe(a.way.id);
    expect(lastWayName(a.exports)).toBe('The sprite sheet');
    const b = withWay(a.exports, 'the web video', plainSettings(gif), id)!;
    expect(b.exports.ways).toHaveLength(2);
    const c = withWay(b.exports, 'THE SPRITE SHEET', plainSettings({ ...sheet, scale: 4 }), id)!;
    expect(c.exports.ways).toHaveLength(2);
    expect(c.way.id).toBe(a.way.id);
    expect(c.way.name).toBe('The sprite sheet');
    expect(c.exports.ways![0].settings.scale).toBe(4);
  });

  it('refuses an empty name and a full list, but still lets a full list update a way', () => {
    expect(withWay(undefined, '   ', plainSettings(gif), id)).toBeNull();
    let cur: DocExports | undefined;
    for (let i = 0; i < MAX_WAYS; i++) cur = withWay(cur, `way ${i}`, plainSettings(gif), id)!.exports;
    expect(withWay(cur, 'one too many', plainSettings(gif), id)).toBeNull();
    expect(withWay(cur, 'way 3', plainSettings({ ...gif, scale: 3 }), id)).not.toBeNull();
  });

  it('notes which way an export was when its settings match one, and returns the same object when nothing changed', () => {
    const a = withWay(undefined, 'web', plainSettings(gif), id)!.exports;
    const other = withLast(a, plainSettings(sheet));
    expect(other.last?.way).toBeUndefined();
    expect(other.ways).toEqual(a.ways);
    const back = withLast(other, plainSettings(gif));
    expect(back.last?.way).toBe(a.ways![0].id);
    expect(withLast(back, plainSettings(gif))).toBe(back);
  });

  it('forgets a way without losing what was last exported, and renames only to a free name', () => {
    const a = withWay(undefined, 'web', plainSettings(gif), id)!;
    const b = withWay(a.exports, 'game', plainSettings(sheet), id)!;
    expect(withRenamedWay(b.exports, a.way.id, 'GAME')).toBeNull();
    expect(withRenamedWay(b.exports, a.way.id, 'Web page')!.ways![0].name).toBe('Web page');
    const gone = withoutWay(b.exports, b.way.id)!;
    expect(gone.ways).toHaveLength(1);
    expect(gone.last?.settings.format).toBe('sheet');
    expect(gone.last?.way).toBeUndefined();
    expect(withoutWay(gone, a.way.id)!.ways).toBeUndefined();
  });
});

describe('reading them from a file', () => {
  it('drops what is broken and keeps the rest', () => {
    const r = readExports({
      last: { settings: { format: 'gif', scale: 2, nested: { a: 1, bad: () => 1 } }, way: 'nope' },
      ways: [
        { id: 'a', name: 'Good', settings: { format: 'mp4' } },
        { id: 'a', name: 'Same id', settings: { format: 'mp4' } },
        { id: 'b', name: '', settings: { format: 'mp4' } },
        { id: 'c', name: 'No format', settings: { scale: 1 } },
        'rubbish',
      ],
    }).exports!;
    expect(r.ways!.map((w) => w.name)).toEqual(['Good']);
    expect(r.last?.way).toBeUndefined();
    expect(r.last?.settings.scale).toBe(2);
  });

  it('says nothing for nothing, and for the wrong kind of thing', () => {
    expect(readExports(undefined)).toEqual({});
    expect(readExports('x')).toEqual({});
    expect(readExports({ ways: [], last: {} })).toEqual({});
  });
});

describe('in the file', () => {
  it('a drawing with no saved choices has no exports field, as old files have none', () => {
    const doc = newDoc({ name: 'Old', width: 32, height: 32, fps: 8, length: 2, background: null });
    expect('exports' in loadFile(saveFile(doc, 't')).doc).toBe(false);
  });

  it('saved ways and the last export come back after a save', () => {
    const doc = newDoc({ name: 'New', width: 32, height: 32, fps: 8, length: 2, background: null });
    const a = withWay(undefined, 'the web video', plainSettings(gif), id)!;
    doc.exports = withLast(withWay(a.exports, 'the sprite sheet', plainSettings(sheet), id)!.exports, plainSettings(gif));
    const back = loadFile(saveFile(doc, 't')).doc;
    expect(back.exports).toEqual(doc.exports);
    expect(back.exports?.last?.way).toBe(a.way.id);
  });
});
