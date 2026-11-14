// Backing up everything you have set, and putting it back.
import { beforeEach, describe, expect, it } from 'vitest';
import { applySettings, backedUpMessage, backupDay, collectSettings, readSettings, restoreChanges, restoredMessage, restoreQuestion, settingsFileName, SETTINGS_FORMAT } from '../../src/ui/settingsFile';

/** A storage of our own, so the test never touches the real one. */
function fakeStorage(start: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(start));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

let store: Storage;
beforeEach(() => {
  store = fakeStorage({ 'frameling.prefs.v1': '{"theme":"dark"}', 'frameling.pen.v1': '{"seen":true}', 'someone.else': 'not mine' });
});

describe('backing settings up', () => {
  it('takes everything of Frameling own and nothing of anyone else', () => {
    const f = collectSettings(store);
    expect(Object.keys(f.items).sort()).toEqual(['frameling.pen.v1', 'frameling.prefs.v1']);
    expect(f.app).toBe(SETTINGS_FORMAT.app);
    expect(f.savedAt).toMatch(/^\d{4}-\d\d-\d\d/);
  });

  it('names the file by the day', () => {
    expect(settingsFileName(new Date('2026-11-14T10:00:00Z'))).toBe('frameling-settings-2026-11-14.json');
  });
});

describe('reading a settings file', () => {
  it('turns away anything that is not one, kindly', () => {
    expect(readSettings(null)).toEqual({ ok: false, why: "That isn't a Frameling settings file." });
    expect(readSettings({ app: 'other', kind: 'settings', version: 1 })).toMatchObject({ ok: false });
    expect(readSettings({ ...SETTINGS_FORMAT, version: 99, items: {} })).toMatchObject({ ok: false, why: 'That file was saved by a newer Frameling than this one.' });
    expect(readSettings({ ...SETTINGS_FORMAT, items: {} })).toMatchObject({ ok: false, why: 'That settings file has nothing in it.' });
  });

  it('keeps only Frameling own entries out of a file that has others', () => {
    const r = readSettings({ ...SETTINGS_FORMAT, savedAt: 'now', items: { 'frameling.prefs.v1': '{}', 'evil.key': 'nope', 'frameling.n': 5 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.file.items)).toEqual(['frameling.prefs.v1']);
  });
});

describe('putting a backup back', () => {
  it('replaces what is there, leaving other entries alone', () => {
    const file = { ...SETTINGS_FORMAT, savedAt: 'then', items: { 'frameling.prefs.v1': '{"theme":"light"}', 'frameling.dock.v1': '{}' } };
    const n = applySettings(file, store);
    expect(n).toBe(2);
    expect(store.getItem('frameling.prefs.v1')).toBe('{"theme":"light"}');
    // The pen settings were not in the backup, so they are gone rather than left behind from before.
    expect(store.getItem('frameling.pen.v1')).toBeNull();
    expect(store.getItem('someone.else')).toBe('not mine');
  });
});

describe('the words around Backup and Restore', () => {
  const backup = { ...SETTINGS_FORMAT, savedAt: '2026-11-12T23:30:00Z', items: { 'frameling.prefs.v1': '{"theme":"light"}', 'frameling.dock.v1': '{}' } };

  it('counts what a restore would change, add and take away', () => {
    expect(restoreChanges(collectSettings(store), backup)).toEqual({ added: 1, changed: 1, removed: 1 });
    expect(restoreChanges(backup, backup)).toEqual({ added: 0, changed: 0, removed: 0 });
  });

  it('asks first, naming the backup and what it replaces, with the same two words as the buttons', () => {
    const q = restoreQuestion(backup, 2);
    expect(q).toContain('12 Nov 2026');
    expect(q).toContain('replaces everything you have set now');
    expect(q).toContain('2 settings');
    expect(q).not.toMatch(/back up|put a backup|—/i);
  });

  it('says what changed afterwards', () => {
    expect(restoredMessage(backup, { added: 1, changed: 1, removed: 1 })).toBe('Restored the backup from 12 Nov 2026 (1 changed, 1 added, 1 gone). Frameling is starting again.');
    expect(restoredMessage(backup, { added: 0, changed: 0, removed: 0 })).toContain('nothing was different');
  });

  it('says a backup was saved, and copes with a file that has no readable day', () => {
    expect(backedUpMessage(1)).toBe('Backup saved: 1 setting.');
    expect(backedUpMessage(5)).toBe('Backup saved: 5 settings.');
    expect(backupDay('nonsense')).toBe('an earlier day');
    expect(backupDay(undefined)).toBe('an earlier day');
  });
});
