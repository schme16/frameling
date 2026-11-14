// Help pictures and clips for tile collision shapes, custom values and terrains. See help-media.cjs for the entry format.
const { js, wait, key } = require('./_lib.cjs');

const F = '__frameling';
const away = { move: [640, 780] };
const setUi = (o) => js(`${F}.store().setUi(${JSON.stringify(o)})`);

/** Brings the picked tile's part of the Tileset panel (or one section of it) to the top of the panel's own scroll. */
const scrollProps = (sec) =>
  js(`(() => { const p = document.querySelector('.tz-panel'); const sc = p && p.closest('.rd-scroll'); const t = p && p.querySelector(${JSON.stringify(sec ? `.tz-sec[data-sec="${sec}"]` : '.tz-props')}); if (sc && t) sc.scrollTop += t.getBoundingClientRect().top - sc.getBoundingClientRect().top - 44; return true; })()`);

/** The first-time "workspace follows the drawing" question, if it shows: Never. */
const noFollow = js(`(() => { const d = document.querySelector('.ui-choice'); if (!d) return false; d.querySelectorAll('.ui-choice-opt')[2]?.click(); setTimeout(() => d.querySelector('.ui-btn-primary')?.click(), 100); return true; })()`);

const pickTile = (i) => js(`document.querySelectorAll('.tz-tile')[${i}]?.click()`);

/** A level to look at: the starter tileset, on a fresh tilemap layer for painting. */
const start = [js(`${F}.template('tileset')`), wait(600), js(`${F}.showPanel('tileset')`), wait(500)];

// While a tile is open at zoom 7 in this window, tile pixel (u, v) is at (454 + 7u, 213 + 7v).
const px = (u, v) => [Math.round(454 + 7 * u), Math.round(213 + 7 * v)];

const ledgeBtn = (text) => ({ clickOn: '.tz-sec[data-sec="collision"] .cv-action', text });
const toTop = js(`(() => { const p = document.querySelector('.tz-panel'); const sc = p && p.closest('.rd-scroll'); if (sc && p) sc.scrollTop += p.getBoundingClientRect().top - sc.getBoundingClientRect().top - 40; return true; })()`);
const onGround = js(`(() => { const st = ${F}.store(); const l = st.get().doc.layers.find((x) => x.name === 'Ground'); st.setUi({ activeLayerId: l.id, tool: 'tile-brush' }); })()`);
const CROP = [142, 46, 1042, 620];
/** Scrolls twice, a beat apart: the panel settles after a tile opens or closes. */
const settle = [wait(500), toTop, wait(400), toTop];

module.exports = [
  {
    // Drawing what a tile blocks, then seeing it over the level.
    name: 'tile-collision',
    prefs: { showTips: false },
    poster: 'last',
    steps: [
      ...start,
      onGround,
      pickTile(2),
      wait(400),
      toTop,
      away,
      wait(500),
      { rec: '@', crop: CROP, every: 70 },
      wait(1200),
      ledgeBtn('Box'),
      wait(1300),
      noFollow,
      wait(900),
      ...settle,
      { drag: [px(0, 0), px(16, 16)], steps: 6, delay: 40, after: 1200 },
      ...settle,
      wait(900),
      { clickOn: '.tz-done' },
      wait(1000),
      onGround,
      ...settle,
      away,
      wait(600),
      js(`${F}.run('tiles.showShapes')`),
      wait(1200),
      { clickOn: '.tz-sec[data-sec="collision"] .tz-check input' },
      away,
      wait(1500),
      pickTile(4),
      wait(700),
      toTop,
      wait(500),
      ledgeBtn('Shape'),
      wait(1300),
      ...settle,
      wait(300),
      { click: px(2, 16) },
      wait(500),
      { click: px(8, 3) },
      wait(500),
      { click: px(14, 16) },
      wait(700),
      { click: px(2, 16) },
      wait(1200),
      { clickOn: '.tz-done' },
      wait(1000),
      onGround,
      away,
      wait(2200),
      { rec: 'stop' },
    ],
  },
  {
    // A terrain: make the edge tiles, paint a blob, and the rim sorts itself out; erase a hole and it heals.
    name: 'tile-terrains',
    prefs: { showTips: false },
    poster: 'last',
    steps: (() => {
      // The map on the canvas: slot (c, r) is at (213 + (c + 0.5) * 29.67, 91 + (r + 0.5) * 29.67) in this window.
      const at = (c, r) => [Math.round(213.3 + (c + 0.5) * 29.67), Math.round(91 + (r + 0.5) * 29.67)];
      const row = (r, a, b) => ({ drag: [at(a, r), at(b, r)], steps: 5, delay: 45, after: 450 });
      const termSec = (txt) => ({ clickOn: '.tz-sec[data-sec="terrain"] .cv-action', text: txt });
      return [
        ...start,
        js(`${F}.run('tiles.addLayer')`),
        wait(500),
        js(`${F}.run('view.fit')`),
        wait(500),
        js(`(() => { const st = ${F}.store(); st.update('Hide', (d) => { for (const l of d.layers) if (l.name !== 'Tiles') l.visible = false; }); })()`),
        wait(400),
        scrollProps('terrain'),
        away,
        wait(600),
        { rec: '@', crop: CROP, every: 70 },
        wait(1000),
        termSec('Add a terrain'),
        wait(900),
        js(`${F}.tiles.renameTerrain(1, 'Grass')`),
        wait(900),
        scrollProps('terrain'),
        wait(600),
        { clickOn: 'button[aria-label="Make edge tiles for Grass"]' },
        wait(1500),
        away,
        wait(500),
        row(3, 4, 9),
        row(4, 3, 10),
        row(5, 3, 10),
        row(6, 4, 9),
        wait(500),
        row(4, 14, 16),
        row(5, 14, 16),
        wait(900),
        key('e'),
        { click: at(6, 4) },
        wait(700),
        { drag: [at(8, 5), at(9, 5)], steps: 3, delay: 45, after: 800 },
        wait(900),
        key('b'),
        pickTile(11),
        wait(600),
        scrollProps('terrain'),
        away,
        wait(2200),
        { rec: 'stop' },
      ];
    })(),
  },
  {
    // Custom values on a tile: the list in the Tileset panel with two values set.
    name: 'tile-values',
    prefs: { showTips: false },
    steps: [
      ...start,
      js(`(() => { const t = ${F}.tiles; const st = ${F}.store(); t.addValue('damage', 'int'); t.addValue('slippery', 'bool'); const key = st.get().doc.tileset.tiles[3].key; t.pickTile(key); t.setTileValue(key, 'damage', 1); t.setTileValue(key, 'slippery', true); })()`),
      wait(600),
      scrollProps(),
      away,
      wait(600),
      { shot: '@', crop: [878, 46, 312, 420] },
    ],
  },
];
