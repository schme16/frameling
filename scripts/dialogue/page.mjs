// Builds the dialogue review page: every Quill line with where it shows, its screenshot and a box to edit it.
//
//   npm run dialogue:page      brand/dialogue/index.html, opened straight from disk (pictures beside it)
//   npm run dialogue:publish   the same page with the pictures inside it, put on the board as the `quill-dialogue` doc
//   node scripts/dialogue/page.mjs --board    only write the board copy (brand/dialogue/quill-dialogue.board.html)
//
// The lines are baked in as a fallback. When the page opens it reads the live list from the repo, so the copy on the
// board never goes stale; see page-client.js for what it does from there. The logic that is shared with
// `dialogue:apply` (placeholders, the lines.json row shape, the board calls) lives in lines-tools.mjs and is copied in whole.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '../..');
const DIR = path.join(ROOT, 'brand/dialogue');
const args = process.argv.slice(2);
const forBoard = args.includes('--board') || args.includes('--put');
const outArg = args.indexOf('--out');
const OUT = outArg >= 0 ? path.resolve(args[outArg + 1]) : path.join(DIR, forBoard ? 'quill-dialogue.board.html' : 'index.html');
const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/ui/mascot/lines.json'), 'utf8'));
const manifestFile = path.join(DIR, 'shots/manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};

// On the board there are no files beside the page, so each picture goes inside it (as a small WebP when ImageMagick is there).
const cache = new Map();
function picture(rel) {
  if (!rel || !forBoard) return rel ?? null;
  if (cache.has(rel)) return cache.get(rel);
  const file = path.join(DIR, rel);
  let uri = null;
  if (fs.existsSync(file)) {
    try {
      const webp = execFileSync('convert', [file, '-quality', '82', 'webp:-'], { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      uri = `data:image/webp;base64,${webp.toString('base64')}`;
    } catch {
      uri = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    }
  }
  cache.set(rel, uri);
  return uri;
}

const entries = Object.entries(lines)
  .filter(([id]) => !id.startsWith('$'))
  .map(([id, e]) => ({ id, text: e.text, where: e.where, vars: e.vars ?? [], shot: picture(manifest[id]?.file), also: picture(manifest[id]?.also), note: manifest[id]?.note ?? '' }));

const builtAt = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
// Keeps a stray </script> in a line from ending the data block.
const data = JSON.stringify({ builtAt, entries }).replace(/</g, '\\u003c');
const tools = fs.readFileSync(path.join(here, 'lines-tools.mjs'), 'utf8').replace(/^export /gm, '');
const client = fs.readFileSync(path.join(here, 'page-client.js'), 'utf8');

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
h2.group { margin: 12px 0 -4px; font-size: 15px; color: var(--muted); font-weight: 600; letter-spacing: .02em; }
h2.group span { font-weight: 400; font-size: 13px; }
h2.group.is-hidden { display: none; }
.chip { font-size: 13px; padding: 2px 10px; border-radius: 99px; border: 1px solid var(--line); background: var(--card); color: var(--muted); white-space: nowrap; }
.chip.is-ok { border-color: #3f9b6a; color: var(--ink); }
.chip.is-ok::before { content: "\\2713 "; color: #3f9b6a; }
.chip.is-warn { border-color: var(--gold); color: var(--ink); }
.chip.is-busy { color: var(--ink); }
.line.is-bad { border-color: var(--bad); }
.soft { color: var(--muted); font-size: 13px; margin-top: 6px; }
.was { color: var(--muted); font-size: 13px; margin-top: 6px; }
details { margin-top: 8px; font-size: 13px; }
summary { cursor: pointer; color: var(--muted); }
details pre { margin: 6px 0 0; padding: 8px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; white-space: pre-wrap; word-break: break-word; font: 12px/1.45 ui-monospace, Menlo, monospace; color: var(--ink); }
.guide { max-width: 1200px; margin: 10px auto 0; padding: 0 16px; font-size: 14px; }
.guide summary { color: var(--ink); font-weight: 600; }
.guide ul { margin: 6px 0 0; padding-left: 20px; color: var(--muted); }
.guide code, .heldrow code { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
#held { max-width: 1200px; margin: 12px auto 0; padding: 12px 16px; border: 1px solid var(--gold); border-radius: 12px; background: var(--changed); font-size: 14px; }
.heldrow { margin: 6px 0; }
</style>
</head>
<body>
<header>
  <div class="bar">
    <h1>Quill's lines</h1>
    <span class="count" id="count"></span>
    <span class="chip" id="source">Reading the live lines</span>
    <span class="chip" id="sync"></span>
    <span class="grow"></span>
    <input type="search" id="filter" placeholder="Find a line" aria-label="Find a line">
    <label class="count"><input type="checkbox" id="onlyChanged"> Only changed</label>
    <button type="button" id="copyAll">Copy all</button>
    <button type="button" id="copyChanged">Copy my changes</button>
    <button type="button" id="download">Download my changes</button>
    <button type="button" class="primary" id="raise">Put these in the app</button>
  </div>
</header>
<p class="intro">Write over any line and it's kept as you go. When you're happy, <b>Put these in the app</b> raises a task on the board and Claude merges your words into <code>lines.json</code>.
Words in <b>{curly}</b> brackets are filled in by the app (a name, a theme), so keep them exactly. Where a line is a list, put one item per row. Click a picture to see it full size.</p>
<details class="guide"><summary>What happens to the words I write</summary>
<ul>
<li><b>One box, one line.</b> A single line stays a single line, and a line break you type inside it is kept as a break. Nothing else is touched.</li>
<li><b>A list is one row per item.</b> Each row is a bubble shown in turn, or one of a set the app picks from (the note under the name says which). Blank rows and spaces at the ends are dropped. Adding a row adds a bubble; a single line can't become a list, since that needs a code change.</li>
<li><b>{Curly} words must match.</b> The app swaps them for a name or a theme. If one is lost, added or misspelled, the line turns red and isn't sent, so the app never says "{name}" out loud. In a list, each word only has to turn up once across the rows.</li>
<li><b>Only the words change.</b> Where it shows and which {curly} words it takes stay as the app has them. A brand new line needs a code change and a picture, so ask for it as a task instead.</li>
<li><b>Open a changed line</b> and <i>What this becomes in lines.json</i> shows the exact row that gets written.</li>
<li><b>Safe if anything goes wrong.</b> Edits are kept in this browser and on the board. If the board can't be reached they stay in the browser, and <b>Download my changes</b> gives the file that <code>npm run dialogue:apply</code> takes.</li>
</ul></details>
<div id="held" hidden></div>
<main id="list"></main>
<div class="toast" id="toast" role="status"></div>
<script type="application/json" id="baked">${data}</script>
<script>
${tools}
${client}
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} with ${entries.length} lines (${entries.filter((e) => e.shot).length} with pictures, ${Math.round(html.length / 1024)} KB).`);

if (args.includes('--put')) {
  // Goes to the board as an ordinary doc update. pb must be signed in (pb login); no key is involved.
  const out = execFileSync('pb', ['doc', 'put', OUT, '--id', 'quill-dialogue', '--title', "Quill's dialogue: edit every line", '--format', 'html', '--note', 'Live page: reads the master list, saves as you go, raises the merge task'], { cwd: ROOT, encoding: 'utf8' });
  console.log(out.trim());
}
