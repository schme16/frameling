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

/** The file's own shape: one entry per line when it's short, spread out when it isn't. Keeps diffs readable. */
export function formatLines(lines) {
  const val = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v));
  const parts = Object.entries(lines).map(([id, e]) => {
    const key = JSON.stringify(id);
    if (!e || typeof e !== 'object') return `  ${key}: ${JSON.stringify(e)}`;
    const fields = Object.entries(e);
    const one = `  ${key}: { ${fields.map(([k, v]) => `${JSON.stringify(k)}: ${val(v)}`).join(', ')} }`;
    if (one.length <= 200 && !Array.isArray(e.text)) return one;
    const body = fields.map(([k, v]) =>
      k === 'text' && Array.isArray(v) ? `    "text": [\n${v.map((t) => `      ${JSON.stringify(t)}`).join(',\n')}\n    ]` : `    ${JSON.stringify(k)}: ${val(v)}`,
    );
    return `  ${key}: {\n${body.join(',\n')}\n  }`;
  });
  return `{\n${parts.join(',\n')}\n}\n`;
}
