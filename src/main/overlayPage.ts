// The stream overlay page: one small HTML file, one script and one stylesheet, served by the door's server (see
// overlayHandler.ts). Plain on purpose: no framework, no outside address, no inline script or style (the page's
// content policy allows only its own files), and every word is put in with textContent, never as markup, so nothing
// that reaches it can become code. It asks for /state a few times a second and draws what comes back. When there is
// nothing to draw, nothing is on the page at all: the background is transparent, so OBS shows what is underneath.
import { OVERLAY_POLL_MS } from '../shared/streamOverlay';

export const OVERLAY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Frameling overlay</title>
<link rel="stylesheet" href="overlay.css">
</head>
<body>
<div id="stage">
  <div id="chips" class="chips"></div>
  <div id="banner" class="card banner gone"><span class="tag">Challenge</span><span id="bannerText" class="txt"></span><span class="bar"><i id="bannerBar"></i></span></div>
  <div id="count" class="card count gone"><span id="countN" class="n"></span><span id="countT" class="t"></span></div>
  <div id="vote" class="card vote gone"><div id="voteQ" class="q"></div><ul id="voteList" class="list"></ul><div id="voteFoot" class="foot"></div></div>
  <div id="quill" class="quill gone"><div id="sprite" class="sprite"></div><div id="bubble" class="bubble"></div></div>
  <div id="prompt" class="card prompt gone"><span class="tag">Prompt</span><span id="promptText" class="txt"></span></div>
</div>
<script src="overlay.js"></script>
</body>
</html>
`;

export const OVERLAY_CSS = `:root {
  --text: #f4efe6;
  --raised: #322d43;
  --accent: #9b7bff;
  --line: #4a4360;
  --shade: rgba(0, 0, 0, 0.35);
}
:root.light {
  --shade: rgba(60, 50, 90, 0.2);
}
html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: transparent;
  font: 400 2.3vmin/1.35 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  color: var(--text);
}
#stage { position: fixed; inset: 0; pointer-events: none; }
.gone { display: none !important; }

.card {
  position: absolute;
  box-sizing: border-box;
  background: var(--raised);
  border: 0.25vmin solid var(--line);
  border-radius: 1.6vmin;
  box-shadow: 0 0.8vmin 2.4vmin var(--shade);
  opacity: 0;
  transform: translateY(1.2vmin) scale(0.98);
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.card.show { opacity: 1; transform: none; }
.tag {
  display: inline-block;
  padding: 0.2em 0.7em;
  border-radius: 99px;
  background: var(--accent);
  color: #15121f;
  font-weight: 700;
  font-size: 0.8em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.txt { font-weight: 600; }

.banner {
  top: 3vmin; left: 50%; width: min(56vw, 82vmin);
  margin-left: calc(min(56vw, 82vmin) / -2);
  display: flex; align-items: center; gap: 1.6vmin;
  padding: 1.6vmin 2.4vmin 2.2vmin;
  font-size: 1.15em;
  overflow: hidden;
}
.banner .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 0.7vmin; background: var(--line); }
.banner .bar i { display: block; height: 100%; width: 100%; background: var(--accent); transform-origin: left center; }

.count {
  top: 3vmin; right: 3vmin;
  display: flex; flex-direction: column; align-items: center;
  padding: 1.2vmin 3vmin;
  min-width: 14vmin;
}
.count .n { font-size: 9vmin; font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
.count .t { font-size: 0.95em; max-width: 36vmin; text-align: center; }
.count .t:empty { display: none; }
.count.over .n { color: var(--accent); }
.count.low .n { color: #ff7a7a; }

.chips { position: absolute; top: 3vmin; left: 3vmin; display: flex; flex-direction: column; gap: 1vmin; align-items: flex-start; }
.chip {
  display: inline-flex; align-items: center; gap: 1vmin;
  padding: 0.7vmin 1.8vmin;
  border-radius: 99px;
  background: var(--raised);
  border: 0.25vmin solid var(--line);
  box-shadow: 0 0.5vmin 1.6vmin var(--shade);
  font-weight: 600;
  animation: chipin 0.3s ease;
}
.chip::before { content: ""; width: 1.2vmin; height: 1.2vmin; border-radius: 50%; background: var(--accent); }
.chip b { font-weight: 700; font-variant-numeric: tabular-nums; opacity: 0.8; }
@keyframes chipin { from { opacity: 0; transform: translateX(-1.5vmin); } }

.prompt {
  bottom: 3vmin; right: 3vmin; width: min(46vw, 72vmin);
  display: flex; align-items: center; gap: 1.6vmin;
  padding: 1.6vmin 2.4vmin;
  font-size: 1.3em;
}
.prompt.pop { animation: pop 0.5s ease; }
@keyframes pop { 0% { transform: scale(0.94); } 60% { transform: scale(1.03); } 100% { transform: none; } }

.quill {
  position: absolute; left: 3vmin; bottom: 3vmin;
  display: flex; align-items: flex-end; gap: 1vmin;
  opacity: 0; transform: translateY(2vmin);
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.quill.show { opacity: 1; transform: none; }
.sprite { flex: none; background-repeat: no-repeat; image-rendering: pixelated; filter: drop-shadow(0 0.6vmin 0.8vmin var(--shade)); }
.bubble {
  position: relative;
  max-width: 44vmin;
  margin-bottom: 4vmin;
  padding: 1.2vmin 2vmin;
  background: var(--raised);
  border: 0.25vmin solid var(--line);
  border-radius: 1.6vmin;
  font-weight: 600;
  box-shadow: 0 0.6vmin 1.8vmin var(--shade);
}
.bubble:empty { display: none; }
.bubble.sign { font-style: italic; border-style: dashed; }
.bubble::before {
  content: ""; position: absolute; left: -0.9vmin; bottom: 1.6vmin; width: 1.4vmin; height: 1.4vmin;
  background: var(--raised); border-left: 0.25vmin solid var(--line); border-bottom: 0.25vmin solid var(--line);
  transform: rotate(45deg);
}

.vote {
  top: 50%; right: 3vmin; width: 40vmin;
  margin-top: -17vmin;
  padding: 1.8vmin 2.2vmin;
}
.vote .q { font-weight: 700; font-size: 1.1em; margin-bottom: 1.2vmin; }
.vote .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1vmin; }
.vote li { position: relative; overflow: hidden; border-radius: 0.9vmin; background: rgba(127, 127, 127, 0.18); padding: 0.8vmin 1.2vmin; display: flex; justify-content: space-between; gap: 1vmin; }
.vote li i { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--accent); opacity: 0.45; transition: width 0.4s ease; }
.vote li span { position: relative; font-weight: 600; }
.vote li b { position: relative; font-variant-numeric: tabular-nums; }
.vote li.win { outline: 0.3vmin solid var(--accent); }
.vote .foot { margin-top: 1.2vmin; font-size: 0.8em; opacity: 0.8; }
.vote .foot:empty { display: none; }
`;

export const OVERLAY_JS = `(function () {
  'use strict';
  var POLL_MS = ${OVERLAY_POLL_MS};
  var FOREVER = { eat: 1, nuzzle: 1, holding: 1, think: 1 };
  var FALLBACK = { eat: 'talk', nuzzle: 'idle', hop: 'cheer', holding: 'draw' };
  var $ = function (id) { return document.getElementById(id); };
  var el = { chips: $('chips'), banner: $('banner'), bannerText: $('bannerText'), bannerBar: $('bannerBar'), count: $('count'), countN: $('countN'), countT: $('countT'), vote: $('vote'), voteQ: $('voteQ'), voteList: $('voteList'), voteFoot: $('voteFoot'), quill: $('quill'), sprite: $('sprite'), bubble: $('bubble'), prompt: $('prompt'), promptText: $('promptText') };
  var skew = 0;
  var state = null;
  var sheet = null;
  var quillId = null;
  var promptId = null;
  var play = null;
  var raf = 0;

  function now() { return Date.now() + skew; }

  // Fades a block in or out. Out, it is taken off the page after the fade, so an idle overlay has nothing on it at all.
  function toggle(node, on) {
    if (on) {
      if (node._t) { clearTimeout(node._t); node._t = 0; }
      if (node.classList.contains('gone')) { node.classList.remove('gone'); void node.offsetWidth; }
      node.classList.add('show');
    } else if (node.classList.contains('show')) {
      node.classList.remove('show');
      node._t = setTimeout(function () { node.classList.add('gone'); node._t = 0; }, 400);
    }
  }
  function say(node, text) { if (node.textContent !== text) node.textContent = text; }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return s >= 60 ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : String(s);
  }

  function timeLeft(ms) { var c = clock(ms); return c.indexOf(':') >= 0 ? c : c + 's'; }

  function wear(theme) {
    var r = document.documentElement;
    if (!theme) { r.classList.remove('light'); return; }
    r.style.setProperty('--text', theme.text);
    r.style.setProperty('--raised', theme.raised);
    r.style.setProperty('--accent', theme.accent);
    r.style.setProperty('--line', theme.line);
    r.classList.toggle('light', !theme.dark);
  }

  // ---- Quill: the same sprite sheet the app uses, played from its frame list.
  function scale() { return Math.max(2, Math.round(window.innerHeight / 270)); }
  function pick(name) { return sheet.anims[name] ? name : (FALLBACK[name] && sheet.anims[FALLBACK[name]] ? FALLBACK[name] : 'idle'); }
  function start(name) {
    if (!sheet) return;
    var n = pick(name);
    play = { name: n, a: sheet.anims[n], t0: performance.now(), forever: !!FOREVER[name] };
  }
  function drawFrame() {
    raf = 0;
    if (!sheet || !play || !el.quill.classList.contains('show')) return;
    var t = performance.now() - play.t0, a = play.a, total = 0, i;
    for (i = 0; i < a.frames.length; i++) total += a.frames[i].ms;
    if (t >= total && !(play.forever && a.loop)) {
      if (play.forever) { t = total - 1; }
      else { play = { name: 'idle', a: sheet.anims.idle, t0: performance.now(), forever: true }; a = play.a; t = 0; total = 0; for (i = 0; i < a.frames.length; i++) total += a.frames[i].ms; }
    }
    var local = a.loop ? t % total : Math.min(t, total - 1), acc = 0, f = a.frames[a.frames.length - 1];
    for (i = 0; i < a.frames.length; i++) { acc += a.frames[i].ms; if (local < acc) { f = a.frames[i]; break; } }
    var k = scale();
    el.sprite.style.backgroundPosition = (-f.x * k) + 'px ' + (-f.y * k) + 'px';
    raf = requestAnimationFrame(drawFrame);
  }
  function sizeSprite() {
    if (!sheet) return;
    var k = scale();
    el.sprite.style.width = (sheet.frameW * k) + 'px';
    el.sprite.style.height = (sheet.frameH * k) + 'px';
    el.sprite.style.backgroundSize = (sheet.width * k) + 'px ' + (sheet.height * k) + 'px';
  }
  function loadSheet() {
    fetch('quill.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (meta) {
      if (!meta || !meta.anims || !meta.anims.idle) return;
      var img = new Image();
      img.onload = function () {
        sheet = { frameW: meta.frameW, frameH: meta.frameH, anims: meta.anims, width: img.naturalWidth, height: img.naturalHeight };
        el.sprite.style.backgroundImage = 'url("quill.png")';
        sizeSprite();
        paint();
      };
      img.src = 'quill.png';
    }).catch(function () { /* No Quill here: the words still show, he does not. */ });
  }

  // ---- Drawing what the state says, at the moment it is asked (a few times a second, and on every poll).
  function paint() {
    var t = now();
    var s = state;
    var q = s && s.quill && s.quill.until > t ? s.quill : null;
    var showQuill = !!q && (!!sheet || !!q.words);
    if (q) {
      if (q.id !== quillId) {
        quillId = q.id;
        start(q.anim);
        el.bubble.classList.remove('sign');
        if (q.sign) el.bubble.classList.add('sign');
      }
      say(el.bubble, q.words);
      el.sprite.style.display = sheet ? '' : 'none';
    } else {
      quillId = null;
    }
    toggle(el.quill, showQuill);
    if (showQuill && !raf) raf = requestAnimationFrame(drawFrame);

    var b = s && s.banner && s.banner.endsAt > t ? s.banner : null;
    if (b) {
      say(el.bannerText, b.text);
      var span = Math.max(1, b.endsAt - b.startedAt);
      el.bannerBar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, (b.endsAt - t) / span)) + ')';
    }
    toggle(el.banner, !!b);

    var c = s && s.countdown && s.countdown.until > t ? s.countdown : null;
    if (c) {
      var over = c.over || c.endsAt <= t;
      say(el.countN, over ? 'Time!' : clock(c.endsAt - t));
      say(el.countT, c.text);
      el.count.classList.toggle('over', over);
      el.count.classList.toggle('low', !over && c.endsAt - t <= 5000);
    }
    toggle(el.count, !!c);

    var chips = s ? s.chips.filter(function (x) { return x.endsAt > t; }) : [];
    while (el.chips.children.length > chips.length) el.chips.removeChild(el.chips.lastChild);
    chips.forEach(function (x, i) {
      var node = el.chips.children[i];
      if (!node) {
        node = document.createElement('div');
        node.className = 'chip';
        node.appendChild(document.createElement('span'));
        node.appendChild(document.createElement('b'));
        el.chips.appendChild(node);
      }
      say(node.firstChild, x.label);
      say(node.lastChild, Math.max(0, Math.ceil((x.endsAt - t) / 1000)) + 's');
    });

    var p = s && s.prompt ? s.prompt : null;
    if (p) {
      say(el.promptText, p.text);
      if (p.id !== promptId) {
        promptId = p.id;
        el.prompt.classList.remove('pop');
        void el.prompt.offsetWidth;
        el.prompt.classList.add('pop');
      }
    } else {
      promptId = null;
    }
    toggle(el.prompt, !!p);

    var v = s && s.vote ? s.vote : null;
    if (v) paintVote(v, t);
    toggle(el.vote, !!v);
  }

  function paintVote(v, t) {
    say(el.voteQ, v.question);
    var total = 0;
    v.options.forEach(function (o) { total += o.votes; });
    while (el.voteList.children.length > v.options.length) el.voteList.removeChild(el.voteList.lastChild);
    v.options.forEach(function (o, i) {
      var node = el.voteList.children[i];
      if (!node) {
        node = document.createElement('li');
        node.appendChild(document.createElement('i'));
        node.appendChild(document.createElement('span'));
        node.appendChild(document.createElement('b'));
        el.voteList.appendChild(node);
      }
      node.firstChild.style.width = (total ? Math.round((o.votes / total) * 100) : 0) + '%';
      say(node.children[1], o.label);
      say(node.lastChild, String(o.votes));
      node.classList.toggle('win', v.status === 'ended' && v.winner === i);
    });
    var foot = v.status === 'ended' ? (v.winner >= 0 ? 'Result: ' + v.options[v.winner].label + ' wins' : 'Result') : (v.endsAt ? timeLeft(v.endsAt - t) + ' left' : 'Voting is open');
    say(el.voteFoot, foot);
  }

  // ---- Asking.
  var failing = false;
  function poll() {
    fetch('state', { cache: 'no-store', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('no')); })
      .then(function (j) {
        failing = false;
        skew = (typeof j.now === 'number' ? j.now : Date.now()) - Date.now();
        state = j.state || null;
        wear(state && state.theme);
        paint();
      })
      .catch(function () {
        // The app is not there (the door is closed, or Frameling is not running): show nothing, and keep trying quietly.
        failing = true;
        state = null;
        paint();
      })
      .then(function () { setTimeout(poll, failing ? 2000 : POLL_MS); });
  }

  window.addEventListener('resize', sizeSprite);
  setInterval(paint, 100);
  loadSheet();
  poll();
})();
`;
