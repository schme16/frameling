// The review page's own script. page.mjs puts lines-tools.mjs (its `export`s taken off) in front of this, so
// placeholders(), checkEntry(), formatEntry(), createBoard() and friends are all in scope here.
(() => {
  const BAKED = JSON.parse(document.getElementById('baked').textContent);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // On the board (/d/<project>/<doc>) the page can reach the board it is on. From a file on disk it can't.
  const onBoard = /^https?:$/.test(location.protocol) && /^\/d\/[^/]+\//.test(location.pathname);
  const board = onBoard ? createBoard({ fetch: window.fetch.bind(window), base: '', project: decodeURIComponent(location.pathname.split('/')[2]) }) : null;

  // The words as the app has them. Replaced with the live copy once that has been read.
  let master = Object.fromEntries(BAKED.entries.map((e) => [e.id, { text: e.text, where: e.where, ...(e.vars.length ? { vars: e.vars } : {}) }]));
  const extra = Object.fromEntries(BAKED.entries.map((e) => [e.id, e]));

  const KEY = 'quill-lines-draft.v2';
  const LEGACY_KEY = 'quill-lines-draft';
  let draft = {}; // every edit, including ones not finished yet
  let held = {}; // edits for lines that no longer exist, or changed between one bubble and several
  let dirty = false; // edits the board hasn't got yet
  let boardOk = false;
  let sync = 'wait';

  const readLocal = () => {
    try {
      const v2 = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v2 && v2.v === 2) return { changes: v2.changes || {}, held: v2.held || {}, dirty: !!v2.dirty };
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (old && typeof old === 'object') return { changes: old, held: {}, dirty: true };
    } catch { /* private window, or nothing saved */ }
    return { changes: {}, held: {}, dirty: false };
  };
  const writeLocal = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 2, changes: draft, held, dirty })); } catch { /* still on the page and the board */ }
  };

  // ---- the little status chips ----
  const SYNC = {
    wait: ['Getting your saved edits', ''],
    saving: ['Saving', 'is-busy'],
    board: ['Saved on the board', 'is-ok'],
    browser: ['Saved in this browser only', 'is-warn'],
  };
  function setSync(kind, why) {
    sync = kind;
    const el = $('sync');
    el.textContent = SYNC[kind][0];
    el.className = 'chip ' + SYNC[kind][1];
    el.title = kind === 'browser' ? (board ? `The board didn't take it from here (${why || 'not signed in?'}). Your words are safe in this browser, and Download my changes still works.` : "Opened from a file, so there's no board to save to. Your words are kept in this browser.") : '';
  }
  let pulled = { ok: false, why: '' };
  function sayWhere() {
    const el = $('source');
    if (pulled.ok) {
      el.textContent = 'Lines read from the app just now';
      el.className = 'chip is-ok';
      el.title = `From the development branch on GitHub, ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Anything not pushed yet isn't here.`;
    } else {
      el.textContent = `Lines as of ${BAKED.builtAt}`;
      el.className = 'chip is-warn';
      el.title = `Couldn't read the live list (${pulled.why}), so this is the copy the page was built with. Your edits still save, and get checked against the live list next time.`;
    }
  }

  // ---- building the page ----
  const list = $('list');
  const rows = new Map(); // id -> { el, box, ... }
  const asBox = textToBox;
  const group = (id) => id.split('.')[0];
  const NAMES = { onboarding: 'First-run hello', quests: 'Quests', empty: 'Empty states', goodbye: 'Goodbye', pixel: 'Pixel workspace', about: 'About' };
  const nice = (g) => NAMES[g] || g.charAt(0).toUpperCase() + g.slice(1);

  function build() {
    list.textContent = '';
    rows.clear();
    let last = null;
    const ids = Object.keys(master).filter((id) => !id.startsWith('$'));
    const counts = ids.reduce((m, id) => ((m[group(id)] = (m[group(id)] || 0) + 1), m), {});
    for (const id of ids) {
      if (group(id) !== last) {
        last = group(id);
        const h = document.createElement('h2');
        h.className = 'group';
        h.dataset.group = last;
        h.innerHTML = `${esc(nice(last))} <span>${counts[last]}</span>`;
        list.appendChild(h);
      }
      list.appendChild(buildLine(id));
    }
    tally();
  }

  function buildLine(id) {
    const e = master[id];
    const x = extra[id] || {};
    const isList = Array.isArray(e.text);
    const vars = e.vars || [];
    const el = document.createElement('section');
    el.className = 'line';
    el.dataset.id = id;
    el.dataset.group = group(id);
    el.innerHTML = `
      <div class="meta">
        <div class="id">${esc(id)}${isList ? '<span class="tag">list</span>' : ''}</div>
        <p class="where">${esc(e.where)}</p>
        ${x.note ? `<p class="note">Picture: ${esc(x.note)}</p>` : ''}
        ${vars.length ? `<div class="vars">Keep: ${vars.map((v) => `<b>{${esc(v)}}</b>`).join(' ')}</div>` : ''}
        <textarea aria-label="Text for ${esc(id)}" rows="${Math.min(14, Math.max(3, (isList ? e.text : [e.text]).reduce((n, t) => n + Math.ceil(t.length / 60) + (t.split('\n').length - 1), 0) + 1))}"></textarea>
        ${isList ? '<div class="hint">One per line.</div>' : ''}
        <div class="warn" hidden></div>
        <div class="soft" hidden></div>
        <div class="was" hidden></div>
        <details class="becomes" hidden><summary>What this becomes in lines.json</summary><pre></pre></details>
        <div class="row"><button type="button" class="reset" hidden>Put back the app's words</button></div>
      </div>
      <div class="shot">${x.shot ? `<a href="${esc(x.shot)}" target="_blank" rel="noopener"><img src="${esc(x.shot)}" alt="Where ${esc(id)} shows" loading="lazy"></a>` : '<span class="none">No picture yet</span>'}${x.also ? `<a href="${esc(x.also)}" target="_blank" rel="noopener"><img src="${esc(x.also)}" alt="Also ${esc(id)}" loading="lazy"></a>` : ''}</div>`;
    const r = { el, id, isList, box: el.querySelector('textarea'), warn: el.querySelector('.warn'), soft: el.querySelector('.soft'), was: el.querySelector('.was'), becomes: el.querySelector('.becomes'), reset: el.querySelector('.reset') };
    rows.set(id, r);
    r.box.value = id in draft ? asBox(draft[id]) : asBox(e.text);
    r.box.addEventListener('input', () => {
      const v = boxToText(isList, r.box.value);
      if (same(v, master[id].text)) delete draft[id];
      else draft[id] = v;
      paint(r);
      edited();
    });
    r.reset.addEventListener('click', () => {
      r.box.value = asBox(master[id].text);
      delete draft[id];
      paint(r);
      edited();
    });
    paint(r);
    return el;
  }

  // One line's own look: changed or not, anything wrong, and what it would become.
  function paint(r) {
    const e = master[r.id];
    const v = boxToText(r.isList, r.box.value);
    const changed = !same(v, e.text);
    r.el.classList.toggle('is-changed', changed);
    r.reset.hidden = !changed;
    const problem = changed || !v.length ? problemsFor(r.id, e, v) : '';
    r.warn.hidden = !problem;
    r.warn.textContent = problem;
    r.el.classList.toggle('is-bad', !!problem);
    const notes = changed ? styleNotes(v) : [];
    r.soft.hidden = !notes.length;
    r.soft.textContent = notes.join(' ');
    r.was.hidden = !changed;
    r.was.textContent = changed ? 'The app says: ' + (Array.isArray(e.text) ? e.text.join(' / ') : e.text.replace(/\n/g, ' / ')) : '';
    r.becomes.hidden = !changed || !!problem;
    if (changed && !problem) r.becomes.querySelector('pre').textContent = formatEntry(r.id, { ...e, text: v }).trim();
  }

  const usable = () => usableChanges(master, draft);
  function tally() {
    const n = Object.keys(draft).length;
    const ready = Object.keys(usable()).length;
    $('count').textContent = `${Object.keys(master).filter((k) => !k.startsWith('$')).length} lines, ${n} changed${n > ready ? `, ${n - ready} not finished` : ''}`;
    for (const id of ['download', 'copyChanged']) $(id).disabled = !ready;
    $('raise').disabled = !ready;
    $('raise').textContent = board && boardOk ? 'Put these in the app' : 'Copy a task for the board';
    applyFilter();
    renderHeld();
  }

  function applyFilter() {
    const q = $('filter').value.trim().toLowerCase();
    const only = $('onlyChanged').checked;
    const shown = {};
    for (const [id, r] of rows) {
      const e = master[id];
      const hay = (id + ' ' + e.where + ' ' + asBox(e.text) + ' ' + r.box.value).toLowerCase();
      const hide = (q && !hay.includes(q)) || (only && !(id in draft));
      r.el.classList.toggle('is-hidden', hide);
      if (!hide) shown[group(id)] = true;
    }
    for (const h of list.querySelectorAll('h2.group')) h.classList.toggle('is-hidden', !shown[h.dataset.group]);
  }

  // Edits for lines that are gone, or changed shape: say so, show the words, let them go.
  function renderHeld() {
    const ids = Object.keys(held);
    const box = $('held');
    box.hidden = !ids.length;
    if (!ids.length) return;
    box.innerHTML = `<b>${ids.length} edit${ids.length === 1 ? '' : 's'} for lines the app no longer has</b> (renamed, removed, or turned from one bubble into several). They are kept here so the words aren't lost, and left out of what goes to the app.
      ${ids.map((id) => `<div class="heldrow"><code>${esc(id)}</code> ${esc(Array.isArray(held[id]) ? held[id].join(' / ') : held[id])}</div>`).join('')}
      <button type="button" id="dropHeld">Let go of these</button>`;
    $('dropHeld').addEventListener('click', () => { held = {}; writeLocal(); schedulePush(); tally(); });
  }

  // ---- saving as you go ----
  let timer = null;
  function edited() {
    dirty = true;
    writeLocal();
    tally();
    schedulePush();
  }
  function schedulePush() {
    if (!board || !boardOk) { if (sync !== 'wait') setSync('browser', pulledBoardWhy); return; }
    setSync('saving');
    clearTimeout(timer);
    timer = setTimeout(push, 700);
  }
  let pulledBoardWhy = '';
  async function push() {
    clearTimeout(timer);
    if (!board || !boardOk) return false;
    const r = await board.saveDraft(master, { ...held, ...draft });
    if (r.ok) { dirty = false; writeLocal(); setSync('board'); return true; }
    boardOk = false;
    pulledBoardWhy = r.why;
    setSync('browser', r.why);
    tally();
    return false;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) push(); });

  // ---- sending, copying, downloading ----
  function say(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(say.t);
    say.t = setTimeout(() => t.classList.remove('is-on'), 3600);
  }
  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); say(what + ' copied'); return true; } catch { /* try the old way */ }
    const a = document.createElement('textarea');
    a.value = text;
    document.body.appendChild(a);
    a.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* no clipboard here */ }
    a.remove();
    say(ok ? what + ' copied' : "Couldn't copy here");
    return ok;
  }
  const changesFile = () => JSON.stringify(usable(), null, 2) + '\n';
  $('copyChanged').addEventListener('click', () => copy(changesFile(), 'Changes'));
  $('copyAll').addEventListener('click', () => {
    const all = {};
    for (const id of Object.keys(master)) if (!id.startsWith('$')) all[id] = id in draft ? draft[id] : master[id].text;
    copy(JSON.stringify(all, null, 2) + '\n', 'Every line');
  });
  $('download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([changesFile()], { type: 'application/json' }));
    const d = new Date();
    a.download = `quill-lines-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('raise').addEventListener('click', async () => {
    const ready = usable();
    if (!Object.keys(ready).length) return;
    if (board && boardOk) {
      $('raise').disabled = true;
      await push();
      const r = await board.raiseTask(master, draft);
      $('raise').disabled = false;
      if (r.ok) {
        say(r.updated ? `Updated the waiting task (${r.id}) with your latest words.` : `Task raised on the board (${r.id}). Claude will put these in the app.`);
        return;
      }
      say(`The board wouldn't take a task from here (${r.why}). Copied it instead: paste it in as a new task.`);
    }
    await copy(`${mergeTask(master, ready).title}\n\n${mergeTask(master, ready).body}`, 'The task');
  });
  $('filter').addEventListener('input', applyFilter);
  $('onlyChanged').addEventListener('change', applyFilter);

  // ---- opening: read the live lines and the saved edits, then show ----
  (async function start() {
    setSync('wait');
    $('count').textContent = 'Getting the latest lines';
    const [m, b] = await Promise.all([
      pullMaster(window.fetch.bind(window)).then((lines) => ({ ok: true, lines }), (e) => ({ ok: false, why: e && e.message ? e.message : 'no answer' })),
      board ? board.loadDraft() : Promise.resolve({ ok: false, changes: {}, why: 'not on the board' }),
    ]);
    pulled = m;
    if (m.ok) master = Object.fromEntries(Object.entries(m.lines).filter(([id]) => !id.startsWith('$')));
    boardOk = !!b.ok;
    pulledBoardWhy = b.why || '';
    const local = readLocal();
    // Edits the board hasn't seen yet win over the board's copy; otherwise the board is the newer word.
    const saved = boardOk ? (local.dirty ? { ...b.changes, ...local.changes } : b.changes) : local.changes;
    const sorted = reconcile(master, { ...local.held, ...saved });
    draft = sorted.changes;
    held = Object.fromEntries([...sorted.orphans, ...sorted.wrongShape].map((id) => [id, { ...local.held, ...saved }[id]]));
    dirty = local.dirty || (boardOk && (sorted.merged.length > 0 || !same(Object.keys(b.changes).sort(), Object.keys({ ...draft, ...held }).sort())));
    writeLocal();
    sayWhere();
    build();
    if (boardOk) { setSync('board'); if (dirty) schedulePush(); } else setSync('browser', pulledBoardWhy);
    if (sorted.merged.length) say(`${sorted.merged.length} of your edit${sorted.merged.length === 1 ? ' is' : 's are'} already in the app now, so I've tidied ${sorted.merged.length === 1 ? 'it' : 'them'} away.`);
  })();
})();
