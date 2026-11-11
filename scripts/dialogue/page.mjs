// Builds brand/dialogue/index.html: every Quill line with where it shows, its screenshot and a box to edit it.
// The page is static (opens straight from disk), so the lines are baked in. Run after changing lines.json or the
// shots: `npm run dialogue:page` (dialogue:shots runs it too).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '../..');
const OUT = path.join(ROOT, 'brand/dialogue/index.html');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/ui/mascot/lines.json'), 'utf8'));
const manifestFile = path.join(ROOT, 'brand/dialogue/shots/manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};

const entries = Object.entries(lines)
  .filter(([id]) => !id.startsWith('$'))
  .map(([id, e]) => ({ id, text: e.text, where: e.where, vars: e.vars ?? [], shot: manifest[id]?.file ?? null, also: manifest[id]?.also ?? null, note: manifest[id]?.note ?? '' }));

// Keeps a stray </script> in a line from ending the data block.
const data = JSON.stringify(entries).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quill's lines</title>
<style>
:root {
  --bg: #f6f3ee; --card: #ffffff; --ink: #2a2433; --muted: #6c6478; --line: #e3ddd5; --gold: #f5c84c; --gold-ink: #2a2433;
  --changed: #fff4cf; --bad: #c4314b; --shot-bg: #1d1a24; --focus: #7b5cd6;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #17151c; --card: #221f29; --ink: #ece8f2; --muted: #a59eb3; --line: #34303d; --changed: #3a3220; --bad: #ff7a8f; --shot-bg: #110f15; --focus: #a990ff;
  }
}
:root[data-theme="dark"] { --bg: #17151c; --card: #221f29; --ink: #ece8f2; --muted: #a59eb3; --line: #34303d; --changed: #3a3220; --bad: #ff7a8f; --shot-bg: #110f15; --focus: #a990ff; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 14px 16px; }
.bar { max-width: 1200px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
h1 { font-size: 20px; margin: 0 12px 0 0; }
.count { color: var(--muted); font-size: 14px; }
.grow { flex: 1; }
input[type=search] { min-width: 0; width: 220px; max-width: 100%; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink); font: inherit; }
button { font: inherit; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; }
button.primary { background: var(--gold); color: var(--gold-ink); border-color: var(--gold); font-weight: 600; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, textarea:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.intro { max-width: 1200px; margin: 16px auto 0; padding: 0 16px; color: var(--muted); font-size: 14px; }
.intro code { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
main { max-width: 1200px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
.line { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.line.is-changed { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.line.is-hidden { display: none; }
.meta .id { font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tag { font: 600 11px system-ui, sans-serif; text-transform: uppercase; letter-spacing: .04em; background: var(--gold); color: var(--gold-ink); border-radius: 99px; padding: 1px 8px; }
.where { margin: 6px 0 10px; }
.note { color: var(--muted); font-size: 13px; margin: -4px 0 10px; }
.vars { color: var(--muted); font-size: 13px; margin-bottom: 6px; }
.vars b { font-family: ui-monospace, Menlo, monospace; color: var(--ink); }
textarea { width: 100%; min-height: 64px; resize: vertical; padding: 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font: inherit; }
.is-changed textarea { background: var(--changed); }
.hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
.warn { color: var(--bad); font-size: 13px; margin-top: 6px; }
.row { display: flex; gap: 8px; margin-top: 8px; }
.row button { padding: 4px 10px; font-size: 13px; }
.shot { background: var(--shot-bg); border-radius: 8px; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; overflow: hidden; min-height: 120px; }
.shot a { display: block; width: 100%; }
.shot img { display: block; width: 100%; height: auto; max-height: 420px; object-fit: contain; }
.shot .none { color: #a59eb3; font-size: 13px; padding: 20px; }
.toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 8px 16px; border-radius: 8px; opacity: 0; transition: opacity .2s; pointer-events: none; }
.toast.is-on { opacity: 1; }
@media (max-width: 760px) { .line { grid-template-columns: minmax(0, 1fr); } }
</style>
</head>
<body>
<header>
  <div class="bar">
    <h1>Quill's lines</h1>
    <span class="count" id="count"></span>
    <span class="grow"></span>
    <input type="search" id="filter" placeholder="Find a line" aria-label="Find a line">
    <label class="count"><input type="checkbox" id="onlyChanged"> Only changed</label>
    <button type="button" id="copyAll">Copy all</button>
    <button type="button" id="copyChanged">Copy my changes</button>
    <button type="button" class="primary" id="download">Download my changes</button>
  </div>
</header>
<p class="intro">Edit any line, then <b>Download my changes</b> and run <code>npm run dialogue:apply &lt;file&gt;</code> in the Frameling folder.
Words in <b>{curly}</b> brackets are filled in by the app, so keep them. Where a line is a list, put one item per line in the box (each is a bubble, or one of a set the app picks from).
Your edits stay in this browser until you reset them. Click a picture to see it full size.</p>
<main id="list"></main>
<div class="toast" id="toast" role="status"></div>
<script>
const LINES = ${data};
const KEY = 'quill-lines-draft';
let draft = {};
try { draft = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { draft = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch {} };
const asText = (t) => (Array.isArray(t) ? t.join('\\n') : t);
const fromBox = (e, v) => (Array.isArray(e.text) ? v.split('\\n').map((s) => s.trim()).filter(Boolean) : v.trim());
const vars = (t) => [...new Set((Array.isArray(t) ? t : [t]).flatMap((s) => [...s.matchAll(/\\{(\\w+)\\}/g)].map((m) => m[1])))].sort();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const list = document.getElementById('list');

for (const e of LINES) {
  const el = document.createElement('section');
  el.className = 'line';
  el.dataset.id = e.id;
  const isList = Array.isArray(e.text);
  el.innerHTML = \`
    <div class="meta">
      <div class="id">\${esc(e.id)}\${isList ? '<span class="tag">list</span>' : ''}</div>
      <p class="where">\${esc(e.where)}</p>
      \${e.note ? \`<p class="note">Picture: \${esc(e.note)}</p>\` : ''}
      \${e.vars.length ? \`<div class="vars">Keep: \${e.vars.map((v) => \`<b>{\${esc(v)}}</b>\`).join(' ')}</div>\` : ''}
      <textarea aria-label="Text for \${esc(e.id)}" rows="\${Math.min(14, Math.max(3, (isList ? e.text : [e.text]).reduce((n, t) => n + Math.ceil(t.length / 60), 0) + 1))}"></textarea>
      \${isList ? '<div class="hint">One per line.</div>' : ''}
      <div class="warn" hidden></div>
      <div class="row"><button type="button" class="reset" hidden>Put back the original</button></div>
    </div>
    <div class="shot">\${e.shot ? \`<a href="\${esc(e.shot)}" target="_blank" rel="noopener"><img src="\${esc(e.shot)}" alt="Where \${esc(e.id)} shows" loading="lazy"></a>\` : '<span class="none">No picture yet</span>'}\${e.also ? \`<a href="\${esc(e.also)}" target="_blank" rel="noopener"><img src="\${esc(e.also)}" alt="Also \${esc(e.id)}" loading="lazy"></a>\` : ''}</div>\`;
  const box = el.querySelector('textarea');
  const warn = el.querySelector('.warn');
  const reset = el.querySelector('.reset');
  box.value = e.id in draft ? asText(draft[e.id]) : asText(e.text);
  const update = () => {
    const v = fromBox(e, box.value);
    const changed = JSON.stringify(v) !== JSON.stringify(e.text);
    if (changed) draft[e.id] = v; else delete draft[e.id];
    el.classList.toggle('is-changed', changed);
    reset.hidden = !changed;
    const got = vars(v), want = [...e.vars].sort();
    const bad = JSON.stringify(got) !== JSON.stringify(want);
    const empty = Array.isArray(v) ? !v.length : !v;
    warn.hidden = !(bad || empty);
    warn.textContent = empty ? "This one can't be empty." : bad ? \`Needs exactly: \${want.length ? want.map((x) => '{' + x + '}').join(' ') : 'no {curly} words'}. Has: \${got.length ? got.map((x) => '{' + x + '}').join(' ') : 'none'}.\` : '';
    save();
    tally();
  };
  box.addEventListener('input', update);
  reset.addEventListener('click', () => { box.value = asText(e.text); update(); });
  list.appendChild(el);
  update();
}

function tally() {
  const n = Object.keys(draft).length;
  document.getElementById('count').textContent = \`\${LINES.length} lines, \${n} changed\`;
  document.getElementById('download').disabled = !n;
  document.getElementById('copyChanged').disabled = !n;
  applyFilter();
}

function applyFilter() {
  const q = document.getElementById('filter').value.trim().toLowerCase();
  const only = document.getElementById('onlyChanged').checked;
  for (const el of list.children) {
    const e = LINES.find((x) => x.id === el.dataset.id);
    const hay = (e.id + ' ' + e.where + ' ' + asText(e.text) + ' ' + el.querySelector('textarea').value).toLowerCase();
    el.classList.toggle('is-hidden', (q && !hay.includes(q)) || (only && !(e.id in draft)));
  }
}
document.getElementById('filter').addEventListener('input', applyFilter);
document.getElementById('onlyChanged').addEventListener('change', applyFilter);

function say(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(say.t);
  say.t = setTimeout(() => t.classList.remove('is-on'), 2200);
}
async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); say(what + ' copied'); }
  catch {
    const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); say(what + ' copied'); } catch { say("Couldn't copy here"); }
    a.remove();
  }
}
const changes = () => JSON.stringify(draft, null, 2) + '\\n';
document.getElementById('copyChanged').addEventListener('click', () => copy(changes(), 'Changes'));
document.getElementById('copyAll').addEventListener('click', () => {
  const all = {};
  for (const e of LINES) all[e.id] = e.id in draft ? draft[e.id] : e.text;
  copy(JSON.stringify(all, null, 2) + '\\n', 'Every line');
});
document.getElementById('download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([changes()], { type: 'application/json' }));
  const d = new Date();
  a.download = \`quill-lines-\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}.json\`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`Wrote ${path.relative(ROOT, OUT)} with ${entries.length} lines (${entries.filter((e) => e.shot).length} with pictures).`);
