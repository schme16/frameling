// Builds the step files for the toolbar-custom pictures. Throwaway.
const fs = require('fs');
const out = process.argv[2];
const tpl = { eval: "__frameling.template('bouncing-ball')" };
const w = (ms) => ({ wait: ms });
const J = (s) => ({ eval: s });

// shared helpers, injected into the page
const LIB = `
window.mk = {
  names: { draw: 'Draw', extras: 'Colour and pixel extras', shapes: 'Shapes', select: 'Select and pen', rig: 'Rig and motion', view: 'View' },
  head(text, extra) {
    const h = document.createElement('div');
    h.className = 'mk-head';
    h.textContent = text;
    if (extra) h.dataset.extra = extra;
    return h;
  },
  css() {
    const s = document.createElement('style');
    s.textContent = \`
      .ui-tool-groups { width: 100%; }
      .mk-head { width: 100%; box-sizing: border-box; padding: 2px 8px 1px; font-size: 9.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
      .mk-menu { position: fixed; z-index: 9999; }
      .mk-tray { position: fixed; z-index: 9998; left: 112px; top: 54px; width: 292px; padding: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.35); color: var(--text, inherit); font-size: 12px; }
      .mk-tray h4 { margin: 0 0 6px; font-size: 13px; }
      .mk-tray p { margin: 0 0 10px; color: var(--muted); }
      .mk-tray .row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
      .mk-tray .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 999px; font-weight: 700; }
      .mk-tray .sw { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px; border: 1px dashed var(--line); }
      .mk-tray .sw.on { border-style: solid; }
      .mk-tray .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
      .mk-tray .seg span { padding: 4px 12px; font-weight: 700; }
      .mk-tray .seg span.on { background: var(--sunny); color: #1d1630; }
      .mk-tray .lbl { font-weight: 800; margin: 4px 0 4px; }
      .mk-tray .btns { display: flex; justify-content: space-between; margin-top: 4px; }
      .mk-tray .btn { padding: 6px 12px; border-radius: 999px; font-weight: 800; border: 1px solid var(--line); }
      .mk-tray .btn.go { background: var(--sunny); color: #1d1630; border-color: transparent; }
      .mk-handle { position: absolute; top: 2px; right: 3px; width: 8px; height: 8px; border-radius: 50%; background: var(--sunny); }
      .mk-div { position: relative; width: 100%; height: 14px; }
      .mk-div::before { content: ''; position: absolute; left: 10%; right: 10%; top: 6px; height: 2px; border-radius: 2px; background: color-mix(in srgb, var(--sunny) 55%, var(--line)); }
      .mk-div i { position: absolute; left: 50%; top: 0; transform: translateX(-50%); width: 14px; height: 14px; border-radius: 50%; background: var(--sunny); color: #1d1630; font: 800 11px/14px sans-serif; text-align: center; font-style: normal; }
      .mk-tool-edit { outline: 1px dashed color-mix(in srgb, var(--sunny) 70%, transparent); outline-offset: -2px; }
    \`;
    document.head.appendChild(s);
  },
  groups() { return [...document.querySelectorAll('.ui-tool-group')]; },
  gapOf(g) { return g.previousElementSibling && g.previousElementSibling.classList.contains('ui-tool-gap') ? g.previousElementSibling : null; },
  tool(id) { return document.querySelector('[data-tool-id="' + id + '"]'); },
  iconOf(id) { const t = mk.tool(id); return t ? t.innerHTML : ''; },
  menu(x, y, items) {
    const m = document.createElement('div');
    m.className = 'ui-menu ui-dock-menu mk-menu';
    m.style.left = x + 'px'; m.style.top = y + 'px';
    m.innerHTML = items.map((it) => {
      if (it === '-') return '<div class="ui-menu-sep" role="separator"></div>';
      if (it.head) return '<div class="ui-dock-menu-head">' + it.head + '</div>';
      return '<button type="button" class="ui-menu-item' + (it.off ? ' is-disabled' : '') + '"><span class="ui-menu-tick">' + (it.tick || '') + '</span><span class="ui-menu-label">' + it.t + '</span></button>';
    }).join('');
    document.body.appendChild(m);
    return m;
  },
};
mk.css();
true;
`;
// pretend every group has a heading
const HEADS = `
mk.groups().forEach((g) => {
  const id = g.dataset.toolGroup;
  const gap = mk.gapOf(g);
  const name = mk.names[id];
  if (name && g.parentNode) g.parentNode.insertBefore(mk.head(name), g);
});
true;
`;

const variants = {};

// 0: what is there today, all real. Rename Shapes to Blocking, give Star its own group, open a tool menu.
variants['0-today'] = [
  tpl, w(900),
  { rclick: [34, 318] }, w(300),
  J(`[...document.querySelectorAll('.ui-menu-item')].find(b=>b.textContent.includes('a new group')).click(); true`), w(500),
  J(`(() => { const g = document.querySelector('[data-tool-group="shapes"]'); const gap = g.previousElementSibling; gap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true; })()`), w(700),
  { type: 'Blocking' }, w(200),
  J(`[...document.querySelectorAll('.ui-dock-rename button')].find(b=>b.textContent.includes('Save')).click(); true`), w(600),
  { move: [400, 600] }, w(200),
  { shot: 'rail', crop: [0, 40, 440, 800] },
  { rclick: [34, 262] }, w(500),
  J(`(() => { const m = document.querySelector('.ui-dock-menu'); m.style.left = '112px'; m.style.top = '120px'; return true; })()`), w(300),
  { shot: 'menu', crop: [0, 40, 440, 800] },
];

// A: smallest honest. Names show, a divider is a group boundary, menu grows two lines.
variants['A-names-and-dividers'] = [
  tpl, w(900),
  J(`(() => {
    // Star in a group of its own with no name: it shows as a divider only
    return true; })()`),
  { rclick: [34, 318] }, w(300),
  J(`[...document.querySelectorAll('.ui-menu-item')].find(b=>b.textContent.includes('a new group')).click(); true`), w(500),
  J(LIB), J(HEADS), w(300),
  J(`(() => { const old = document.querySelector('.ui-dock-menu'); if (old) old.remove();
    const t = mk.tool('rect').getBoundingClientRect();
    mk.menu(112, t.top - 10, [
      { head: 'Rectangle' },
      { t: 'Move to Draw' }, { t: 'Move to Select and pen' }, { t: 'Move to another group...' },
      '-',
      { t: 'Start a new group here', tick: '' },
      { t: 'Divider above this tool', tick: '' },
      '-',
      { t: 'Rename Shapes...' },
      { t: 'Put the tools back', off: false },
    ]);
    return true; })()`), w(400),
  { shot: 'shot', crop: [0, 40, 440, 800] },
];

// B: the recommended shape. A, plus hide, fold one group, and a quiet way back.
variants['B-tidy'] = [
  tpl, w(900),
  { rclick: [34, 318] }, w(300),
  J(`[...document.querySelectorAll('.ui-menu-item')].find(b=>b.textContent.includes('a new group')).click(); true`), w(500),
  J(LIB), J(HEADS), w(200),
  J(`(() => {
    // two tools hidden
    ['gradient', 'shape-hints', 'weights'].forEach((id) => { const t = mk.tool(id); if (t) t.remove(); });
    // Select and pen folded to one button with a dot, like the stacked style
    const g = document.querySelector('[data-tool-group="select"]');
    const keep = mk.tool('select');
    [...g.querySelectorAll('[data-tool-id]')].forEach((b) => { if (b !== keep) b.remove(); });
    keep.classList.add('has-more');
    g.style.gridTemplateColumns = 'repeat(2, auto)';
    // a footer chip saying what is hidden
    const nav = document.querySelector('.ui-tools');
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ui-tool';
    chip.style.cssText = 'width:auto;height:auto;padding:5px 9px;font-size:11px;font-weight:800;border-radius:999px;margin:6px auto 0;color:var(--muted);border:1px dashed var(--line);background:transparent';
    chip.textContent = '3 hidden';
    nav.querySelector('.ui-tool-groups').appendChild(chip);
    return true; })()`), w(300),
  J(`(() => {
    const t = mk.tool('rect').getBoundingClientRect();
    mk.menu(112, t.top - 10, [
      { head: 'Rectangle' },
      { t: 'Move to...' },
      { t: 'Hide this tool' },
      '-',
      { t: 'Start a new group here' },
      { t: 'Fold this group into one button' },
      { t: 'Rename Shapes...' },
      '-',
      { t: '3 hidden: show them again...' },
      { t: 'Put the tools back' },
    ]);
    return true; })()`), w(400),
  { shot: 'shot', crop: [0, 40, 440, 800] },
];

// C: the full thing, an edit mode with a tray (a mock-up).
variants['C-builder'] = [
  tpl, w(900),
  { rclick: [34, 318] }, w(300),
  J(`[...document.querySelectorAll('.ui-menu-item')].find(b=>b.textContent.includes('a new group')).click(); true`), w(500),
  J(LIB), J(HEADS), w(200),
  J(`(() => {
    document.querySelectorAll('.ui-tool-group [data-tool-id]').forEach((b) => b.classList.add('mk-tool-edit'));
    document.querySelectorAll('.ui-tool-gap').forEach((g) => { const d = document.createElement('div'); d.className = 'mk-div'; d.innerHTML = '<i>+</i>'; g.replaceWith(d); });
    const hid = ['gradient', 'shape-hints', 'weights'];
    const tray = document.createElement('div');
    tray.className = 'mk-tray';
    const sw = (id, on) => '<span class="sw' + (on ? ' on' : '') + '">' + (mk.iconOf(id) || '') + '</span>';
    tray.innerHTML =
      '<h4>Change the tools</h4><p>Drag a tool to move it. Drag it here to put it away.</p>' +
      '<div class="lbl">Put away</div><div class="row">' + hid.map((id) => sw(id, false)).join('') + '<span class="sw"></span></div>' +
      '<div class="lbl">Add to the rail</div><div class="row"><span class="chip">+ Divider</span><span class="chip">+ Heading</span><span class="chip">+ Gap</span><span class="chip">+ Group</span></div>' +
      '<div class="lbl">Button size</div><div class="row"><span class="seg"><span>Small</span><span class="on">Medium</span><span>Large</span></span></div>' +
      '<div class="lbl">Group names</div><div class="row"><span class="seg"><span class="on">Show</span><span>Hide</span></span></div>' +
      '<div class="lbl">Rail style</div><div class="row"><span class="seg"><span class="on">Every tool</span><span>One per group</span><span>Mixed</span></span></div>' +
      '<div class="btns"><span class="btn">Put the tools back</span><span class="btn go">Done</span></div>';
    document.body.appendChild(tray);
    // a tool lifted, with a copy in a second group
    return true; })()`), w(400),
  { shot: 'shot', crop: [0, 40, 640, 800] },
];

for (const [k, steps] of Object.entries(variants)) fs.writeFileSync(`${out}/${k}.json`, JSON.stringify(steps));
console.log(Object.keys(variants).join(' '));
