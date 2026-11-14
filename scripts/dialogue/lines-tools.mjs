// Shared bits for Quill's lines (src/ui/mascot/lines.json): placeholder checks, merging an exported changes file
// back in, and writing the file in its tidy one-entry-per-line shape. Plain JS so node runs it without a build.

/** The {placeholders} in a line or list of lines, without repeats, sorted. */
export function placeholders(text) {
  const out = new Set();
  for (const t of Array.isArray(text) ? text : [text]) for (const m of String(t).matchAll(/\{(\w+)\}/g)) out.add(m[1]);
  return [...out].sort();
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Problems with one entry: missing text, or placeholders that don't match its `vars`. */
export function checkEntry(id, e) {
  const errors = [];
  if (!e || typeof e !== 'object') return [`${id}: not an entry`];
  const list = Array.isArray(e.text);
  if (!list && typeof e.text !== 'string') errors.push(`${id}: text must be words or a list of words`);
  else if (list && (!e.text.length || e.text.some((t) => typeof t !== 'string'))) errors.push(`${id}: a list needs at least one line, all words`);
  else if (!(list ? e.text : [e.text]).every((t) => t.trim())) errors.push(`${id}: a line is empty`);
  if (typeof e.where !== 'string' || !e.where) errors.push(`${id}: needs a "where"`);
  if (errors.length) return errors;
  const want = [...(e.vars ?? [])].sort();
  const got = placeholders(e.text);
  if (!same(want, got)) errors.push(`${id}: placeholders ${fmt(got)} don't match ${fmt(want)}`);
  return errors;
}

const fmt = (vs) => (vs.length ? vs.map((v) => `{${v}}`).join(' ') : 'none');

/** Every problem in a whole lines file. */
export function checkLines(lines) {
  return Object.entries(lines)
    .filter(([id]) => !id.startsWith('$'))
    .flatMap(([id, e]) => checkEntry(id, e));
}

/**
 * Merges a changes file into the lines. A change is `{ "id": "new words" }` or a list for a list entry (the review
 * page exports that shape; `{ "id": { "text": ... } }` works too). Returns the new lines (the input is untouched),
 * what changed, and any problems. Nothing should be written if there are problems.
 */
export function applyChanges(lines, changes) {
  const out = structuredClone(lines);
  const changed = [];
  const errors = [];
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { lines: out, changed, errors: ['The changes file should be an object of { "line id": "new words" }'] };
  for (const [id, raw] of Object.entries(changes)) {
    if (id.startsWith('$')) continue;
    const e = out[id];
    if (!e) {
      errors.push(`${id}: no such line (was it renamed?)`);
      continue;
    }
    const text = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.text : raw;
    if (Array.isArray(e.text) !== Array.isArray(text)) {
      errors.push(`${id}: should be ${Array.isArray(e.text) ? 'a list of lines' : 'a single line'}`);
      continue;
    }
    const next = { ...e, text: Array.isArray(text) ? text.map((t) => String(t)) : String(text) };
    // The placeholders have to stay what the code fills in.
    const problems = checkEntry(id, next);
    if (problems.length) {
      errors.push(...problems);
      continue;
    }
    if (JSON.stringify(e.text) === JSON.stringify(next.text)) continue;
    changed.push({ id, from: e.text, to: next.text });
    out[id] = next;
  }
  return { lines: out, changed, errors };
}

/** One entry exactly as lines.json holds it: one row when it's short, spread out when it isn't (or is a list). */
export function formatEntry(id, e) {
  const val = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v));
  const key = JSON.stringify(id);
  if (!e || typeof e !== 'object') return `  ${key}: ${JSON.stringify(e)}`;
  const fields = Object.entries(e);
  const one = `  ${key}: { ${fields.map(([k, v]) => `${JSON.stringify(k)}: ${val(v)}`).join(', ')} }`;
  if (one.length <= 200 && !Array.isArray(e.text)) return one;
  const body = fields.map(([k, v]) =>
    k === 'text' && Array.isArray(v) ? `    "text": [\n${v.map((t) => `      ${JSON.stringify(t)}`).join(',\n')}\n    ]` : `    ${JSON.stringify(k)}: ${val(v)}`,
  );
  return `  ${key}: {\n${body.join(',\n')}\n  }`;
}

/** The file's own shape: one entry per line when it's short, spread out when it isn't. Keeps diffs readable. */
export function formatLines(lines) {
  return `{\n${Object.entries(lines).map(([id, e]) => formatEntry(id, e)).join(',\n')}\n}\n`;
}

// ---- The live page: what you write in a box, what lines.json needs, and the board --------------------------------
// Everything below is plain JS with no imports, because page.mjs copies this whole file into the review page.

/** Where the master list is read from: the public repo's development branch. No key, and the host allows any site to read it. */
export const RAW_LINES_URL = 'https://raw.githubusercontent.com/schme16/frameling/development/src/ui/mascot/lines.json';
/** The board doc that holds edits not yet in the app: plain `{ "line id": "new words" }`, the file dialogue:apply takes. */
export const DRAFT_DOC = 'quill-lines-draft';
/** Tag on the board task that asks for the words to be merged. */
export const TASK_TAG = 'quill-lines';

/** A line as it sits in a writing box: a list is one item per row. */
export const textToBox = (text) => (Array.isArray(text) ? text.join('\n') : String(text));

/** The box back to what lines.json holds. A list drops blank rows and trims each; a single line keeps its own line breaks. */
export function boxToText(isList, value) {
  const v = String(value).replace(/\r\n?/g, '\n');
  return isList ? v.split('\n').map((s) => s.trim()).filter(Boolean) : v.trim();
}

/** Gentle notes about house style. These don't stop a save, since dialogue:apply doesn't refuse them either. */
export function styleNotes(text) {
  const all = (Array.isArray(text) ? text : [text]).join('\n');
  const notes = [];
  if (/[\u2014\u2013]/.test(all)) notes.push('No long dashes in what people read; a comma, full stop or colon does the job.');
  return notes;
}

/** Problems with the words in a box for this line, in plain words ('' when it's fine). */
export function problemsFor(id, entry, text) {
  const next = { ...entry, text };
  const found = checkEntry(id, next);
  if (!found.length) return '';
  const want = [...(entry.vars ?? [])].sort();
  const got = placeholders(text);
  if (!same(want, got)) return `Needs exactly: ${want.length ? want.map((x) => `{${x}}`).join(' ') : 'no {curly} words'}. Has: ${got.length ? got.map((x) => `{${x}}`).join(' ') : 'none'}.`;
  return "This one can't be empty.";
}

/**
 * Sorts saved edits against the master list as it is now. `changes` are the edits that still differ and fit; `merged` are
 * ones the app already has (so they can go); `orphans` are for a line that was renamed or removed; `wrongShape` turned a
 * single line into a list or back, which only a code change can do.
 */
export function reconcile(master, draft) {
  const out = { changes: {}, merged: [], orphans: [], wrongShape: [] };
  for (const [id, text] of Object.entries(draft ?? {})) {
    const e = master[id];
    if (id.startsWith('$') || !e) out.orphans.push(id);
    else if (text === null || text === undefined || Array.isArray(e.text) !== Array.isArray(text)) out.wrongShape.push(id);
    else if (JSON.stringify(e.text) === JSON.stringify(text)) out.merged.push(id);
    else out.changes[id] = text;
  }
  return out;
}

/** The edits that dialogue:apply would accept as they stand. */
export function usableChanges(master, changes) {
  return Object.fromEntries(Object.entries(changes).filter(([id, text]) => master[id] && !checkEntry(id, { ...master[id], text }).length));
}

/** Each edit with what it was, what it becomes, and the exact row lines.json would hold. */
export function describeChanges(master, changes) {
  return Object.entries(changes).map(([id, text]) => ({ id, from: master[id].text, to: text, row: formatEntry(id, { ...master[id], text }).trimEnd() }));
}

const quoted = (t) => (Array.isArray(t) ? t.map((x) => `  - ${x}`).join('\n') : `  ${t}`);

/** The board task that asks for the edits to go into lines.json. */
export function mergeTask(master, changes, now = new Date()) {
  const list = describeChanges(master, changes);
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const n = list.length;
  const body = [
    `${n} Quill line${n === 1 ? ' is' : 's are'} edited on the dialogue page and waiting to go into the app.`,
    '',
    'To merge (the draft doc always holds the latest, this list is a snapshot of when the task was raised):',
    '',
    '```',
    'npm run dialogue:apply -- --board --check   # see what changes, write nothing',
    'npm run dialogue:apply -- --board           # merge them into src/ui/mascot/lines.json',
    '```',
    '',
    'If the board is down, the same words are in the changes file at the bottom: save it and `npm run dialogue:apply <file>`.',
    'After the merge: `npm test`, retake the shots if the app changed (`dialogue:shots`), rebuild the page (`dialogue:page`, `dialogue:publish`), and mark this done.',
    '',
    '## What changes',
    '',
    ...list.flatMap((c) => [`### ${c.id}`, 'was:', quoted(c.from), 'now:', quoted(c.to), '', 'In lines.json:', '```json', c.row, '```', '']),
    '## Changes file',
    '',
    '```json',
    JSON.stringify(changes, null, 2),
    '```',
  ].join('\n');
  return { id: `quill-lines-${stamp}`, title: `Put ${n} edited Quill line${n === 1 ? '' : 's'} into lines.json`, body, tags: [TASK_TAG] };
}

/** Reads the master list. Resolves to the lines, or throws if it can't be reached in time. */
export async function pullMaster(doFetch, url = RAW_LINES_URL, timeoutMs = 7000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await doFetch(url, { cache: 'no-cache', signal: ctl?.signal });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const lines = JSON.parse(await res.text());
    if (!lines || typeof lines !== 'object' || Array.isArray(lines)) throw new Error('not a lines file');
    const problems = checkLines(lines);
    if (problems.length) throw new Error(`the file has problems (${problems[0]})`);
    return lines;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The board, as the page sees it from inside the board: same address, signed in as whoever opened the page, no key of
 * ours. Every call says plainly whether it worked; when it didn't, the page keeps the edits in the browser and says so.
 */
export function createBoard({ fetch: doFetch, base = '', project = 'frameling' }) {
  const api = `${base}/api/projects/${encodeURIComponent(project)}`;
  async function call(method, path, body) {
    try {
      const res = await doFetch(api + path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch { /* a login page, not the board's answer */ }
      // A sign-in page that comes back as 200 HTML is a no, not a yes.
      if (res.ok && (data === null || typeof data !== 'object')) return { ok: false, status: res.status, data, why: "the board didn't recognise this page as signed in" };
      return { ok: res.ok, status: res.status, data, why: res.ok ? '' : `the board answered ${res.status}` };
    } catch (e) {
      return { ok: false, status: 0, data: null, why: e && e.message ? e.message : 'no answer' };
    }
  }
  const doc = `/docs/${encodeURIComponent(DRAFT_DOC)}`;
  return {
    /** The saved edits: `{ ok, changes, version }`. A draft doc that doesn't exist yet counts as an empty one. */
    async loadDraft() {
      const r = await call('GET', doc);
      if (r.status === 404) return { ok: true, changes: {}, version: 0 };
      if (!r.ok) return { ok: false, changes: {}, version: 0, why: r.why };
      try {
        const raw = typeof r.data.content === 'string' ? JSON.parse(r.data.content) : r.data.content;
        return { ok: true, changes: raw && typeof raw === 'object' && !Array.isArray(raw) ? joinDraft(raw) : {}, version: r.data.version ?? 0 };
      } catch {
        return { ok: false, changes: {}, version: 0, why: 'the saved edits on the board are not readable' };
      }
    },
    /** Writes the edits (all of them, as the one draft doc: ready ones at the top, unfinished ones kept aside). */
    async saveDraft(master, changes, note = 'Saved from the dialogue page') {
      const r = await call('PUT', doc, { content: JSON.stringify(splitDraft(master, changes), null, 2) + '\n', format: 'json', title: "Quill's lines: edits waiting to go in", tags: [TASK_TAG], note });
      return { ok: r.ok, why: r.why };
    },
    /** Raises the merge task, or brings the one still waiting up to date. Resolves `{ ok, id, updated }`. */
    async raiseTask(master, changes, now = new Date()) {
      const task = mergeTask(master, usableChanges(master, changes), now);
      const open = await call('GET', '/tasks?status=todo');
      if (!open.ok) return { ok: false, why: open.why };
      const waiting = Array.isArray(open.data) ? open.data.find((t) => Array.isArray(t.tags) && t.tags.includes(TASK_TAG)) : null;
      const r = waiting
        ? await call('PATCH', `/tasks/${encodeURIComponent(waiting.id)}`, { title: task.title, body: task.body })
        : await call('POST', '/tasks', task);
      return { ok: r.ok, id: waiting ? waiting.id : task.id, updated: !!waiting, why: r.why };
    },
  };
}

/** Edits as the draft doc keeps them: what dialogue:apply can take at the top, anything not ready under "$unfinished". */
export function splitDraft(master, draft) {
  const ok = usableChanges(master, draft);
  const rest = Object.fromEntries(Object.entries(draft).filter(([id]) => !(id in ok)));
  return Object.keys(rest).length ? { ...ok, $unfinished: rest } : ok;
}

/** The other way: everything in a draft doc as one set of edits. */
export function joinDraft(doc) {
  const { $unfinished, ...rest } = doc && typeof doc === 'object' ? doc : {};
  return { ...(typeof $unfinished === 'object' && $unfinished && !Array.isArray($unfinished) ? $unfinished : {}), ...rest };
}
