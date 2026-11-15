// The review page: one HTML file with the drawing's pictures, notes and marks inside it, and a small script that lets
// the person it is sent to leave notes, answers and marks and hand them back. It needs nothing else to open: no
// Frameling, no account, no network. Pure text in, text out, so it is easy to test. It carries only what a reviewer
// needs: no file path, no folder, no settings, nothing about the machine it was made on.
import script from './pageClient.js?raw';
import type { PageData } from './model';

/** Data inside a script block: `<` is written as < so nothing in a note can end the block or start a comment. */
export const safeJson = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const CSS = `
:root{color-scheme:light dark;--bg:#f5f4f8;--panel:#fff;--ink:#1d1b26;--soft:#5d5a6b;--line:#dcd9e6;--accent:#5b4bd6;--accent-ink:#fff;--pin:#2f6fed;--done:#2ec27e;--chk:#e6e3ee}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#17151f;--panel:#221f2d;--ink:#eeecf5;--soft:#a9a5ba;--line:#363247;--accent:#9b8cff;--accent-ink:#17151f;--pin:#6ea1ff;--chk:#2c2938}}
:root[data-theme=dark]{--bg:#17151f;--panel:#221f2d;--ink:#eeecf5;--soft:#a9a5ba;--line:#363247;--accent:#9b8cff;--accent-ink:#17151f;--pin:#6ea1ff;--chk:#2c2938}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:16px 16px 8px;max-width:1280px;margin:0 auto}
h1{margin:0;font-size:1.35rem}
header p{margin:4px 0 0;color:var(--soft)}
.badge{display:inline-block;margin-top:8px;padding:2px 10px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font-size:.85rem}
main{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;max-width:1280px;margin:0 auto;padding:8px 16px 16px}
@media (max-width:860px){main{grid-template-columns:1fr}}
section,aside{min-width:0}
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px}
button,input,textarea{font:inherit;color:inherit}
button{cursor:pointer}
.tool,.small,.big{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:6px 12px}
.tool[aria-pressed=true]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.quiet{background:transparent}
.big{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:600;padding:8px 16px}
button:disabled{opacity:.5;cursor:default}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.hint{color:var(--soft);font-size:.9rem;min-height:1.3em;margin:0 0 8px}
#stage{position:relative;width:100%;margin:0 auto;border:1px solid var(--line);border-radius:8px;overflow:hidden;background-color:var(--chk);background-image:linear-gradient(45deg,rgba(128,128,128,.18) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.18) 75%),linear-gradient(45deg,rgba(128,128,128,.18) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.18) 75%);background-size:20px 20px;background-position:0 0,10px 10px;touch-action:none}
#pic,#over{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none}
#over{pointer-events:none;touch-action:none}
#pins{position:absolute;inset:0;pointer-events:none}
.pin{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50% 50% 50% 4px;border:2px solid #fff;background:var(--pin);color:#fff;font-weight:700;font-size:.8rem;padding:0;pointer-events:auto!important;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.pin.done{background:var(--done)}
.pin.open{outline:3px solid var(--accent)}
#frames{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0 0}
#frames input[type=range]{flex:1 1 200px}
.side{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px}
.side h2{margin:0 0 8px;font-size:1.05rem}
ul{list-style:none;margin:0;padding:0}
.card{border:1px solid var(--line);border-radius:8px;padding:8px;margin:0 0 8px;background:var(--bg)}
.card.on,.card.open{border-color:var(--accent)}
.card.done .text{text-decoration:line-through;color:var(--soft)}
.cardhead{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.85rem;color:var(--soft)}
.num{width:24px;height:24px;border-radius:50%;border:0;background:var(--pin);color:#fff;font-weight:700;font-size:.75rem;padding:0}
.where{margin-left:auto}
.text{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.card textarea,.card input[type=text],#name{width:100%;border:1px solid var(--line);border-radius:6px;background:var(--panel);padding:6px 8px}
.row{display:flex;gap:6px;align-items:center;margin-top:6px}
.row input[type=text]{flex:1;min-width:0}
.answers{margin:6px 0 0;padding-left:10px;border-left:3px solid var(--line)}
.answers li{margin:4px 0;overflow-wrap:anywhere}
.answers small{display:block;color:var(--soft)}
.tick{white-space:nowrap;font-size:.9rem}
footer{position:sticky;bottom:0;background:var(--panel);border-top:1px solid var(--line);padding:10px 16px}
.send{max-width:1280px;margin:0 auto;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.send label{display:flex;gap:8px;align-items:center}
#name{width:14rem}
#tally{color:var(--soft)}
#said{margin:6px auto 0;max-width:1280px}
#said:empty{display:none}
details{max-width:1280px;margin:4px auto 0;font-size:.9rem}
#out{width:100%;height:7rem;font:12px/1.3 ui-monospace,monospace;border:1px solid var(--line);border-radius:6px;background:var(--bg);padding:6px}
[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;

const BODY = `
<header>
  <h1 id="docName"></h1>
  <p>A picture of the drawing to look at and leave comments on. You can't change the drawing, and nothing you do here goes anywhere until you send it back.</p>
  <span class="badge" id="version"></span>
</header>
<main>
  <section aria-label="The drawing">
    <div class="bar" id="tools" role="group" aria-label="Tools"></div>
    <p class="hint" id="toolHint" aria-live="polite"></p>
    <div id="stage"><img id="pic" alt="The drawing" draggable="false"><svg id="over" aria-hidden="true"></svg><div id="pins"></div></div>
    <div id="frames" hidden>
      <button type="button" class="small" id="play" aria-pressed="false">Play</button>
      <input type="range" id="scrub" min="0" value="0" aria-label="Frame">
      <span id="frameNo"></span>
    </div>
    <p class="hint" id="pinRow"><label><input type="checkbox" id="pinFrame"> New notes and marks belong to this frame only</label></p>
  </section>
  <aside class="side" aria-label="Notes">
    <h2>Notes (<span id="noteCount">0</span>)</h2>
    <p class="hint" id="none">No notes yet. Pick Note, then click the picture where it belongs.</p>
    <ul id="list"></ul>
  </aside>
</main>
<footer>
  <div class="send">
    <label>Your name <input type="text" id="name" maxlength="80" autocomplete="name" placeholder="So they know it's you"></label>
    <span id="tally" aria-live="polite"></span>
    <button type="button" class="big" id="saveBtn">Save my comments</button>
    <button type="button" class="small" id="copyBtn">Copy as text</button>
  </div>
  <p id="nameHint" class="hint" hidden style="max-width:1280px;margin-inline:auto">Add your name first, so they know who the comments are from.</p>
  <p id="said" role="status"></p>
  <details id="more"><summary>The text to send</summary><textarea id="out" readonly aria-label="Comments as text"></textarea></details>
</footer>
`;

/** The finished page. `theme` pins it to one look (the page otherwise follows the computer's). */
export function buildReviewPage(data: PageData, theme?: 'light' | 'dark'): string {
  const title = (data.doc.name || 'Drawing').replace(/[<>&"]/g, '');
  return (
    '<!doctype html>\n<html lang="en"' + (theme ? ` data-theme="${theme}"` : '') + '>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<meta name="generator" content="Frameling review page">\n<title>Review: ${title}</title>\n<style>${CSS}</style>\n</head>\n<body>\n${BODY}\n` +
    `<script type="application/json" id="review-data">${safeJson(data)}</script>\n<script>${script}</script>\n</body>\n</html>\n`
  );
}
