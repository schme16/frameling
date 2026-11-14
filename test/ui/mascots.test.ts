import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { decodePng } from '../../src/io/png';
import { mapPencils, PENCILS } from '../../src/quillpet/quills';
import { line, lines } from '../../src/ui/mascot/lines';
import { currentMascot, DEFAULT_MASCOT, getMascot, hasChoice, isMascotId, mascots, registerMascot, type Mascot } from '../../src/ui/mascot/mascots';
import { CLIPS, parseSheet, sheetProblems } from '../../src/ui/mascot/timing';
import { migratePrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { FAKE_SHEET } from '../fixtures/quill-sheet';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

afterEach(() => resetPrefs());

describe('the mascots the app has', () => {
  it('is Quill, alone, and he is the default', () => {
    expect(mascots().map((m) => m.id)).toEqual(['quill']);
    expect(DEFAULT_MASCOT).toBe('quill');
    expect(hasChoice()).toBe(false);
    expect(currentMascot().id).toBe('quill');
  });

  it('gives the standard mascot for nothing, or for something the app does not know', () => {
    expect(getMascot().id).toBe('quill');
    expect(getMascot('')).toBe(getMascot('quill'));
    expect(getMascot('nobody')).toBe(getMascot('quill'));
    expect(isMascotId('quill')).toBe(true);
    expect(isMascotId('nobody')).toBe(false);
    expect(isMascotId(4)).toBe(false);
  });

  it('keeps the choice as a preference that a damaged file cannot break', () => {
    expect(migratePrefs({}).mascot).toBe('quill');
    expect(migratePrefs({ mascot: 'someone' }).mascot).toBe('someone');
    expect(migratePrefs({ mascot: 7 }).mascot).toBe('quill');
    expect(migratePrefs({ mascot: '' }).mascot).toBe('quill');
    setPrefs({ mascot: 'someone-who-left' });
    expect(currentMascot().id).toBe('quill');
  });

  it('follows the choice when there is another mascot, and goes back when he leaves', () => {
    const other: Mascot = { id: 'other', name: 'Other', blurb: 'Someone else.', sheetUrl: 'mascot/other.png', metaUrl: 'mascot/other.json' };
    const undo = registerMascot(other);
    expect(hasChoice()).toBe(true);
    expect(currentMascot().id).toBe('quill');
    setPrefs({ mascot: 'other' });
    expect(currentMascot()).toBe(other);
    undo();
    expect(hasChoice()).toBe(false);
    expect(currentMascot().id).toBe('quill');
  });

  it('lets a mascot say some things differently and falls back to the standard words for the rest', () => {
    const quillHello = line('onboarding.prefs.showQuill');
    const undo = registerMascot({
      id: 'chatty',
      name: 'Chatty',
      blurb: '',
      sheetUrl: 'x.png',
      metaUrl: 'x.json',
      lines: { 'onboarding.prefs.showQuill': { text: 'Hello from Chatty', where: 'test' } },
    });
    setPrefs({ mascot: 'chatty' });
    expect(line('onboarding.prefs.showQuill')).toBe('Hello from Chatty');
    expect(lines('goodbye.long').length).toBeGreaterThan(0);
    setPrefs({ mascot: 'quill' });
    expect(line('onboarding.prefs.showQuill')).toBe(quillHello);
    undo();
  });

  it('repaints only the pencils a mascot has', () => {
    expect(PENCILS.length).toBe(5);
    expect(mapPencils(['#112233']).size).toBe(2);
    expect(mapPencils(['#112233'], []).size).toBe(0);
    const undo = registerMascot({ id: 'plain', name: 'Plain', blurb: '', sheetUrl: 'x.png', metaUrl: 'x.json' });
    setPrefs({ mascot: 'plain' });
    expect(mapPencils(['#112233']).size).toBe(0);
    undo();
  });
});

describe('the clip contract', () => {
  const noClip = (name: string) => {
    const anims = { ...FAKE_SHEET.anims } as Record<string, (typeof FAKE_SHEET.anims)['idle']>;
    delete anims[name];
    return { ...FAKE_SHEET, anims };
  };

  it('is thirteen clips, each of them drawn by the test sheet', () => {
    expect(CLIPS).toHaveLength(13);
    expect(sheetProblems(FAKE_SHEET)).toEqual([]);
  });

  it('names every clip a sheet is missing, one by one', () => {
    for (const c of CLIPS) expect(sheetProblems(noClip(c))).toEqual([`no "${c}" clip`]);
  });

  it('wants resting and sleeping to loop', () => {
    const sheet = { ...FAKE_SHEET, anims: { ...FAKE_SHEET.anims, idle: { ...FAKE_SHEET.anims.idle, loop: false } } };
    expect(sheetProblems(sheet)).toEqual(['"idle" must loop']);
  });

  // The type already stops a typo in TypeScript. This catches a clip name written as a plain string somewhere
  // the type can't see (a script, a data file), so it can't drift from the list.
  it('covers every clip name the source code asks for', () => {
    const asked = new Set<string>();
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(/\banim: '([a-z][a-z-]*)'/g)) asked.add(m[1]);
      }
    };
    walk(join(ROOT, 'src'));
    expect(asked.size).toBeGreaterThan(5);
    for (const name of asked) expect(CLIPS as readonly string[]).toContain(name);
  });
});

// Every mascot the app ships, read from the files the build made: this is what fails when someone adds a mascot
// and forgets a clip, or the sheet and its json disagree.
describe.each(mascots().map((m) => [m.id, m] as const))('the %s sheet on disk', (_id, m) => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'public', m.metaUrl), 'utf8'));
  const sheet = parseSheet(meta)!;

  it('is a good sheet that keeps the contract', () => {
    expect(sheet).not.toBeNull();
    expect(sheetProblems(sheet)).toEqual([]);
  });

  it('has every frame inside its picture', () => {
    const img = decodePng(new Uint8Array(readFileSync(join(ROOT, 'public', m.sheetUrl))));
    for (const [name, a] of Object.entries(sheet.anims)) {
      for (const f of a.frames) {
        expect(f.x + sheet.frameW, `${name} frame x`).toBeLessThanOrEqual(img.width);
        expect(f.y + sheet.frameH, `${name} frame y`).toBeLessThanOrEqual(img.height);
      }
    }
  });

  it('has a source file the build reads', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'src/ui/mascot/mascots.json'), 'utf8'));
    const row = manifest.mascots.find((r: { id: string }) => r.id === m.id);
    expect(existsSync(join(ROOT, row.source))).toBe(true);
    if (row.appIcon) expect(existsSync(join(ROOT, row.appIcon))).toBe(true);
  });
});

describe('the manifest', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'src/ui/mascot/mascots.json'), 'utf8')) as { default: string; mascots: { id: string; appIcon?: string }[] };

  it('has unique ids and a default that exists', () => {
    const ids = manifest.mascots.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(manifest.default);
  });

  it('makes the app icon from exactly one mascot, since the icon belongs to the app', () => {
    expect(manifest.mascots.filter((m) => m.appIcon)).toHaveLength(1);
  });
});
