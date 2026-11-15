// The review page's own script: it runs in the other person's browser, with no Frameling, no network and no libraries.
// It reads the drawing (pictures, notes, marks) from the JSON block in the page, lets them add notes, answers and marks,
// and hands back a small comments file. Plain, old-fashioned JavaScript on purpose. Never put a closing script tag in here.
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('review-data').textContent);
  var W = D.doc.width, H = D.doc.height, LEN = D.doc.length;
  var KEY = 'frameling-review:' + D.doc.id + ':' + D.sent;
  var PEN = '#2f6fed';
  var NS = 'http://www.w3.org/2000/svg';
  var st = { frame: 0, tool: 'look', justFrame: LEN > 1, playing: false, openId: null, name: '', mine: { notes: [], replies: [], marks: [], done: [] }, drag: null, sent: false };

  function store(get, v) {
    try { return get ? JSON.parse(localStorage.getItem(KEY) || 'null') : localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { return null; }
  }
  var saved = store(true);
  if (saved && typeof saved === 'object') {
    if (typeof saved.name === 'string') st.name = saved.name.slice(0, 80);
    if (saved.mine && Array.isArray(saved.mine.notes)) st.mine = { notes: saved.mine.notes, replies: saved.mine.replies || [], marks: saved.mine.marks || [], done: saved.mine.done || [] };
  }
  function keep() { store(false, { name: st.name, mine: st.mine }); }

  function uid(p) { return p + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 10); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function sv(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    return e;
  }
  var $ = function (id) { return document.getElementById(id); };
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function when(at) {
    if (!at) return '';
    try { return new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function who(by, at) { return [by || '', when(at)].filter(Boolean).join(', '); }

  // ---- what shows on a frame
  function shows(it, f) {
    if (it.pin === 'frame' && typeof it.frame === 'number') return it.frame === f;
    if (it.f) return it.f.indexOf(f) >= 0;
    return true;
  }
  function allNotes() { return D.notes.concat(st.mine.notes.filter(function (n) { return n.text && n.text.trim(); })); }
  function allMarks() { return D.marks.concat(st.mine.marks); }
  function answersOf(n) {
    var own = (n.replies || []).map(function (r) { return { r: r, mine: false }; });
    st.mine.replies.forEach(function (r) { if (r.note === n.id) own.push({ r: r, mine: true }); });
    return own;
  }
  function isDone(n) { return !!n.done || st.mine.done.indexOf(n.id) >= 0; }
  function isMineNote(n) { return st.mine.notes.indexOf(n) >= 0; }
  function whereOf(n) {
    if (n.pin === 'frame' && typeof n.frame === 'number') return 'Frame ' + (n.frame + 1);
    if (n.f) return n.f.length === 1 ? 'Frame ' + (n.f[0] + 1) : 'Some frames';
    return 'The whole drawing';
  }

  // ---- the picture
  var imgs = D.images.map(function (src) { var i = new Image(); i.src = src; return i; });
  var stage = $('stage'), pic = $('pic'), over = $('over'), pins = $('pins');
  stage.style.aspectRatio = W + ' / ' + H;
  // As wide as it can be, but never so tall that the frame slider and the send bar fall off the screen.
  stage.style.maxWidth = 'max(280px, min(' + Math.min(W * 2, 1100) + 'px, calc((100vh - 400px) * ' + (W / H) + ')))';
  if (D.pixelated) pic.style.imageRendering = 'pixelated';
  function picture() { pic.src = D.images[D.frames[st.frame]] || ''; }

  function halo(c) {
    var n = parseInt(c.slice(1).length === 3 ? c.slice(1).split('').map(function (x) { return x + x; }).join('') : c.slice(1, 7), 16);
    var lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum > 0.62 ? 'rgba(20,18,30,0.75)' : 'rgba(255,255,255,0.8)';
  }
  function smooth(p) {
    var n = p.length / 2;
    if (n === 1) return 'M' + p[0] + ' ' + p[1] + 'l0.01 0';
    if (n === 2) return 'M' + p[0] + ' ' + p[1] + 'L' + p[2] + ' ' + p[3];
    var d = 'M' + p[0] + ' ' + p[1];
    for (var i = 1; i < n - 1; i++) d += 'Q' + p[i * 2] + ' ' + p[i * 2 + 1] + ' ' + (p[i * 2] + p[i * 2 + 2]) / 2 + ' ' + (p[i * 2 + 1] + p[i * 2 + 3]) / 2;
    return d + 'L' + p[n * 2 - 2] + ' ' + p[n * 2 - 1];
  }
  function drawMark(m, k, ghost) {
    var color = m.color || '#ff3b5c', w = m.w || 3, p = m.pts, g = sv('g', ghost ? { opacity: '0.7' } : {}), d;
    function both(make) {
      [[halo(color), w + 3], [color, w]].forEach(function (s) { var e = make(); e.setAttribute('stroke', s[0]); e.setAttribute('stroke-width', s[1]); e.setAttribute('fill', 'none'); e.setAttribute('stroke-linecap', 'round'); e.setAttribute('stroke-linejoin', 'round'); g.appendChild(e); });
    }
    var s = p.map(function (v) { return v * k; });
    if (m.kind === 'circle') both(function () { return sv('ellipse', { cx: (s[0] + s[2]) / 2, cy: (s[1] + s[3]) / 2, rx: Math.max(0.5, Math.abs(s[2] - s[0]) / 2), ry: Math.max(0.5, Math.abs(s[3] - s[1]) / 2) }); });
    else if (m.kind === 'arrow') {
      var dx = s[0] - s[2], dy = s[1] - s[3], len = Math.hypot(dx, dy), head = '';
      if (len > 1e-6) {
        var base = Math.atan2(dy, dx), a = 26 * Math.PI / 180, l = Math.min(9 + w * 3, len * 0.6);
        head = 'M' + (s[2] + Math.cos(base + a) * l) + ' ' + (s[3] + Math.sin(base + a) * l) + 'L' + s[2] + ' ' + s[3] + 'L' + (s[2] + Math.cos(base - a) * l) + ' ' + (s[3] + Math.sin(base - a) * l);
      }
      d = 'M' + s[0] + ' ' + s[1] + 'L' + s[2] + ' ' + s[3] + head;
      both(function () { return sv('path', { d: d }); });
    } else if (m.kind === 'scribble') { d = smooth(s); both(function () { return sv('path', { d: d }); }); }
    else {
      var size = (18 + w * 4) * k, t = sv('text', { x: s[0], y: s[1], 'font-size': size, fill: color, stroke: halo(color), 'stroke-width': Math.max(2, size / 8), 'paint-order': 'stroke', 'stroke-linejoin': 'round', 'dominant-baseline': 'hanging', 'font-family': 'system-ui, sans-serif', 'font-weight': '600' });
      String(m.text || '').split('\n').forEach(function (line, i) { var ts = sv('tspan', { x: s[0], dy: i ? size * 1.25 : 0 }); ts.textContent = line || ' '; t.appendChild(ts); });
      g.appendChild(t);
    }
    var tip = who(m.by, m.at);
    if (tip) { var ti = sv('title'); ti.textContent = tip; g.appendChild(ti); }
    return g;
  }
  function drawOver() {
    var r = stage.getBoundingClientRect(), k = r.width / W;
    over.setAttribute('viewBox', '0 0 ' + r.width + ' ' + r.height);
    while (over.firstChild) over.removeChild(over.firstChild);
    allMarks().filter(function (m) { return shows(m, st.frame); }).forEach(function (m) { over.appendChild(drawMark(m, k, false)); });
    if (st.drag && st.drag.pts) over.appendChild(drawMark({ kind: st.drag.kind, pts: st.drag.pts, color: PEN, w: 3 }, k, true));
  }
  function drawPins() {
    while (pins.firstChild) pins.removeChild(pins.firstChild);
    var notes = allNotes();
    notes.forEach(function (n, i) {
      if (!shows(n, st.frame)) return;
      var b = h('button', { type: 'button', class: 'pin' + (isDone(n) ? ' done' : '') + (st.openId === n.id ? ' open' : ''), 'aria-label': 'Note ' + (i + 1), title: 'Note ' + (i + 1), text: String(i + 1), onclick: function (e) { e.stopPropagation(); focusNote(n.id); } });
      b.style.left = (n.x / W * 100) + '%';
      b.style.top = (n.y / H * 100) + '%';
      pins.appendChild(b);
    });
  }
  function focusNote(id) {
    st.openId = id;
    var n = allNotes().filter(function (x) { return x.id === id; })[0];
    if (n && !shows(n, st.frame)) setFrame(n.pin === 'frame' ? n.frame : (n.f ? n.f[0] : st.frame));
    drawPins();
    var c = document.querySelector('[data-note="' + id + '"]');
    if (c) { c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); c.classList.add('on'); setTimeout(function () { c.classList.remove('on'); }, 1200); }
  }

  // ---- the frames
  function setFrame(f) {
    st.frame = Math.max(0, Math.min(LEN - 1, f));
    picture();
    if ($('scrub')) { $('scrub').value = st.frame; $('frameNo').textContent = 'Frame ' + (st.frame + 1) + ' of ' + LEN; }
    drawOver(); drawPins();
  }
  var timer = null;
  function play() {
    st.playing = !st.playing;
    $('play').textContent = st.playing ? 'Pause' : 'Play';
    $('play').setAttribute('aria-pressed', String(st.playing));
    clearInterval(timer);
    if (st.playing) timer = setInterval(function () { setFrame(st.frame + 1 >= LEN ? 0 : st.frame + 1); }, 1000 / Math.max(1, Math.min(30, D.doc.fps || 12)));
  }

  // ---- the notes list
  function noteCard(n, i) {
    var mine = isMineNote(n), done = isDone(n), answers = answersOf(n);
    var card = h('li', { class: 'card' + (done ? ' done' : '') + (st.openId === n.id ? ' open' : ''), 'data-note': n.id });
    var head = h('div', { class: 'cardhead' }, [
      h('button', { type: 'button', class: 'num', 'aria-label': 'Show note ' + (i + 1) + ' on the picture', text: String(i + 1), onclick: function () { focusNote(n.id); } }),
      h('span', { class: 'who', text: (who(n.by, n.at) || (mine ? 'You' : 'Note')) }),
      h('span', { class: 'where', text: whereOf(n) }),
    ]);
    card.appendChild(head);
    if (mine) {
      var ta = h('textarea', { rows: '3', 'aria-label': 'Your note ' + (i + 1), placeholder: 'Write your note...' });
      ta.value = n.text;
      ta.addEventListener('input', function () { n.text = ta.value.slice(0, 4000); keep(); counts(); drawPins(); });
      ta.addEventListener('blur', function () { if (!n.text.trim()) { st.mine.notes.splice(st.mine.notes.indexOf(n), 1); keep(); all(); } else renderList(); });
      card.appendChild(ta);
      if (!n.text.trim()) setTimeout(function () { ta.focus(); }, 0);
    } else card.appendChild(h('p', { class: 'text', text: n.text }));
    if (answers.length) card.appendChild(h('ul', { class: 'answers', 'aria-label': 'Answers' }, answers.map(function (a) {
      return h('li', {}, [h('small', { text: who(a.r.by, a.r.at) || (a.mine ? 'You' : 'Answer') }), h('span', { text: a.r.text })]);
    })));
    var row = h('div', { class: 'row' });
    var inp = h('input', { type: 'text', placeholder: 'Answer...', 'aria-label': 'Answer note ' + (i + 1), maxlength: '4000' });
    var send = function () {
      var t = inp.value.trim();
      if (!t) return;
      st.mine.replies.push({ id: uid('r'), note: n.id, text: t, by: st.name || undefined, at: Date.now() });
      keep(); renderList(); counts();
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    row.appendChild(inp);
    row.appendChild(h('button', { type: 'button', class: 'small', text: 'Answer', onclick: send }));
    if (!mine) {
      var tick = h('label', { class: 'tick' }, [h('input', { type: 'checkbox', 'aria-label': 'Note ' + (i + 1) + ' is done' }), ' Done']);
      var cb = tick.firstChild;
      cb.checked = done;
      cb.disabled = !!n.done;
      if (n.done) tick.title = 'Already ticked off in the drawing';
      cb.addEventListener('change', function () {
        var at = st.mine.done.indexOf(n.id);
        if (cb.checked && at < 0) st.mine.done.push(n.id);
        if (!cb.checked && at >= 0) st.mine.done.splice(at, 1);
        keep(); renderList(); drawPins(); counts();
      });
      row.appendChild(tick);
    } else row.appendChild(h('button', { type: 'button', class: 'small quiet', text: 'Remove', onclick: function () { st.mine.notes.splice(st.mine.notes.indexOf(n), 1); st.mine.replies = st.mine.replies.filter(function (r) { return r.note !== n.id; }); keep(); all(); } }));
    card.appendChild(row);
    return card;
  }
  function renderList() {
    var list = $('list'), notes = allNotes(), shownEmpty = st.mine.notes.filter(function (n) { return !(n.text && n.text.trim()); });
    while (list.firstChild) list.removeChild(list.firstChild);
    notes.concat(shownEmpty).forEach(function (n, i) { list.appendChild(noteCard(n, i)); });
    $('none').hidden = notes.length + shownEmpty.length > 0;
    $('noteCount').textContent = String(notes.length);
  }

  // ---- what goes back
  function bundle() {
    var o = {
      format: 'frameling-review', doc: D.doc.id, from: st.name.trim() || 'A reviewer', sent: D.sent, made: Date.now(), length: LEN, sig: D.sig,
      notes: st.mine.notes.filter(function (n) { return n.text && n.text.trim(); }),
      replies: st.mine.replies, marks: st.mine.marks, done: st.mine.done,
    };
    if (D.board) o.board = D.board;
    return o;
  }
  function counts() {
    var b = bundle(), n = b.notes.length, r = b.replies.length, m = b.marks.length, d = b.done.length;
    var parts = [n && plural(n, 'note', 'notes'), r && plural(r, 'answer', 'answers'), m && plural(m, 'mark', 'marks'), d && d + ' ticked off'].filter(Boolean);
    $('tally').textContent = parts.length ? parts.join(', ') : 'Nothing to send yet';
    $('out').value = JSON.stringify(b);
    $('saveBtn').disabled = $('copyBtn').disabled = !parts.length;
  }
  function needName() {
    if (st.name.trim()) return false;
    $('name').focus();
    $('nameHint').hidden = false;
    return true;
  }
  function flash(msg) { var s = $('said'); s.textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(function () { s.textContent = ''; }, 6000); }
  function saveFile() {
    if (needName()) return;
    var text = JSON.stringify(bundle()), safe = (st.name.trim() + '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 30) || 'reviewer';
    var base = (D.doc.name || 'drawing').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'drawing';
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: base + '-comments-' + safe + '.json' });
    document.body.appendChild(a); a.click(); a.remove();
    flash('Saved. Send that file back to whoever sent you this page.');
  }
  function copyText() {
    if (needName()) return;
    var text = JSON.stringify(bundle());
    var fallback = function () { $('more').open = true; $('out').focus(); $('out').select(); flash('Copy the text in the box, then send it back to whoever sent you this page.'); };
    try { navigator.clipboard.writeText(text).then(function () { flash('Copied. Paste it in a message to whoever sent you this page.'); }, fallback); } catch (e) { fallback(); }
  }

  // ---- drawing on the picture
  function at(e) {
    var r = stage.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / r.width * W * 10) / 10, Math.round((e.clientY - r.top) / r.height * H * 10) / 10];
  }
  function pinOf() { return st.justFrame && LEN > 1 ? { pin: 'frame', frame: st.frame } : {}; }
  over.addEventListener('pointerdown', function (e) {
    if (st.tool === 'look' || e.button > 0) return;
    e.preventDefault();
    var p = at(e);
    if (st.tool === 'note') {
      var n = { id: uid('n'), x: p[0], y: p[1], text: '', by: st.name || undefined, at: Date.now() };
      if (D.board) n.board = D.board;
      var pn = pinOf(); if (pn.pin) { n.pin = pn.pin; n.frame = pn.frame; }
      st.mine.notes.push(n); st.openId = n.id; renderList(); drawPins();
      return;
    }
    st.drag = { kind: st.tool === 'sketch' ? 'scribble' : st.tool, pts: [p[0], p[1], p[0], p[1]] };
    if (st.tool === 'sketch') st.drag.pts = [p[0], p[1]];
    try { over.setPointerCapture(e.pointerId); } catch (err) { /* not everywhere */ }
  });
  over.addEventListener('pointermove', function (e) {
    if (!st.drag) return;
    var p = at(e), d = st.drag;
    if (d.kind === 'scribble') {
      var l = d.pts.length;
      if (Math.hypot(p[0] - d.pts[l - 2], p[1] - d.pts[l - 1]) >= Math.max(W, H) / 300 && l < 4000) d.pts.push(p[0], p[1]);
    } else { d.pts[2] = p[0]; d.pts[3] = p[1]; }
    drawOver();
  });
  function endDrag() {
    var d = st.drag; st.drag = null;
    if (!d) return;
    var p = d.pts, minLen = Math.max(W, H) / 60, xs = [], ys = [];
    for (var i = 0; i < p.length; i += 2) { xs.push(p[i]); ys.push(p[i + 1]); }
    var size = Math.hypot(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
    if (d.kind === 'scribble' && p.length < 4) size = 0;
    if (size >= minLen) {
      var m = { id: uid('m'), kind: d.kind, pts: p.map(function (v) { return Math.round(v * 10) / 10; }), color: PEN, by: st.name || undefined, at: Date.now() };
      if (d.kind === 'scribble' && m.pts.length > 4000) m.pts = m.pts.slice(0, 4000);
      var pn = pinOf(); if (pn.pin) { m.pin = pn.pin; m.frame = pn.frame; }
      if (D.board) m.board = D.board;
      st.mine.marks.push(m); keep(); counts();
    }
    drawOver();
  }
  over.addEventListener('pointerup', endDrag);
  over.addEventListener('pointercancel', endDrag);

  function setTool(t) {
    st.tool = t;
    over.style.pointerEvents = t === 'look' ? 'none' : 'auto';
    over.style.cursor = t === 'look' ? 'default' : 'crosshair';
    pins.style.pointerEvents = 'none';
    Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tool') === t)); });
    $('toolHint').textContent = { look: 'Looking. Pick a tool to leave a comment.', note: 'Click the picture where the note belongs.', arrow: 'Drag to draw an arrow.', circle: 'Drag to draw a circle round something.', sketch: 'Draw freehand on the picture.' }[t];
  }

  function all() { renderList(); drawOver(); drawPins(); counts(); }

  // ---- put it together
  $('docName').textContent = D.doc.name || 'Untitled drawing';
  $('version').textContent = 'Sent ' + new Date(D.sent).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + '. Your comments will say which version you looked at.';
  [['look', 'Look'], ['note', 'Note'], ['arrow', 'Arrow'], ['circle', 'Circle'], ['sketch', 'Sketch']].forEach(function (t) {
    $('tools').appendChild(h('button', { type: 'button', class: 'tool', 'data-tool': t[0], text: t[1], 'aria-pressed': 'false', onclick: function () { setTool(t[0]); } }));
  });
  $('tools').appendChild(h('button', { type: 'button', class: 'tool quiet', id: 'undoMark', text: 'Undo mark', onclick: function () { st.mine.marks.pop(); keep(); drawOver(); counts(); } }));
  if (LEN > 1) {
    $('frames').hidden = false;
    var sc = $('scrub'); sc.max = String(LEN - 1);
    sc.addEventListener('input', function () { setFrame(+sc.value); });
    $('play').addEventListener('click', play);
    $('pinFrame').checked = st.justFrame;
    $('pinFrame').addEventListener('change', function () { st.justFrame = $('pinFrame').checked; });
    document.addEventListener('keydown', function (e) {
      if (/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '') && e.target.id !== 'scrub') return;
      if (e.key === 'ArrowRight') setFrame(st.frame + 1); else if (e.key === 'ArrowLeft') setFrame(st.frame - 1);
    });
  } else $('pinRow').hidden = true;
  $('name').value = st.name;
  $('name').addEventListener('input', function () { st.name = $('name').value.slice(0, 80); $('nameHint').hidden = !!st.name.trim(); keep(); });
  $('saveBtn').addEventListener('click', saveFile);
  $('copyBtn').addEventListener('click', copyText);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(drawOver).observe(stage); else window.addEventListener('resize', drawOver);
  setTool('look');
  setFrame(0);
  all();
  window.__review = { state: st, bundle: bundle };
})();
