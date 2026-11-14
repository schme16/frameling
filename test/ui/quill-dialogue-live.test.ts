// The live dialogue page: how a line written in a box becomes what lines.json holds, the saved-edits rules, the board
// calls (against a pretend board), and the page itself run end to end in jsdom.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error jsdom has no type declarations here
import { JSDOM } from 'jsdom';
import data from '../../src/ui/mascot/lines.json';
import {
  boxToText, createBoard, formatEntry, formatLines, joinDraft, mergeTask, problemsFor, pullMaster, reconcile, splitDraft, styleNotes, textToBox, usableChanges,
  // @ts-expect-error plain JS helper
} from '../../scripts/dialogue/lines-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const master = Object.fromEntries(Object.entries(data).filter(([id]) => !id.startsWith('$'))) as Record<string, { text: string | string[]; where: string; vars?: string[] }>;
const ids = Object.keys(master);
const firstList = ids.find((id) => Array.isArray(master[id].text))!;
const withVar = ids.find((id) => master[id].vars?.length && !Array.isArray(master[id].text))!;
const plain = ids.find((id) => !master[id].vars?.length && !Array.isArray(master[id].text) && !String(master[id].text).includes('\n'))!;

describe('what you write against what lines.json holds', () => {
  it('every line survives going into a box and coming back out unchanged', () => {
    for (const id of ids) {
      const e = master[id];
      expect(boxToText(Array.isArray(e.text), textToBox(e.text)), id).toEqual(e.text);
    }
  });

  it('a list drops blank rows and trims; a single line keeps its own line breaks', () => {
    expect(boxToText(true, '  one  \n\n two\r\n   \nthree ')).toEqual(['one', 'two', 'three']);
    expect(boxToText(false, '  First\nSecond  ')).toBe('First\nSecond');
  });

  it('formatEntry is the row formatLines writes, for every line', () => {
    const file = formatLines(data);
    for (const id of ids) expect(file, id).toContain(formatEntry(id, master[id]));
  });

  it('shows a changed line as the exact row that would be written', () => {
    expect(formatEntry(plain, { ...master[plain], text: 'New words!' })).toBe(`  "${plain}": { "text": "New words!", "where": ${JSON.stringify(master[plain].where)} }`);
    const row = formatEntry(firstList, { ...master[firstList], text: ['One', 'Two'] });
    expect(row).toContain('"text": [\n      "One",\n      "Two"\n    ]');
  });

  it('says plainly what is wrong with a placeholder, and nothing when it is fine', () => {
    const e = master[withVar];
    const v = e.vars![0];
    expect(problemsFor(withVar, e, e.text)).toBe('');
    expect(problemsFor(withVar, e, 'No word here')).toBe(`Needs exactly: ${[...e.vars!].sort().map((x) => `{${x}}`).join(' ')}. Has: none.`);
    expect(problemsFor(withVar, e, `{${v}x} is typed wrong`)).toMatch(/Needs exactly/);
    expect(problemsFor(withVar, e, '')).toMatch(/can't be empty|Needs exactly/);
    expect(problemsFor(plain, master[plain], '{surprise}')).toBe('Needs exactly: no {curly} words. Has: {surprise}.');
  });

  it('leaves a gentle note about long dashes, and says nothing otherwise', () => {
    expect(styleNotes('Fine. Really fine!')).toEqual([]);
    expect(styleNotes('Hello — there')[0]).toMatch(/dashes/);
    expect(styleNotes(['ok', 'a – b']).length).toBe(1);
    expect(styleNotes('x')[0]?.includes('—')).toBeFalsy();
  });
});

describe('saved edits', () => {
  it('sorts them against the live list', () => {
    const draft = {
      [plain]: 'Changed',
      [firstList]: master[firstList].text, // already in the app
      'gone.line': 'A line that was removed',
      [withVar]: ['was one bubble, now several'],
    };
    const r = reconcile(master, draft);
    expect(r.changes).toEqual({ [plain]: 'Changed' });
    expect(r.merged).toEqual([firstList]);
    expect(r.orphans).toEqual(['gone.line']);
    expect(r.wrongShape).toEqual([withVar]);
  });

  it('keeps only what dialogue:apply would accept at the top, and the rest under $unfinished', () => {
    const draft = { [plain]: 'Changed', [withVar]: 'Lost its curly word', 'gone.line': 'x' };
    expect(usableChanges(master, draft)).toEqual({ [plain]: 'Changed' });
    const doc = splitDraft(master, draft);
    expect(doc[plain]).toBe('Changed');
    expect(doc.$unfinished).toEqual({ [withVar]: 'Lost its curly word', 'gone.line': 'x' });
    expect(joinDraft(doc)).toEqual(draft);
    expect(splitDraft(master, { [plain]: 'Changed' })).toEqual({ [plain]: 'Changed' });
  });

  it('the doc the page saves goes straight through dialogue:apply, with the unfinished part skipped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quill-live-'));
    const file = path.join(dir, 'lines.json');
    const changes = path.join(dir, 'draft.json');
    fs.writeFileSync(file, formatLines(data));
    fs.writeFileSync(changes, JSON.stringify(splitDraft(master, { [plain]: 'Saved from the page', [withVar]: 'no curly word' })));
    const out = execFileSync(process.execPath, [path.join(root, 'scripts/dialogue/apply.mjs'), changes], { env: { ...process.env, DIALOGUE_LINES: file, INIT_CWD: dir }, encoding: 'utf8' });
    expect(out).toMatch(/Updated 1 line/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))[plain].text).toBe('Saved from the page');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the merge task', () => {
  it('lists each line as it was, as it becomes, and the file to apply', () => {
    const t = mergeTask(master, { [plain]: 'Changed', [firstList]: ['A', 'B'] }, new Date(2026, 10, 14, 15, 5));
    expect(t.id).toBe('quill-lines-20261114-1505');
    expect(t.title).toBe('Put 2 edited Quill lines into lines.json');
    expect(t.tags).toEqual(['quill-lines']);
    expect(t.body).toContain(`### ${plain}`);
    expect(t.body).toContain('npm run dialogue:apply -- --board');
    expect(t.body).toContain(formatEntry(plain, { ...master[plain], text: 'Changed' }).trim());
    expect(JSON.parse(t.body.split('```json\n').pop()!.split('\n```')[0])).toEqual({ [plain]: 'Changed', [firstList]: ['A', 'B'] });
    expect(mergeTask(master, { [plain]: 'x' }).title).toBe('Put 1 edited Quill line into lines.json');
  });
});

// A pretend board: the same routes the page calls, with a doc and some tasks in memory.
function fakeBoard(opts: { signedIn?: boolean; doc?: unknown; tasks?: Array<{ id: string; tags: string[] }> } = {}) {
  const state = { doc: opts.doc as unknown, version: opts.doc ? 3 : 0, tasks: opts.tasks ?? [], calls: [] as string[], created: [] as unknown[], patched: [] as unknown[], saved: [] as unknown[] };
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const fetch = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method || 'GET';
    state.calls.push(`${method} ${url}`);
    if (opts.signedIn === false) return reply(200, '<html>Sign in</html>');
    if (/\/docs\/quill-lines-draft$/.test(url)) {
      if (method === 'GET') return state.doc === undefined ? reply(404, { error: 'no such doc' }) : reply(200, { id: 'quill-lines-draft', version: state.version, content: state.doc });
      const b = JSON.parse(init.body!);
      state.doc = b.content;
      state.version++;
      state.saved.push(JSON.parse(b.content));
      return reply(200, { id: 'quill-lines-draft', version: state.version });
    }
    if (/\/tasks\?status=todo$/.test(url)) return reply(200, state.tasks);
    if (/\/tasks$/.test(url) && method === 'POST') { state.created.push(JSON.parse(init.body!)); return reply(200, { id: 'x' }); }
    if (/\/tasks\//.test(url) && method === 'PATCH') { state.patched.push({ url, ...JSON.parse(init.body!) }); return reply(200, { id: 'x' }); }
    return reply(404, { error: 'nope' });
  };
  return { fetch, state };
}

describe('the board, as the page reaches it', () => {
  it('reads a missing draft as empty, and an existing one with its unfinished part joined in', async () => {
    const empty = fakeBoard();
    expect(await createBoard({ fetch: empty.fetch }).loadDraft()).toEqual({ ok: true, changes: {}, version: 0 });
    const full = fakeBoard({ doc: JSON.stringify({ a: 'one', $unfinished: { b: 'two' } }) });
    expect((await createBoard({ fetch: full.fetch }).loadDraft()).changes).toEqual({ a: 'one', b: 'two' });
  });

  it('saves the draft as the one doc, ready edits first', async () => {
    const b = fakeBoard();
    const r = await createBoard({ fetch: b.fetch }).saveDraft(master, { [plain]: 'Changed', [withVar]: 'oops' });
    expect(r.ok).toBe(true);
    expect(b.state.saved[0]).toEqual({ [plain]: 'Changed', $unfinished: { [withVar]: 'oops' } });
    expect(b.state.calls[0]).toBe('PUT /api/projects/frameling/docs/quill-lines-draft');
  });

  it('raises a task, or brings the one still waiting up to date instead of piling up a second', async () => {
    const fresh = fakeBoard();
    const made = await createBoard({ fetch: fresh.fetch }).raiseTask(master, { [plain]: 'Changed' }, new Date(2026, 10, 14, 9, 0));
    expect(made).toMatchObject({ ok: true, id: 'quill-lines-20261114-0900', updated: false });
    expect(fresh.state.created).toHaveLength(1);
    const waiting = fakeBoard({ tasks: [{ id: 'other', tags: ['gap'] }, { id: 'quill-lines-old', tags: ['quill-lines'] }] });
    const again = await createBoard({ fetch: waiting.fetch }).raiseTask(master, { [plain]: 'Changed again' });
    expect(again).toMatchObject({ ok: true, id: 'quill-lines-old', updated: true });
    expect(waiting.state.created).toHaveLength(0);
    expect(waiting.state.patched).toHaveLength(1);
  });

  it('says no, rather than pretending, when the board is not signed in for this page', async () => {
    const out = fakeBoard({ signedIn: false });
    const board = createBoard({ fetch: out.fetch });
    expect((await board.loadDraft()).ok).toBe(false);
    expect((await board.saveDraft(master, { [plain]: 'x' })).ok).toBe(false);
    expect((await board.raiseTask(master, { [plain]: 'x' })).ok).toBe(false);
    const down = createBoard({ fetch: async () => { throw new Error('offline'); } });
    expect(await down.loadDraft()).toMatchObject({ ok: false, why: 'offline' });
  });
});

describe('reading the live list', () => {
  const answer = (body: string, status = 200) => async () => ({ ok: status < 400, status, text: async () => body });
  it('takes a good list', async () => {
    expect(Object.keys(await pullMaster(answer(JSON.stringify(data))))).toContain(plain);
  });
  it('refuses something that is not the list, or a list with a broken line', async () => {
    await expect(pullMaster(answer('<html>', 200))).rejects.toThrow();
    await expect(pullMaster(answer('', 404))).rejects.toThrow(/404/);
    await expect(pullMaster(answer(JSON.stringify({ a: { text: 'hi' } })))).rejects.toThrow(/problems/);
  });
});

// The page itself, opened as if on the board, against the pretend board and a pretend GitHub.
describe('the page, end to end', () => {
  async function open(board: ReturnType<typeof fakeBoard>, opts: { live?: object | null; local?: Record<string, string> } = {}) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quill-page-')), 'page.html');
    execFileSync(process.execPath, [path.join(root, 'scripts/dialogue/page.mjs'), '--out', out], { encoding: 'utf8' });
    const html = fs.readFileSync(out, 'utf8');
    const live = opts.live === undefined ? data : opts.live;
    const clip: string[] = [];
    const dom = new JSDOM(html, {
      url: 'https://board.test/d/frameling/quill-dialogue',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(w: object) {
        const win = w as unknown as { fetch: unknown; localStorage: Storage; navigator: { clipboard?: unknown } };
        win.fetch = async (url: string, init?: object) => {
          if (/raw\.githubusercontent\.com/.test(url)) {
            if (live === null) throw new Error('offline');
            return { ok: true, status: 200, text: async () => JSON.stringify(live) };
          }
          return board.fetch(url, init as never);
        };
        if (opts.local) win.localStorage.setItem('quill-lines-draft', JSON.stringify(opts.local));
        Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async (t: string) => void clip.push(t) } });
      },
    });
    const w = dom.window;
    for (let i = 0; i < 60 && !w.document.querySelector('section.line'); i++) await new Promise((r) => setTimeout(r, 25));
    return { w, doc: w.document, clip };
  }
  const type = (w: Window, box: HTMLTextAreaElement, value: string) => {
    box.value = value;
    box.dispatchEvent(new (w as unknown as { Event: typeof Event }).Event('input', { bubbles: true }));
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const lineBox = (doc: Document, id: string) => doc.querySelector<HTMLTextAreaElement>(`section[data-id="${id}"] textarea`)!;

  it('pulls the live list, saves as you type, flags a lost placeholder and raises the task', async () => {
    const live = JSON.parse(JSON.stringify(data));
    live[plain].text = 'The app moved on since this page was built.';
    const board = fakeBoard();
    const { w, doc } = await open(board, { live });
    expect(doc.getElementById('source')!.textContent).toMatch(/read from the app just now/i);
    expect(lineBox(doc, plain).value).toBe('The app moved on since this page was built.');
    expect(doc.querySelectorAll('section.line').length).toBe(ids.length);
    expect(doc.querySelectorAll('h2.group').length).toBeGreaterThan(3);
    expect(doc.getElementById('sync')!.textContent).toBe('Saved on the board');

    type(w as never, lineBox(doc, plain), 'My better words.');
    expect(doc.querySelector(`section[data-id="${plain}"]`)!.classList.contains('is-changed')).toBe(true);
    expect(doc.querySelector(`section[data-id="${plain}"] .becomes pre`)!.textContent).toBe(formatEntry(plain, { ...master[plain], text: 'My better words.' }).trim());
    expect(doc.getElementById('sync')!.textContent).toBe('Saving');
    await wait(1000);
    expect(board.state.saved.at(-1)).toEqual({ [plain]: 'My better words.' });
    expect(doc.getElementById('sync')!.textContent).toBe('Saved on the board');

    // Losing a {curly} word is flagged, kept apart ("$unfinished"), and left out of the task.
    type(w as never, lineBox(doc, withVar), 'No curly word at all');
    expect(doc.querySelector(`section[data-id="${withVar}"] .warn`)!.textContent).toMatch(/^Needs exactly: /);
    await wait(1000);
    expect(board.state.saved.at(-1)).toEqual({ [plain]: 'My better words.', $unfinished: { [withVar]: 'No curly word at all' } });

    (doc.getElementById('raise') as HTMLButtonElement).click();
    await wait(300);
    expect(board.state.created).toHaveLength(1);
    const task = board.state.created[0] as { body: string };
    expect(task.body).toContain(plain);
    expect(task.body).not.toContain(`### ${withVar}`);
  });

  it('comes back tomorrow with the edits, and tidies away the ones the app already has', async () => {
    const board = fakeBoard({ doc: JSON.stringify({ [plain]: 'Waiting to go in', [firstList]: master[firstList].text, 'gone.line': 'Orphan words' }) });
    const { doc } = await open(board);
    expect(lineBox(doc, plain).value).toBe('Waiting to go in');
    expect(doc.getElementById('count')!.textContent).toMatch(/1 changed/);
    expect(doc.getElementById('held')!.hidden).toBe(false);
    expect(doc.getElementById('held')!.textContent).toContain('gone.line');
    await wait(1000);
    expect((board.state.saved.at(-1) as Record<string, unknown>)[firstList]).toBeUndefined();
  });

  it('works with no board and no connection: shows the built copy, keeps edits in the browser, says so', async () => {
    const board = fakeBoard({ signedIn: false });
    const { w, doc, clip } = await open(board, { live: null });
    expect(doc.getElementById('source')!.textContent).toMatch(/Lines as of/);
    expect(doc.getElementById('sync')!.textContent).toBe('Saved in this browser only');
    type(w as never, lineBox(doc, plain), 'Offline words');
    expect(JSON.parse(w.localStorage.getItem('quill-lines-draft.v2')!).changes[plain]).toBe('Offline words');
    expect(doc.getElementById('raise')!.textContent).toBe('Copy a task for the board');
    (doc.getElementById('raise') as HTMLButtonElement).click();
    await wait(100);
    expect(clip[0]).toContain('Put 1 edited Quill line into lines.json');
    (doc.getElementById('copyChanged') as HTMLButtonElement).click();
    await wait(50);
    expect(JSON.parse(clip[1])).toEqual({ [plain]: 'Offline words' });
  });

  it('picks up edits the old page kept in the browser', async () => {
    const board = fakeBoard({ signedIn: false });
    const { doc } = await open(board, { local: { [plain]: 'From the old page' } });
    expect(lineBox(doc, plain).value).toBe('From the old page');
  });
});
