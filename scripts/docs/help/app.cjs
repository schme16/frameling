// Help pictures and clips for the app shell: first run, welcome, help window, palette, preferences, themes, workspaces,
// panels, floating windows, the strips and menus, messages, examples, quests, sounds and shortcut sets.
// Steps are theme neutral: the runner picks the mode; nothing here sets a theme.
const { cmd, template, wait, js, key } = require('./_lib.cjs');

const F = '__frameling';
/** Open Preferences on a page. */
const prefsPage = (page) => js(`${F}.overlays.openPrefs(${JSON.stringify(page)})`);
/** Open the help window (contents, or a topic). */
const helpOpen = (topic) => js(`${F}.overlays.openHelp(${topic ? JSON.stringify(topic) : ''})`);
/** Mark the first element matching `sel` (that contains `text`, when given) so a shot can crop to it with el '[data-shot]'. */
const tag = (sel, text) =>
  js(`(() => { document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); const t = ${JSON.stringify(text ?? null)}; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => !t || e.textContent.includes(t)); if (!el) throw new Error('tag: nothing for ' + ${JSON.stringify(sel)} + ' ' + t); el.setAttribute('data-shot', '1'); return true; })()`);
/** Scroll an element (by selector and text) into view inside its scroller. */
const scrollTo = (sel, text, block = 'start') =>
  js(`(() => { const t = ${JSON.stringify(text ?? null)}; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => !t || e.textContent.includes(t)); if (!el) throw new Error('scrollTo: nothing for ' + ${JSON.stringify(sel)}); el.scrollIntoView({ block: ${JSON.stringify(block)} }); return true; })()`);
const CALM = { reduceMotion: true }; // dialogs pop in; with motion off they are settled the moment they open, whatever the machine's load
const shotEl = (pad = 12) => ({ shot: '@', el: '[data-shot]', pad });
// The hidden window only paints (and so only runs animations and settles layout) when a frame is taken, so take a
// throwaway one and wait before measuring an element to crop to.
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, wait(500)];
/** Settle, tag the element, and shoot it with padding. */
const shotOf = (sel, text, pad = 12) => [...settle, tag(sel, text), shotEl(pad)];


/** Click the first element matching `sel` that contains `text`. */
const clickText = (sel, text) =>
  js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!el) throw new Error('clickText: ' + ${JSON.stringify(text)}); el.click(); return true; })()`);
/** Press, glide through the points with the button held (slowly, so a clip shows it), pause, release. */
const dragSlow = (pts, { n = 8, after = 60, hold = 900 } = {}) => {
  const out = [{ down: pts[0], after: 120 }];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let k = 1; k <= n; k++) out.push({ held: [Math.round(ax + ((bx - ax) * k) / n), Math.round(ay + ((by - ay) * k) / n)], after });
  }
  const last = pts[pts.length - 1];
  out.push(wait(hold), { up: last, after: 150 });
  return out;
};
/** Press Quill's Next (or Let's go) button. */
const next = () => clickText('.ob-next', '');
/** Flip a switch by its label. */
const clickSwitch = (label) => js(`(() => { const el = document.querySelector('[role=switch][aria-label=' + JSON.stringify(${JSON.stringify(label)}) + ']'); if (!el) throw new Error('no switch ' + ${JSON.stringify(label)}); el.click(); return true; })()`);
/** Focus an input and type into it the way React notices. */
const focusType = (sel, text) =>
  js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('focusType: ' + ${JSON.stringify(sel)}); el.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

/** The "Opening Frameling the first time" picture as a DOM overlay in the app's own theme colours. The two system
 * boxes keep their own colours (they are not Frameling's). */
function installingDom() {
  const steps = (items) => items.map((t, i) => `<li><b>${i + 1}</b><span>${t}</span></li>`).join('');
  const html = `
<style>
#help-installing{position:fixed;left:40px;top:40px;width:1200px;height:550px;box-sizing:border-box;padding:28px 40px;background:var(--bg);color:var(--text);font-family:inherit;z-index:99999}
#help-installing h1{margin:0;font-size:32px;font-weight:700}
#help-installing .sub{margin:8px 0 0;font-size:19px;color:var(--muted)}
#help-installing .cols{display:flex;gap:40px;margin-top:22px}
#help-installing .card{flex:1;box-sizing:border-box;height:400px;padding:22px 24px;border:2px solid var(--line);border-radius:22px;background:var(--panel)}
#help-installing h2{margin:0 0 14px;font-size:22px;color:var(--sunny-deep, var(--chosen-bg))}
#help-installing ol{margin:0;padding:0;list-style:none}
#help-installing li{display:flex;align-items:center;gap:14px;margin:0 0 14px;font-size:19px}
#help-installing li b{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--chosen-bg);color:var(--chosen-fg);font-size:16px}
#help-installing .win{margin-top:20px;padding:20px 20px 16px;border-radius:8px;background:#1f4e8c;color:#fff;position:relative;height:170px;box-sizing:border-box}
#help-installing .win h3{margin:0 0 8px;font-size:21px}
#help-installing .win p{margin:0;font-size:17px;color:#dbe6f5;line-height:1.35}
#help-installing .win u{display:inline-block;margin-top:10px;font-size:17px;font-weight:600;color:#fff;text-decoration:none;border-bottom:3px solid #ffc94a}
#help-installing .win .btn{position:absolute;right:20px;bottom:16px;padding:9px 30px;border:2px solid #fff;border-radius:4px;font-size:17px;font-weight:600}
#help-installing .mac{margin-top:20px;padding:18px 20px;border-radius:8px;background:#e9e6f1;color:#26242d;position:relative;height:170px;box-sizing:border-box}
#help-installing .mac h3{margin:0;font-size:18px;line-height:1.4}
#help-installing .mac p{margin:14px 0 0;font-size:17px;color:#5b5766}
#help-installing .mac .btn{position:absolute;right:20px;bottom:16px;padding:9px 26px;border-radius:4px;background:#5b86e5;color:#fff;font-size:17px;font-weight:600}
</style>
<h1>Opening Frameling the first time</h1>
<p class="sub">It's signed, but not with a paid certificate yet, so your computer asks you to say it's OK, once.</p>
<div class="cols">
 <div class="card"><h2>On Windows</h2><ol>${steps(['Open the installer or the portable .exe.', 'On the blue box, click More info.', 'Click Run anyway.'])}</ol>
  <div class="win"><h3>Windows protected your PC</h3><p>Microsoft Defender SmartScreen prevented an unrecognised app from starting.</p><u>More info</u><span class="btn">Run anyway</span></div></div>
 <div class="card"><h2>On a Mac</h2><ol>${steps(['Open the .dmg, drag Frameling to Applications.', 'Right-click Frameling, choose Open, then Open.', 'Or: Privacy &amp; Security &rsaquo; Open Anyway.'])}</ol>
  <div class="mac"><h3>&ldquo;Frameling&rdquo; can&rsquo;t be opened because<br>Apple cannot check it for malicious software.</h3><p>System Settings &rsaquo; Privacy &amp; Security</p><span class="btn">Open Anyway</span></div></div>
</div>`;
  return `(() => { const d = document.createElement('div'); d.id = 'help-installing'; d.innerHTML = ${JSON.stringify(html)}; document.body.appendChild(d); return true; })()`;
}

const entries = [
  // Preferences, General: the Units row.
  {
    name: 'units',
    steps: [template('bouncing-ball'), prefsPage('general'), wait(1800), scrollTo('.ui-pref-row', 'Units', 'center'), wait(300), ...shotOf('.ui-pref-row', 'Units', 10)],
  },
  // The new-drawing chooser: the cards.
  {
    name: 'new-document-cards',
    prefs: CALM,
    steps: [template('bouncing-ball'), cmd('file.new'), wait(1300), ...shotOf('.ui-presets', null, 12)],
  },
  // The welcome sheet: cards and the start of the examples.
  {
    name: 'welcome',
    prefs: CALM,
    steps: [template('bouncing-ball'), js(`${F}.overlays.state.set((o) => ({ ...o, sheet: 'welcome' }))`), wait(1500), ...shotOf('.ui-welcome', null, 10)],
  },
  // The help window on its contents page.
  {
    name: 'using-help',
    prefs: CALM,
    steps: [template('bouncing-ball'), helpOpen(), wait(900), ...shotOf('.ui-help-modal', null, 10)],
  },
  // The command palette with a search typed.
  {
    name: 'command-palette',
    prefs: CALM,
    steps: [template('bouncing-ball'), cmd('view.commandPalette'), wait(700), { type: 'onion' }, wait(500), ...shotOf('.ui-palette', null, 12)],
  },
  // Preferences, Keyboard.
  {
    name: 'keyboard-shortcuts',
    prefs: CALM,
    steps: [template('bouncing-ball'), prefsPage('keyboard'), wait(900), ...shotOf('.ui-prefs', null, 10)],
  },
  // Preferences, General.
  {
    name: 'preferences',
    steps: [template('bouncing-ball'), prefsPage('general'), wait(1800), ...shotOf('.ui-prefs', null, 10)],
  },

  // Preferences, Features.
  {
    name: 'features',
    steps: [template('bouncing-ball'), prefsPage('features'), wait(1800), ...shotOf('.ui-prefs', null, 10)],
  },

  // The "Holding a drawing longer" question (the first time a hold is asked for).
  {
    name: 'behaviour-choice',
    prefs: CALM,
    steps: [template('bouncing-ball'), cmd('timeline.hold2'), wait(1200), ...shotOf('.ui-choice', null, 16)],
  },
  // Preferences, General: the top of the page (mode, theme, look).
  {
    name: 'look-and-feel',
    steps: [template('bouncing-ball'), prefsPage('general'), wait(1800), ...settle, { shot: '@', crop: [180, 70, 920, 340] }],
  },
  // Preferences, Themes: both groups of cards, the mode switch.
  {
    name: 'themes',
    prefs: CALM,
    steps: [template('bouncing-ball'), prefsPage('themes'), wait(1200), ...shotOf('.ui-prefs', null, 10)],
  },
  // The theme editor, opened on a copy of the theme in use ("Make my own theme" copies the one you are using).
  {
    name: 'theme-editor',
    prefs: CALM,
    steps: [template('bouncing-ball'), prefsPage('themes'), wait(1200), clickText('button', 'Make my own theme'), wait(1500), ...shotOf('.ui-prefs', null, 10)],
  },
  // Preferences, Workspaces: the built-ins, one in use, and two of your own.
  {
    name: 'workspaces',
    prefs: CALM,
    steps: [
      template('bouncing-ball'),
      js(`(() => { const d = ${F}.dock; d.applyWorkspace('draw'); d.floatPanel('preview', { x: 760, y: 120 }); d.saveWorkspace('Preview on the side'); d.applyWorkspace('draw'); d.placeTools('top'); d.saveWorkspace('Tools along the top'); d.applyWorkspace('animate'); return true; })()`),
      wait(600),
      prefsPage('workspaces'),
      wait(1200),
      ...shotOf('.ui-prefs', null, 10),
    ],
  },
  // Preferences, General scrolled to Sounds and Volume.
  {
    name: 'sounds',
    steps: [template('bouncing-ball'), prefsPage('general'), wait(1800), scrollTo('.ui-pref-row', 'Look', 'start'), wait(300), ...settle, ...shotOf('.ui-prefs', null, 10)],
  },
  // Preferences, Keyboard, with the Flash / Animate shortcut set picked.
  {
    name: 'shortcut-sets',
    prefs: { ...CALM, keymapSet: 'flash' },
    steps: [template('bouncing-ball'), prefsPage('keyboard'), wait(1200), focusType('input[type=search][aria-label="Search shortcuts"]', 'F5'), wait(500), ...shotOf('.ui-prefs', null, 10)],
  },
  // A drawn picture of what the first time looks like: the Windows and macOS "say it is OK" boxes, in the app's colours.
  {
    name: 'installing',
    width: 1200,
    steps: [template('bouncing-ball'), js(installingDom()), wait(400), ...settle, ...shotOf('#help-installing', null, 0)],
  },

  // The tool strip, with the tooltip on the Paint bucket.
  {
    name: 'tool-strip',
    prefs: CALM,
    steps: [template('bouncing-ball'), wait(800), { move: [76, 133] }, { move: [77, 134] }, wait(1500), ...settle, { shot: '@', crop: [0, 40, 380, 640] }],
  },
  // Two tools dragged: the eyedropper into the drawing group, then the pen into a group of its own between two others.
  {
    name: 'tool-arrange',
    prefs: CALM,
    steps: [
      template('bouncing-ball'),
      wait(1000),
      ...settle,
      { rec: '@', crop: [0, 40, 400, 640], every: 70 },
      wait(1200),
      ...dragSlow([[77, 183], [80, 160], [86, 134]], { n: 8, after: 70, hold: 1200 }),
      { move: [300, 500] },
      wait(1400),
      ...dragSlow([[35, 453], [46, 420], [56, 387]], { n: 8, after: 70, hold: 1200 }),
      { move: [300, 500] },
      wait(1400),
      // Then the new group gets a name: double-click the divider above it, type, Save.
      js(`(() => { const gap = document.querySelector('[data-tool-id="pen"]').closest('.ui-tool-group').previousElementSibling; gap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true; })()`),
      wait(900),
      { type: 'Pens', after: 900 },
      clickText('.ui-dock-rename button', 'Save'),
      { move: [300, 500] },
      wait(900),
      // Resting on the divider shows the name.
      { move: [56, 249] },
      { move: [57, 250] },
      wait(2200),
      { rec: 'stop' },
    ],
  },
  // The View menu open under the menu bar.
  {
    name: 'menus',
    prefs: CALM,
    steps: [template('bouncing-ball'), wait(800), { click: [255, 24] }, wait(900), ...settle, { shot: '@', crop: [120, 0, 470, 640] }],
  },
  // The strip at the bottom: zoom, size, speed, frame.
  {
    name: 'status-bar',
    prefs: CALM,
    steps: [template('bouncing-ball'), wait(800), ...settle, { shot: '@', crop: [0, 770, 760, 30] }],
  },
  // The drawing's name in the top bar, picked to rename, with the undo and redo buttons beside it.
  {
    name: 'document-name',
    prefs: CALM,
    steps: [template('bouncing-ball'), wait(800), { click: [926, 23] }, wait(500), ...settle, { shot: '@', crop: [560, 0, 720, 46] }],
  },
  // A little message with an Undo button: delete everything with Select All, Delete.
  {
    name: 'messages',
    prefs: CALM,
    steps: [
      template('bouncing-ball'),
      wait(800),
      key('v'),
      { click: [700, 380] },
      key('a', ['control']),
      wait(200),
      js(`window.__gone = ${F}.store().get().ui.selection.length`),
      key('Delete'),
      wait(500),
      js(`${F}.toast('Deleted ' + window.__gone + ' shapes.', { action: { label: 'Undo', run: () => ${F}.store().undo() } })`),
      wait(900),
      ...shotOf('.ui-toast', null, 22),
    ],
  },
  // The examples: the chooser scrolled to the cards.
  {
    name: 'examples',
    prefs: CALM,
    steps: [template('bouncing-ball'), js(`${F}.overlays.state.set((o) => ({ ...o, sheet: 'examples' }))`), wait(1500), ...shotOf('.ui-welcome', null, 10)],
  },
  // The Panels list on the right rail.
  {
    name: 'panels',
    prefs: CALM,
    steps: [template('bouncing-ball'), wait(800), clickText('[data-panels-button]', 'Panels'), wait(900), ...settle, wait(300), { shot: '@', crop: [760, 120, 520, 640] }],
  },
  // Stacked groups: Preview dragged off the rail to the bottom edge of the right side, then the line between them pulled.
  {
    name: 'panel-groups',
    prefs: CALM,
    steps: [
      template('bouncing-ball'),
      wait(1000),
      ...settle,
      { rec: '@', crop: [880, 40, 400, 760], every: 70 },
      wait(1200),
      ...dragSlow([[1233, 338], [1150, 480], [1090, 700], [1090, 712]], { n: 8, after: 70, hold: 1400 }),
      wait(1400),
      ...dragSlow([[1090, 404], [1090, 360], [1090, 290]], { n: 8, after: 70, hold: 500 }),
      { move: [600, 500] },
      wait(1800),
      { rec: 'stop' },
    ],
  },

  // Undo and redo: three strokes drawn, taken back one at a time, then put back.
  {
    name: 'undo',
    prefs: CALM,
    width: 800,
    steps: [
      template('blank-vector'),
      key('b'),
      wait(800),
      ...settle,
      { rec: '@', crop: [0, 0, 1280, 520], every: 80 },
      wait(500),
      js(`${F}.store().setUi({ color: '#ff4f8b' })`),
      { drag: [[240, 190], [400, 180], [560, 188], [700, 180]], steps: 8, delay: 14 },
      wait(300),
      js(`${F}.store().setUi({ color: '#ffa63d' })`),
      { drag: [[240, 270], [400, 262], [560, 270], [700, 262]], steps: 8, delay: 14 },
      wait(300),
      js(`${F}.store().setUi({ color: '#27c19a' })`),
      { drag: [[240, 350], [400, 342], [560, 350], [700, 342]], steps: 8, delay: 14 },
      wait(900),
      key('z', ['control']),
      wait(600),
      key('z', ['control']),
      wait(600),
      key('z', ['control']),
      wait(900),
      key('z', ['control', 'shift']),
      wait(600),
      key('z', ['control', 'shift']),
      wait(600),
      key('z', ['control', 'shift']),
      wait(1200),
      { rec: 'stop' },
    ],
  },

  // Quill's hello, step by step: hello, what you make, colours (looked at, not changed), settings, a name, the start.
  {
    name: 'first-run',
    steps: [
      template('bouncing-ball'),
      wait(500),
      js(`${F}.overlays.state.set((o) => ({ ...o, onboarding: true, sheet: null }))`),
      wait(1500),
      ...settle,
      { rec: '@', crop: [41, 16, 1198, 764], every: 100 },
      wait(3600),
      next(),
      wait(1800),
      clickText('.ob-card', 'Sketches'),
      wait(1800),
      clickText('.ob-card', 'Game sprites'),
      wait(2200),
      next(),
      wait(3200),
      next(),
      wait(3000),
      next(),
      wait(500),
      focusType('#ob-name-input', 'Bouncy Pancake'),
      wait(2600),
      next(),
      wait(2600),
      { rec: 'stop' },
    ],
  },
  // Quill's goodbye: Show Quill turned off on the settings step, then back on.
  {
    name: 'quill-goodbye',
    steps: [
      template('bouncing-ball'),
      wait(500),
      js(`${F}.overlays.state.set((o) => ({ ...o, onboarding: true, sheet: null }))`),
      wait(1500),
      next(),
      wait(700),
      next(),
      wait(700),
      next(),
      wait(1800),
      ...settle,
      { rec: '@', crop: [41, 16, 1198, 764], every: 100 },
      wait(1500),
      clickSwitch('Show Quill'),
      wait(6500),
      clickSwitch('Show Quill'),
      wait(3500),
      { rec: 'stop' },
    ],
  },

  // A quick tour: pick an example, play it, look at Export and Help, then draw on it.
  {
    name: 'tour',
    steps: [
      wait(500),
      cmd('file.new'),
      wait(1500),
      ...settle,
      { rec: '@', crop: [0, 0, 1280, 800], every: 100 },
      wait(2200),
      clickText('.ui-example', 'Bouncing ball'),
      wait(2000),
      cmd('timeline.play'),
      wait(3000),
      cmd('timeline.play'),
      wait(700),
      cmd('file.export'),
      wait(2800),
      key('Escape'),
      wait(800),
      cmd('help.contents'),
      wait(2500),
      key('Escape'),
      wait(800),
      key('b'),
      js(`${F}.store().setUi({ color: '#ff4f8b' })`),
      { drag: [[330, 170], [430, 130], [530, 170], [630, 135]], steps: 10, delay: 16 },
      wait(1800),
      { rec: 'stop' },
    ],
  },

  // Properties: the settings for what you are doing, as sections. Select a symbol and its sections lead; fold one; find a panel.
  {
    name: 'properties',
    prefs: CALM,
    width: 1000,
    steps: [
      template('bouncing-logo'),
      js(`${F}.store().setUi({ frame: 30 })`),
      key('v'),
      wait(1000),
      ...settle,
      { rec: '@', crop: [0, 0, 1280, 800], every: 100 },
      wait(2200),
      { click: [472, 278] },
      wait(2800),
      clickText('.rd-sec-toggle', 'Symbol and motion'),
      wait(1500),
      clickText('.rd-sec-toggle', 'Symbol and motion'),
      wait(1500),
      clickText('[data-panels-button]', 'Panels'),
      wait(1400),
      focusType('input[aria-label="Find a panel"]', 'glow'),
      wait(2200),
      key('Escape'),
      wait(1200),
      { rec: 'stop' },
    ],
  },

  // Floating windows: pop Preview out of the rail onto the canvas, group Lip sync with it, then move the window.
  {
    name: 'floating-windows',
    prefs: CALM,
    steps: [
      template('bouncing-ball'),
      wait(1000),
      ...settle,
      { rec: '@', crop: [0, 0, 1280, 800], every: 70 },
      wait(1200),
      ...dragSlow([[1233, 338], [1100, 320], [600, 235]], { n: 9, after: 70, hold: 1300 }),
      wait(1400),
      ...dragSlow([[1233, 290], [900, 250], [760, 233]], { n: 8, after: 70, hold: 1000 }),
      wait(1600),
      ...dragSlow([[860, 233], [700, 190], [540, 135]], { n: 9, after: 70, hold: 600 }),
      wait(1000),
      // Then the keyboard: Alt and Shift with the arrow keys on the window's grip make it bigger.
      js(`(() => { document.querySelector('.ui-float-grip').focus(); return true; })()`),
      wait(700),
      ...[1, 2, 3, 4].map(() => ({ key: 'Right', mods: ['alt', 'shift'], after: 260 })),
      ...[1, 2, 3].map(() => ({ key: 'Down', mods: ['alt', 'shift'], after: 260 })),
      wait(1800),
      { rec: 'stop' },
    ],
  },

  // The first quest: start it from the welcome sheet, open the Quests panel, and let "Show me" do the steps.
  {
    name: 'quests-first-steps',
    steps: [
      template('bouncing-ball'),
      js(`${F}.overlays.state.set((o) => ({ ...o, sheet: 'welcome' }))`),
      wait(1500),
      ...settle,
      { rec: '@', crop: [0, 0, 1280, 800], every: 100 },
      wait(2200),
      clickText('.ui-quest .ui-btn', 'Show me'),
      wait(2400),
      clickText('.rd-item', 'Quests'),
      wait(2200),
      clickText('.qb-go', ''),
      wait(2700),
      clickText('.qb-go', ''),
      wait(2700),
      clickText('.qb-go', ''),
      wait(2700),
      clickText('.qb-go', ''),
      wait(2700),
      { rec: 'stop' },
    ],
  },
];

module.exports = entries.map((e) => ({ ...e, steps: e.steps.flat() }));
