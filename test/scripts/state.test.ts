// @vitest-environment jsdom
// Where scripts are kept (with the app, or inside the drawing), how each becomes a command, what happens to the ones that
// arrive inside a file, and the look-first stop for a script that came from somewhere else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { loadFile, saveFile } from '../../src/io/file';
import { toasts } from '../../src/ui/toast';
import { HOME_CHOICE, IN_FILES_CHOICE } from '../../src/scripts/choices';
import { lastRun, lookWords, onDrawingOpened, runScript, newScript } from '../../src/scripts/control';
import { lookAt } from '../../src/scripts/model';
import { setRunDepsForTests } from '../../src/scripts/runner';
import { allScripts, canRun, createScript, deleteScript, docScripts, findScript, loadAppScripts, moveScript, scripts, setDocOn, syncCommands, updateScript } from '../../src/scripts/state';
import { closeAll, runPlugin } from '../plugins/harness';

const asked: string[] = [];
const answerWith = (value: string, remember = false) => setChoiceAsker(async (d) => (asked.push(d.id), { value, remember }));
const steps = () => store().historyList().done.length;

beforeEach(() => {
  localStorage.clear();
  asked.length = 0;
  setChoice(HOME_CHOICE, undefined);
  setChoice(IN_FILES_CHOICE, undefined);
  setChoiceAsker(null);
  resetStore(newDoc({ name: 'Mine' }));
  scripts.set({ app: [], doc: [], docOn: false });
  syncCommands();
  setRunDepsForTests({ start: async (s) => runPlugin(s.code, { id: s.plugin.id }).transport });
  toasts.set([]);
});

afterEach(() => {
  setRunDepsForTests(null);
  setChoiceAsker(null);
  closeAll();
  vi.restoreAllMocks();
});

const made = (r: ReturnType<typeof createScript>) => ('script' in r ? r.script : (() => { throw new Error(r.why); })());

describe('scripts kept with the app', () => {
  it('are saved, come back at the next start, and are one command each', () => {
    const s = made(createScript('Make red', '// Turn it red\n1', 'app'));
    expect(getCommand(`script.${s.id}`)).toMatchObject({ label: 'Make red', category: 'Scripts', description: 'Turn it red' });
    scripts.set({ app: [], doc: [], docOn: false });
    syncCommands();
    expect(getCommand(`script.${s.id}`)).toBeUndefined();
    loadAppScripts();
    expect(findScript(s.id)).toMatchObject({ name: 'Make red', home: 'app', reviewed: true });
    expect(getCommand(`script.${s.id}`)?.label).toBe('Make red');
  });

  it('follow a rename, and go when deleted', () => {
    const s = made(createScript('Old', '1', 'app'));
    updateScript(s.id, { name: 'New name' });
    expect(getCommand(`script.${s.id}`)?.label).toBe('New name');
    deleteScript(s.id);
    expect(getCommand(`script.${s.id}`)).toBeUndefined();
    expect(allScripts()).toEqual([]);
  });

  it('never share a name', () => {
    made(createScript('Same', '1', 'app'));
    expect(made(createScript('Same', '2', 'app')).name).toBe('Same 2');
  });

  it('stop at a hundred', () => {
    for (let i = 0; i < 100; i++) made(createScript(`S${i}`, '1', 'app'));
    expect(createScript('One more', '1', 'app')).toMatchObject({ why: expect.stringContaining('100') });
  });
});

describe('scripts that travel with the drawing', () => {
  it('are saved inside the file and come back from it, never taken as reviewed', () => {
    const s = made(createScript('In the file', 'console.log(1)', 'doc'));
    expect(store().rootDoc().ext?.scripts).toMatchObject({ v: 1, items: [{ id: s.id, name: 'In the file', code: 'console.log(1)' }] });
    const reopened = loadFile(saveFile(store().rootDoc())).doc;
    store().load(reopened);
    const back = docScripts();
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: s.id, name: 'In the file', home: 'doc', reviewed: false });
  });

  it('leave an older file without any alone: nothing is added to a drawing that has none', () => {
    made(createScript('Mine', '1', 'app'));
    expect(store().rootDoc().ext?.scripts).toBeUndefined();
    expect(JSON.stringify(saveFile(store().rootDoc()).length)).toBeTruthy();
  });

  it('take the field away again when the last one is deleted', () => {
    const s = made(createScript('Only', '1', 'doc'));
    deleteScript(s.id);
    expect(store().rootDoc().ext?.scripts).toBeUndefined();
  });

  it('do not change Undo when they are added or edited', () => {
    const before = steps();
    const s = made(createScript('Quiet', '1', 'doc'));
    updateScript(s.id, { code: '2' });
    expect(steps()).toBe(before);
  });

  it('can move out of the drawing and into the app, where they are read as somebody else\'s', () => {
    const s = made(createScript('Moves', '1', 'doc'));
    expect(moveScript(s.id, 'app')).toEqual({ ok: true });
    expect(findScript(s.id)).toMatchObject({ home: 'app', reviewed: false });
    expect(store().rootDoc().ext?.scripts).toBeUndefined();
  });

  it('are on for their own author: the first one put into a drawing, and the changes made to it afterwards', () => {
    const s = made(createScript('Mine', 'console.log(1)', 'app'));
    expect(moveScript(s.id, 'doc')).toEqual({ ok: true });
    expect(scripts.get().docOn).toBe(true);
    expect(getCommand(`script.${s.id}`)?.label).toBe('Mine');
    updateScript(s.id, { code: 'console.log(2)' });
    // Reopened as it was saved: not a question.
    const doc = loadFile(saveFile(store().rootDoc())).doc;
    store().load(doc);
    scripts.set({ app: [], doc: [], docOn: false });
    return onDrawingOpened().then(() => {
      expect(scripts.get().docOn).toBe(true);
      expect(asked).toEqual([]);
    });
  });
});

describe('a drawing that arrives with scripts in it', () => {
  const arrive = (code = 'console.log(1)') => {
    // Made somewhere else: written into a drawing and read back, like a file sent by someone.
    const doc = newDoc({ name: 'Sent to me' });
    doc.id = 'sentdoc1';
    doc.ext = { scripts: { v: 1, items: [{ id: 'sfrom01', name: 'Theirs', code }] } };
    resetStore(doc);
    scripts.set({ app: [], doc: [], docOn: false });
  };

  it('are off, and no command is made for them, when nobody can be asked', async () => {
    arrive();
    await onDrawingOpened();
    expect(scripts.get().doc).toHaveLength(1);
    expect(scripts.get().docOn).toBe(false);
    expect(getCommand('script.sfrom01')).toBeUndefined();
    expect(canRun(scripts.get().doc[0])).toBe(false);
  });

  it('stay off when the answer is to leave them off', async () => {
    arrive();
    answerWith('off');
    await onDrawingOpened();
    expect(asked).toEqual([IN_FILES_CHOICE]);
    expect(scripts.get().docOn).toBe(false);
    expect(getCommand('script.sfrom01')).toBeUndefined();
  });

  it('are asked about each time, and turn on only for the drawing the answer was about', async () => {
    arrive();
    answerWith('on');
    await onDrawingOpened();
    expect(scripts.get().docOn).toBe(true);
    expect(getCommand('script.sfrom01')?.label).toBe('Theirs');
    // Another drawing: off again until asked.
    resetStore(newDoc({ name: 'Another' }));
    await onDrawingOpened();
    expect(scripts.get().docOn).toBe(false);
    expect(scripts.get().doc).toEqual([]);
    expect(getCommand('script.sfrom01')).toBeUndefined();
  });

  it('does not remember "turn them on" as a general answer', async () => {
    arrive();
    answerWith('on', true);
    await onDrawingOpened();
    expect(rememberedChoice(IN_FILES_CHOICE)).toBeUndefined();
  });

  it('is not asked again for the same drawing with the same scripts, and is asked again when they change', async () => {
    arrive();
    answerWith('on');
    await onDrawingOpened();
    expect(asked).toHaveLength(1);
    arrive();
    await onDrawingOpened();
    expect(asked).toHaveLength(1);
    expect(scripts.get().docOn).toBe(true);
    arrive('console.log("somebody changed this")');
    await onDrawingOpened();
    expect(asked).toHaveLength(2);
  });

  it('can be left off for good with one answer, and then it asks no more', async () => {
    arrive();
    answerWith('never', true);
    await onDrawingOpened();
    expect(rememberedChoice(IN_FILES_CHOICE)).toBe('never');
    expect(scripts.get().docOn).toBe(false);
    answerWith('on');
    asked.length = 0;
    arrive('another');
    await onDrawingOpened();
    expect(asked).toEqual([]);
    expect(scripts.get().docOn).toBe(false);
  });

  it('says so when they are left off, with a way to read them', async () => {
    arrive();
    answerWith('off');
    await onDrawingOpened();
    expect(toasts.get().some((t) => /scripts/i.test(t.message) && /off/i.test(t.message))).toBe(true);
  });

  it('will not run while they are off', async () => {
    arrive();
    await onDrawingOpened();
    const out = await runScript(scripts.get().doc[0]);
    expect(out).toBeNull();
    expect(toasts.get().some((t) => /scripts are off/i.test(t.message))).toBe(true);
  });

  it('is asked once, when the choice is made, where a new script should be kept', async () => {
    answerWith('doc', true);
    const s = await newScript('First', '1');
    expect(asked).toEqual([HOME_CHOICE]);
    expect(s?.home).toBe('doc');
    // The next one goes where it was said to go, without asking.
    asked.length = 0;
    const t = await newScript('Second', '1');
    expect(asked).toEqual([]);
    expect(t?.home).toBe('doc');
  });
});

describe('a script that came from somewhere else', () => {
  it('stops and asks first, and runs nothing when you say no', async () => {
    const s = made(createScript('Found it', 'await frameling.ui.notify("hi")', 'app', false));
    window.confirm = () => false;
    const before = steps();
    expect(await runScript(s)).toBeNull();
    expect(lastRun.get()).toBeNull();
    expect(steps()).toBe(before);
  });

  it('runs once when you say so, and is still marked afterwards', async () => {
    const s = made(createScript('Found it', 'await frameling.ui.notify("hi")', 'app', false));
    window.confirm = () => true;
    const out = await runScript(s);
    expect(out?.ok).toBe(true);
    expect(findScript(s.id)?.reviewed).toBe(false);
  });

  it('one you wrote runs without a question', async () => {
    const s = made(createScript('Mine', 'await frameling.ui.notify("hi")', 'app', true));
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    const out = await runScript(s);
    expect(out?.ok).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('is marked again when it is edited after being trusted from outside', () => {
    const s = made(createScript('Trusted', '1', 'app', true));
    updateScript(s.id, { reviewed: false });
    expect(findScript(s.id)?.reviewed).toBe(false);
    updateScript(s.id, { reviewed: true });
    expect(findScript(s.id)?.reviewed).toBe(true);
  });

  it('has a sheet that names what it presses and what it may not', () => {
    const look = lookAt(`await frameling.app.run('edit.duplicate');\nawait frameling.app.run('file.save');\nwhile (true) {}`, (id) => ['edit.duplicate', 'file.save'].includes(id));
    const w = lookWords({ name: 'Found it' }, look, (id) => ({ 'edit.duplicate': 'Duplicate', 'file.save': 'Save' })[id]);
    expect(w.message).toContain('came from somewhere else');
    expect(w.detail).toContain('Duplicate');
    expect(w.detail).toMatch(/file\.save.*aren't allowed/);
    expect(w.detail).toMatch(/loop that might never end/);
    expect(w.detail).toMatch(/one step in Undo/);
    expect(w.detail).not.toMatch(/[–—]/);
  });
});

void setDocOn;
