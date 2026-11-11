import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const home = vi.hoisted(() => ({ dir: '' }));
vi.mock('electron', () => ({ app: { getPath: () => home.dir, addRecentDocument() {}, clearRecentDocuments() {} } }));

import { KEEP_DAYS, clearAutosave, keepAutosave, listKept, pruneKept, readKept, removeKept, writeAutosave } from '../../src/main/store';

const DAY = 24 * 3600 * 1000;
const bytes = (s: string) => new Uint8Array(Buffer.from(s));

describe('kept autosave copies', () => {
  beforeEach(() => {
    home.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-kept-'));
  });
  afterAll(() => fs.rmSync(home.dir, { recursive: true, force: true }));

  it('puts the current autosave aside and lists it newest first', () => {
    writeAutosave(bytes('one'), { name: 'First', filePath: null, docId: 'a1' });
    expect(keepAutosave('data:image/png;base64,AAAA', Date.now() - 2000)).toBe(true);
    writeAutosave(bytes('two'), { name: 'Second', filePath: null, docId: 'b2' });
    keepAutosave(undefined, Date.now() - 1000);
    const l = listKept();
    expect(l.map((k) => k.name)).toEqual(['Second', 'First']);
    expect(l[1].thumb).toBe('data:image/png;base64,AAAA');
    expect(Buffer.from(readKept('a1')!.bytes).toString()).toBe('one');
  });

  it('keeps one copy per drawing, the newest', () => {
    writeAutosave(bytes('v1'), { name: 'Same', filePath: null, docId: 'd' });
    keepAutosave(undefined, Date.now());
    writeAutosave(bytes('v2'), { name: 'Same', filePath: null, docId: 'd' });
    keepAutosave(undefined, Date.now());
    expect(listKept()).toHaveLength(1);
    expect(Buffer.from(readKept('d')!.bytes).toString()).toBe('v2');
  });

  it('does not restart the 7 days when the same copy is kept again (a crash copy seen at every start-up)', () => {
    writeAutosave(bytes('x'), { name: 'Crash', filePath: null, docId: 'c' });
    const t0 = Date.now() - 3 * DAY;
    keepAutosave(undefined, t0);
    keepAutosave(undefined, Date.now());
    expect(listKept()[0].keptAt).toBe(t0);
  });

  it('prunes copies older than 7 days and nothing else', () => {
    writeAutosave(bytes('old'), { name: 'Old', filePath: null, docId: 'old' });
    keepAutosave(undefined, Date.now() - (KEEP_DAYS * DAY + 1000));
    writeAutosave(bytes('new'), { name: 'New', filePath: null, docId: 'new' });
    keepAutosave(undefined, Date.now() - (KEEP_DAYS * DAY - 60_000));
    pruneKept();
    expect(listKept().map((k) => k.name)).toEqual(['New']);
    const files = fs.readdirSync(path.join(home.dir, 'autosave', 'kept'));
    expect(files.sort()).toEqual(['new.frameling', 'new.json']);
  });

  it('keeps nothing when there is no autosave, and removes on request', () => {
    expect(keepAutosave()).toBe(false);
    writeAutosave(bytes('x'), { name: 'Gone', filePath: null, docId: 'g' });
    keepAutosave();
    clearAutosave();
    expect(listKept()).toHaveLength(1);
    removeKept('g');
    expect(listKept()).toHaveLength(0);
    expect(readKept('g')).toBeNull();
  });

  it('refuses ids that try to leave the folder', () => {
    writeAutosave(bytes('x'), { name: 'Sneaky', filePath: null, docId: '../../evil' });
    keepAutosave();
    expect(fs.readdirSync(path.join(home.dir, 'autosave', 'kept')).every((n) => !n.includes('..'))).toBe(true);
    expect(readKept('../../etc/passwd')).toBeNull();
  });
});
