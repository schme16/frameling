// Draws the Frameling mascot and icon concepts and writes every file in this folder.
// Run it with `node brand/build-brand.mjs`. Nothing else in the app depends on it: the SVGs are the artwork.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const INK = '#1d1b26';
const PAPER = '#fffaf0';
const C = { sunny: '#ffc94a', sunnyDeep: '#f2a91c', peach: '#ff9e6d', rose: '#ff6f91', grape: '#9b7bff', sky: '#5ab8ff', mint: '#4fd1a5' };

const n = (v) => +v.toFixed(1);
const svgOpen = (w, h, vb, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}" role="img" aria-label="${title}">\n  <title>${title}</title>\n`;
const wrap = (inner, title, w = 512, h = 512, vb = '0 0 512 512') => `${svgOpen(w, h, vb, title)}${inner}</svg>\n`;
const ellipse = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" ${extra}/>`;
const line = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

/** The soft shadow on the ground. Smaller and fainter the higher the creature is. */
const groundShadow = (cx, y, rx, lift) => ellipse(cx, y, rx * (1 - lift / 520), 13 * (1 - lift / 700), INK, `opacity="${n(0.16 - lift / 1400)}"`);

// ---------------------------------------------------------------------------------------------------------------
// Concept A: the flipbook page. A rounded page with a dog-eared corner for an ear, and tiny legs mid-hop.
// ---------------------------------------------------------------------------------------------------------------
const A_PAGE = 'M-100,-290 H74 L140,-224 V-40 Q140,0 100,0 H-100 Q-140,0 -140,-40 V-250 Q-140,-290 -100,-290 Z';
const A_FLAP = 'M74,-290 L140,-224 L74,-224 Z';

function aLegs(kind) {
  const leg = (d, fx, fy) => line(d, INK, 16) + ellipse(fx, fy, 18, 10, INK);
  switch (kind) {
    case 'crouch': return leg('M-56,-6 L-60,14', -62, 22) + leg('M56,-6 L60,14', 62, 22);
    case 'tuck': return leg('M-56,-6 L-72,18 L-42,26', -34, 28) + leg('M56,-6 L72,18 L42,26', 34, 28);
    case 'land': return leg('M-56,-6 L-78,20', -84, 28) + leg('M56,-6 L78,20', 84, 28);
    default: return leg('M-56,-6 L-74,24 L-46,38', -38, 40) + leg('M56,-6 L68,38', 74, 46);
  }
}

function aPose({ sx = 1, sy = 1, lift = 0, rot = 0, legs = 'hop', blink = false }) {
  const face = (blink
    ? line('M-68,-168 Q-52,-186 -36,-168', INK, 9) + line('M36,-168 Q52,-186 68,-168', INK, 9)
    : ellipse(-52, -170, 15, 21, INK) + ellipse(52, -170, 15, 21, INK) + ellipse(-47, -178, 5, 6, '#fff') + ellipse(57, -178, 5, 6, '#fff'))
    + ellipse(-90, -126, 21, 14, C.rose, 'opacity="0.8"') + ellipse(90, -126, 21, 14, C.rose, 'opacity="0.8"')
    + line('M-24,-124 Q0,-94 24,-124', INK, 8);
  return `  <g transform="translate(256 ${n(396 - lift)}) rotate(${rot}) scale(${sx} ${sy})">
    <!-- the rest of the flipbook, peeking out behind the front page -->
    <path d="${A_PAGE}" transform="translate(-18 16)" fill="#e9cf9c" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
    <path d="${A_PAGE}" transform="translate(-9 8)" fill="#f6e3bb" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
    ${aLegs(legs)}
    <path d="${A_PAGE}" fill="${PAPER}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
    <!-- the dog-eared corner, which is also an ear -->
    <path d="${A_FLAP}" fill="${C.peach}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
    ${face}
  </g>\n`;
}

const aMascot = () => wrap(`${groundShadow(256, 458, 120, 26)}${aPose({ lift: 26, rot: -5, legs: 'hop' })}`, 'Frameling mascot A: the flipbook page');

const aPoses = [
  { sx: 1.08, sy: 0.88, lift: 0, legs: 'crouch' },
  { sx: 0.95, sy: 1.06, lift: 60, rot: -6, legs: 'tuck' },
  { sx: 1.1, sy: 0.86, lift: 0, rot: 2, legs: 'land', blink: true },
];

const aIcon = () => iconFrame(C.grape, `
  <path d="M156,100 H326 L406,180 V350 Q406,400 356,400 H156 Q106,400 106,350 V150 Q106,100 156,100 Z" fill="${PAPER}" stroke="${INK}" stroke-width="22" stroke-linejoin="round"/>
  <path d="M326,100 L406,180 L326,180 Z" fill="${C.peach}" stroke="${INK}" stroke-width="20" stroke-linejoin="round"/>
  ${ellipse(196, 256, 27, 40, INK)}${ellipse(316, 256, 27, 40, INK)}${ellipse(206, 240, 9, 11, '#fff')}${ellipse(326, 240, 9, 11, '#fff')}
  ${ellipse(150, 318, 26, 17, C.rose, 'opacity="0.85"')}${ellipse(362, 318, 26, 17, C.rose, 'opacity="0.85"')}
  ${line('M226,320 Q256,356 286,320', INK, 18)}
  ${line('M190,408 V430', INK, 22)}${line('M322,408 V430', INK, 22)}${ellipse(184, 440, 32, 17, INK)}${ellipse(328, 440, 32, 17, INK)}`);

const A_PIXEL = {
  palette: { K: INK, w: PAPER, o: C.peach, r: C.rose, p: '#f0dcb0' },
  rows: [
    '..KKKKKKKKKKK.......',
    '.KwwwwwwwwwwwKK.....',
    '.KwwwwwwwwwwKooK....',
    '.KwwwwwwwwwwKoooK...',
    '.KwwwwwwwwwwKooooK..',
    '.KwwwwwwwwwwKoooooK.',
    '.KwwwwwwwwwwKKKKKKK.',
    '.KwwwwwwwwwwwwwwwwK.',
    '.KwwwwwwwwwwwwwwwwK.',
    '.KwwwKKwwwwwKKwwwwK.',
    '.KwwwKKwwwwwKKwwwwK.',
    '.KwwwwwwwwwwwwwwwwK.',
    '.KwrrwwwwwwwwrrwwwK.',
    '.KwwwwwKwwwKwwwwwwK.',
    '.KwwwwwwKKKwwwwwwwK.',
    '.KwwwwwwwwwwwwwwwwK.',
    '.KwwwwwwwwwwwwwwwwK.',
    '.KKKKKKKKKKKKKKKKKK.',
    '..KpppppppppppppppK.',
    '...KKKKKKKKKKKKKKK..',
    '.....KK........KK...',
    '....KKK.......KKKK..',
  ],
  at: [6, 4],
  shadow: [11, 20, 28],
};

// ---------------------------------------------------------------------------------------------------------------
// Concept B: the stacked-frames blob. A round creature with onion-skin copies behind it, so it looks like motion.
// ---------------------------------------------------------------------------------------------------------------
const B_BLOB = 'M0,-220 C100,-222 142,-152 142,-96 C142,-34 84,0 0,0 C-84,0 -142,-34 -142,-96 C-142,-152 -100,-222 0,-220 Z';
const GHOST_COLOURS = [C.rose, C.grape, C.sky];

function bBlob(x, y, sx, sy, rot, ghost) {
  const t = `translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${sx} ${sy})`;
  if (ghost) {
    return `    <g transform="${t}"><path d="${B_BLOB}" fill="${ghost.color}" fill-opacity="${ghost.op * 0.35}" stroke="${ghost.color}" stroke-opacity="${ghost.op}" stroke-width="9" stroke-linejoin="round"/></g>\n`;
  }
  return `    <g transform="${t}">
      ${ellipse(-58, 2, 30, 16, C.peach, `stroke="${INK}" stroke-width="7"`)}${ellipse(58, 2, 30, 16, C.peach, `stroke="${INK}" stroke-width="7"`)}
      <path d="${B_BLOB}" fill="${C.sunny}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
      ${line('M-98,-50 C-70,-14 70,-14 98,-50', C.sunnyDeep, 14, 'opacity="0.6"')}
      ${line('M-98,-150 Q-86,-184 -44,-198', '#fff', 12, 'opacity="0.8"')}
      ${ellipse(-50, -122, 15, 22, INK)}${ellipse(50, -122, 15, 22, INK)}${ellipse(-45, -130, 5, 6, '#fff')}${ellipse(55, -130, 5, 6, '#fff')}
      ${ellipse(-92, -84, 20, 13, C.rose, 'opacity="0.75"')}${ellipse(92, -84, 20, 13, C.rose, 'opacity="0.75"')}
      <path d="M-24,-90 Q0,-54 24,-90 Z" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      ${ellipse(0, -76, 11, 6, C.rose)}
    </g>\n`;
}

function bPose({ x = 256, base = 400, sx = 1, sy = 1, lift = 0, rot = 0, ghosts = [] }) {
  const y = base - lift;
  // Oldest copy first, so the newest sits just behind the creature.
  const g = [...ghosts].reverse().map((gh, i, all) => bBlob(x + gh.dx, y + gh.dy, sx * 0.97, sy, rot, { color: GHOST_COLOURS[all.length - 1 - i] ?? C.sky, op: gh.op })).join('');
  return `  <g>\n${g}${bBlob(x, y, sx, sy, rot)}  </g>\n`;
}

const brackets = (m, l, color) => [[m, m, 1, 1], [512 - m, m, -1, 1], [m, 512 - m, 1, -1], [512 - m, 512 - m, -1, -1]]
  .map(([x, y, sx, sy]) => line(`M${x},${y + sy * l} V${y} H${x + sx * l}`, color, 12, 'opacity="0.85"')).join('');

const bMascot = () => wrap(`${brackets(26, 54, C.grape)}${groundShadow(332, 478, 130, 90)}${bPose({ x: 332, base: 472, sx: 0.88, sy: 0.9, lift: 88, rot: 0, ghosts: [{ dx: -66, dy: 34, op: 0.85 }, { dx: -128, dy: 62, op: 0.6 }, { dx: -186, dy: 84, op: 0.35 }] })}`, 'Frameling mascot B: the stacked-frames blob');

const bPoses = [
  { sx: 1.12, sy: 0.86, lift: 0 },
  { sx: 0.92, sy: 1.06, lift: 110, ghosts: [{ dx: 0, dy: 56, op: 0.85 }, { dx: 0, dy: 108, op: 0.55 }, { dx: 0, dy: 156, op: 0.3 }] },
  { sx: 1.14, sy: 0.84, lift: 0, ghosts: [{ dx: 0, dy: -60, op: 0.85 }, { dx: 0, dy: -124, op: 0.55 }, { dx: 0, dy: -190, op: 0.3 }] },
];

const bIcon = () => iconFrame(C.sky, `
  <g transform="translate(206 424) scale(0.98 0.96)"><path d="${B_BLOB}" fill="${C.grape}" stroke="${INK}" stroke-width="16" stroke-linejoin="round"/></g>
  <g transform="translate(246 408) scale(0.98 0.96)"><path d="${B_BLOB}" fill="${C.rose}" stroke="${INK}" stroke-width="16" stroke-linejoin="round"/></g>
  <g transform="translate(290 392) scale(0.98 0.96)">
    <path d="${B_BLOB}" fill="${C.sunny}" stroke="${INK}" stroke-width="16" stroke-linejoin="round"/>
    ${ellipse(-48, -118, 24, 34, INK)}${ellipse(48, -118, 24, 34, INK)}${ellipse(-41, -130, 8, 9, '#fff')}${ellipse(55, -130, 8, 9, '#fff')}
    ${ellipse(-92, -70, 21, 14, C.rose, 'opacity="0.85"')}${ellipse(92, -70, 21, 14, C.rose, 'opacity="0.85"')}
    ${line('M-28,-76 Q0,-44 28,-76', INK, 15)}
  </g>`);

// The ghosts are drawn from the silhouette, so the sprite only needs the creature.
const B_PIXEL = {
  palette: { K: INK, y: C.sunny, r: C.rose, P: C.peach, R: C.rose, G: C.grape, B: C.sky },
  rows: [
    '....KKKKKKKK....',
    '..KKyyyyyyyyKK..',
    '.KyyyyyyyyyyyyK.',
    '.KyyyyyyyyyyyyK.',
    'KyyyyyyyyyyyyyyK',
    'KyyyKKyyyyKKyyyK',
    'KyyyKKyyyyKKyyyK',
    'KyyyyyyyyyyyyyyK',
    'KyrryyKyyKyyrryK',
    'KyyyyyyKKyyyyyyK',
    'KyyyyyyyyyyyyyyK',
    '.KyyyyyyyyyyyyK.',
    '.KKyyyyyyyyyyKK.',
    '..KKKKKKKKKKKK..',
    '..KPPK....KPPK..',
  ],
  at: [14, 4],
  ghosts: [['R', -4, 2], ['G', -8, 4], ['B', -12, 6]],
  shadow: [16, 28, 29],
};

// ---------------------------------------------------------------------------------------------------------------
// Concept C: Cel, a caterpillar built from three little frames. Each segment is a film frame, like cels on a
// timeline, and it inches along by bunching up and stretching out.
// ---------------------------------------------------------------------------------------------------------------
function cSeg(x, y, s, rot, fill, kind) {
  const r = s * 0.3;
  const holes = kind === 'head' ? '' : [-0.3, 0, 0.3].map((k) => `<rect x="${n(k * s - s * 0.07)}" y="${n(-s * 0.4)}" width="${n(s * 0.14)}" height="${n(s * 0.09)}" rx="${n(s * 0.025)}" fill="${INK}" opacity="0.22"/>`).join('');
  const feet = ellipse(-0.24 * s, s * 0.5, s * 0.13, s * 0.075, INK) + ellipse(0.24 * s, s * 0.5, s * 0.13, s * 0.075, INK);
  let face = '';
  if (kind === 'head') {
    face = ellipse(-0.23 * s, -0.06 * s, s * 0.075, s * 0.11, INK) + ellipse(0.23 * s, -0.06 * s, s * 0.075, s * 0.11, INK)
      + ellipse(-0.2 * s, -0.1 * s, s * 0.026, s * 0.03, '#fff') + ellipse(0.26 * s, -0.1 * s, s * 0.026, s * 0.03, '#fff')
      + ellipse(-0.37 * s, 0.17 * s, s * 0.1, s * 0.065, C.rose, 'opacity="0.8"') + ellipse(0.37 * s, 0.17 * s, s * 0.1, s * 0.065, C.rose, 'opacity="0.8"')
      + line(`M${n(-0.12 * s)},${n(0.17 * s)} Q0,${n(0.31 * s)} ${n(0.12 * s)},${n(0.17 * s)}`, INK, 8)
      + line(`M${n(-0.2 * s)},${n(-0.5 * s)} L${n(-0.32 * s)},${n(-0.78 * s)}`, INK, 7) + ellipse(-0.33 * s, -0.8 * s, s * 0.06, s * 0.06, C.rose, `stroke="${INK}" stroke-width="5"`)
      + line(`M${n(0.2 * s)},${n(-0.5 * s)} L${n(0.32 * s)},${n(-0.78 * s)}`, INK, 7) + ellipse(0.33 * s, -0.8 * s, s * 0.06, s * 0.06, C.rose, `stroke="${INK}" stroke-width="5"`);
  }
  return `    <g transform="translate(${n(x)} ${n(y)}) rotate(${rot})">
      ${feet}
      <rect x="${n(-s / 2)}" y="${n(-s / 2)}" width="${s}" height="${s}" rx="${n(r)}" fill="${fill}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
      ${line(`M${n(-s * 0.36)},${n(-s * 0.2)} Q${n(-s * 0.36)},${n(-s * 0.36)} ${n(-s * 0.2)},${n(-s * 0.37)}`, '#fff', Math.max(6, s * 0.07), 'opacity="0.7"')}
      ${holes}${face}
    </g>\n`;
}

const GROUND_C = 404;
/** segs: [x, lift, rot] for tail, middle and head. Sizes are fixed. */
function cPose([tail, mid, head]) {
  const sizes = [96, 122, 150];
  const colours = [C.rose, C.peach, C.sunny];
  const kinds = ['tail', 'mid', 'head'];
  return `  <g>\n${[tail, mid, head].map(([x, lift, rot], i) => cSeg(x, GROUND_C - sizes[i] / 2 - lift, sizes[i], rot, colours[i], kinds[i])).join('')}  </g>\n`;
}

const cMascot = () => wrap(`${groundShadow(256, 432, 190, 20)}${cPose([[122, 0, -6], [240, 34, 0], [380, 10, 6]])}`, 'Frameling mascot C: Cel the caterpillar');
const cPoses = [
  [[104, 0, 0], [232, 0, 0], [386, 0, 0]],
  [[154, 0, 8], [252, 78, 0], [352, 0, -8]],
  [[100, 0, 0], [226, 0, 0], [390, 40, 10]],
];

const cIcon = () => iconFrame('#2a2638', `
  <g transform="translate(0 0)">
    <rect x="52" y="256" width="120" height="120" rx="34" fill="${C.rose}" stroke="${INK}" stroke-width="12" transform="rotate(-6 112 316)"/>
    <rect x="124" y="226" width="150" height="150" rx="44" fill="${C.peach}" stroke="${INK}" stroke-width="12"/>
    <rect x="200" y="116" width="270" height="270" rx="80" fill="${C.sunny}" stroke="${INK}" stroke-width="14" transform="rotate(4 335 251)"/>
    <g transform="rotate(4 335 251)">
      ${ellipse(290, 236, 22, 33, INK)}${ellipse(380, 236, 22, 33, INK)}${ellipse(297, 224, 8, 9, '#fff')}${ellipse(387, 224, 8, 9, '#fff')}
      ${ellipse(258, 298, 24, 15, C.rose, 'opacity="0.9"')}${ellipse(412, 298, 24, 15, C.rose, 'opacity="0.9"')}
      ${line('M310,296 Q335,324 360,296', INK, 15)}
    </g>
    ${line('M290,126 L268,78', C.sunny, 14)}${ellipse(264, 72, 17, 17, C.rose)}${line('M382,126 L404,78', C.sunny, 14)}${ellipse(408, 72, 17, 17, C.rose)}
  </g>`);

const C_PIXEL = (() => {
  const g = Array.from({ length: 32 }, () => Array(32).fill('.'));
  const put = (x, y, ch) => { if (x >= 0 && y >= 0 && x < 32 && y < 32) g[y][x] = ch; };
  // A rounded box: ink outline, a flat fill, and the corners clipped.
  const box = (x, y, w, h, fill) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1;
      const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
      if (!corner) put(x + i, y + j, edge ? 'K' : fill);
    }
  };
  box(2, 19, 8, 8, 'r');
  box(8, 15, 10, 12, 'P');
  box(16, 9, 14, 18, 'y');
  // Sprocket holes on the two body frames.
  for (const [x, y] of [[4, 21], [7, 21], [10, 17], [13, 17]]) put(x, y, 'k');
  // The head's face.
  for (const [x, y] of [[20, 14], [20, 15], [25, 14], [25, 15]]) put(x, y, 'K');
  for (const [x, y] of [[19, 18], [26, 18]]) put(x, y, 'r');
  for (const [x, y] of [[21, 19], [24, 19]]) put(x, y, 'K');
  for (const [x, y] of [[22, 20], [23, 20]]) put(x, y, 'K');
  // Antennae.
  for (const [x, y] of [[19, 8], [18, 7], [18, 6], [24 + 3, 8], [28, 7], [28, 6]]) put(x, y, 'K');
  put(18, 5, 'r'); put(28, 5, 'r');
  // Feet.
  for (const [x, y] of [[4, 27], [7, 27], [10, 27], [14, 27], [19, 27], [26, 27]]) put(x, y, 'K');
  return {
    palette: { K: INK, k: '#9a5a66', y: C.sunny, P: C.peach, r: C.rose },
    rows: g.map((r) => r.join('')),
    at: [0, 0],
    shadow: [4, 28, 28.6],
  };
})();

// ---------------------------------------------------------------------------------------------------------------
// Shared pieces.
// ---------------------------------------------------------------------------------------------------------------
function iconFrame(bg, art) {
  return wrap(`  <rect width="512" height="512" rx="112" fill="${bg}"/>\n${art}\n`, 'Frameling app icon');
}

function strip(poseSvgs, title) {
  const cells = poseSvgs.map((p, i) => `  <g transform="translate(${i * 512} 0)">\n${p}  </g>`).join('\n');
  const dividers = [1, 2].map((i) => `  <path d="M${i * 512},40 V472" stroke="${INK}" stroke-opacity="0.18" stroke-width="4" stroke-dasharray="3 14" stroke-linecap="round"/>`).join('\n');
  const ground = `  <path d="M24,420 H1512" stroke="${INK}" stroke-opacity="0.2" stroke-width="5" stroke-linecap="round"/>`;
  return wrap(`${ground}\n${dividers}\n${cells}\n`, title, 1536, 512, '0 0 1536 512');
}

function pixelSvg({ palette, rows, at, ghosts = [], shadow }, title) {
  const W = 32;
  const grid = Array.from({ length: W }, () => Array(W).fill('.'));
  const stampRows = (r, ox, oy, only) => r.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && (!only || only(ch, x, y))) grid[oy + y]?.[ox + x] !== undefined && (grid[oy + y][ox + x] = ch); }));
  // Ghost copies are just the outline of the creature's silhouette, shifted and recoloured.
  const solid = (x, y) => rows[y]?.[x] !== undefined && rows[y][x] !== '.';
  for (const [ch, dx, dy] of [...ghosts].reverse()) {
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return;
      const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      if (edge && grid[at[1] + y + dy]?.[at[0] + x + dx] === '.') grid[at[1] + y + dy][at[0] + x + dx] = ch;
    }));
  }
  stampRows(rows, at[0], at[1]);
  const rects = [];
  if (shadow) rects.push(`  <rect x="${shadow[0]}" y="${shadow[2]}" width="${shadow[1] - shadow[0]}" height="1" fill="${INK}" fill-opacity="0.22"/>`);
  grid.forEach((row, y) => {
    let x = 0;
    while (x < W) {
      const ch = row[x];
      if (ch === '.') { x++; continue; }
      let e = x;
      while (e < W && row[e] === ch) e++;
      rects.push(`  <rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${palette[ch]}"/>`);
      x = e;
    }
  });
  return `${svgOpen(512, 512, '0 0 32 32', title).replace('role="img"', 'shape-rendering="crispEdges" role="img"')}${rects.join('\n')}\n</svg>\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Write everything.
// ---------------------------------------------------------------------------------------------------------------
const concepts = {
  a: {
    name: 'Page',
    mascot: aMascot(),
    hop: strip(aPoses.map(aPose), 'Mascot A: crouch, hop and land'),
    pixel: pixelSvg(A_PIXEL, 'Mascot A in pixel art'),
    icon: aIcon(),
  },
  b: {
    name: 'Blob',
    mascot: bMascot(),
    hop: strip(bPoses.map(bPose), 'Mascot B: crouch, hop and land'),
    pixel: pixelSvg(B_PIXEL, 'Mascot B in pixel art'),
    icon: bIcon(),
  },
  c: {
    name: 'Cel',
    mascot: cMascot(),
    hop: strip(cPoses.map(cPose), 'Mascot C: stretch, bunch and reach'),
    pixel: pixelSvg(C_PIXEL, 'Mascot C in pixel art'),
    icon: cIcon(),
  },
};

for (const [k, c] of Object.entries(concepts)) {
  writeFileSync(join(here, `mascot-${k}.svg`), c.mascot);
  writeFileSync(join(here, `mascot-${k}-hop.svg`), c.hop);
  writeFileSync(join(here, `mascot-${k}-pixel.svg`), c.pixel);
  writeFileSync(join(here, `icon-${k}.svg`), c.icon);
}
// The placeholder app icon is concept A until a concept is chosen.
mkdirSync(join(here, '..', 'build'), { recursive: true });
writeFileSync(join(here, '..', 'build', 'icon.svg'), concepts.a.icon);

// The comparison page inlines every SVG, so it's one file that works from anywhere.
const inline = (svg, cls, size) => svg.replace('<svg ', `<svg class="${cls}" `).replace(/ width="\d+" height="\d+"/, size ? ` width="${size}" height="${size}"` : '');
const sizes = [256, 64, 32, 16];
const column = (k, c, theme) => `
      <article class="concept">
        <h3>${k.toUpperCase()} <span>${c.name}</span></h3>
        <figure class="mascot">${inline(c.mascot, 'art')}<figcaption>Mascot</figcaption></figure>
        <figure class="strip">${inline(c.hop, 'art')}<figcaption>Three poses: the same creature squashing, hopping and landing</figcaption></figure>
        <figure class="pixel">${inline(c.pixel, 'art pix')}<figcaption>Pixel art, 32 by 32</figcaption></figure>
        <figure class="icons"><div class="row">${sizes.map((s) => `<div class="ic"><div class="at">${inline(c.icon, 'icon', s)}</div><small>${s}px</small></div>`).join('')}</div><figcaption>App icon at 256, 64, 32 and 16 pixels</figcaption></figure>
      </article>`;
const caption = {
  a: 'A flipbook page with a dog-eared corner for an ear. The most literal reading of "frames", and the page shape is already the app\'s metaphor.',
  b: 'A round blob with onion-skin copies trailing behind it. Reads as motion at a glance, and the ghosts are the product\'s signature tool.',
  c: 'Cel, a caterpillar made of three frames. Each segment is a film frame, so it is a timeline you can pet. Most distinctive, least obvious.',
};
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frameling mascot concepts</title>
<style>
  :root { --ink: #1d1b26; --paper: #fffaf0; --muted: #6d667d; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Nunito', system-ui, sans-serif; background: #ece7dc; color: var(--ink); }
  header { padding: 28px 32px 8px; max-width: 1400px; margin: 0 auto; }
  header h1 { margin: 0 0 6px; font-size: 28px; }
  header p { margin: 0; color: var(--muted); max-width: 70ch; line-height: 1.5; }
  .legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; padding: 8px 32px 0; max-width: 1400px; margin: 0 auto; }
  .legend p { margin: 0; font-size: 14px; line-height: 1.45; background: #fff9; border-radius: 12px; padding: 10px 14px; }
  .theme { margin: 24px auto; max-width: 1400px; border-radius: 24px; padding: 20px 24px 28px; }
  .theme.dark { background: #17151f; color: #f4efe6; --cap: #b3aac4; --card: #211e2c; --stage: #3a3550; }
  .theme.light { background: #fffaf0; color: #1d1b26; --cap: #6d667d; --card: #fff; --stage: #f3ecdc; }
  .theme > h2 { margin: 0 0 16px; font-size: 18px; letter-spacing: .04em; text-transform: uppercase; color: var(--cap); }
  .concepts { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
  .concept { background: var(--card); border-radius: 20px; padding: 18px; display: grid; gap: 14px; align-content: start; }
  .concept h3 { margin: 0; font-size: 22px; } .concept h3 span { font-weight: 600; font-size: 15px; color: var(--cap); margin-left: 6px; }
  figure { margin: 0; background: var(--stage); border-radius: 14px; padding: 12px; }
  figcaption { margin-top: 8px; font-size: 12px; color: var(--cap); }
  .art { display: block; width: 100%; height: auto; }
  .mascot .art { max-width: 340px; margin: 0 auto; }
  .pixel .art { max-width: 256px; margin: 0 auto; }
  .icons .row { display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; }
  .ic { display: grid; justify-items: start; gap: 4px; }
  .ic small { font-size: 11px; color: var(--cap); }
  .icon { display: block; }
  .picks { margin: 8px auto 40px; padding: 0 32px; max-width: 1400px; color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<header>
  <h1>Frameling mascot and icon concepts</h1>
  <p>Three directions for the little creature made of frames. Each is shown as a mascot, a three-pose hop, a 32 by 32 pixel version and an app icon at four sizes, on dark and light backgrounds. No text appears in any icon.</p>
</header>
<section class="legend">
  ${Object.entries(caption).map(([k, t]) => `<p><strong>${k.toUpperCase()}.</strong> ${t}</p>`).join('\n  ')}
</section>
<section class="theme dark"><h2>On dark</h2><div class="concepts">${Object.entries(concepts).map(([k, c]) => column(k, c)).join('')}
</div></section>
<section class="theme light"><h2>On light</h2><div class="concepts">${Object.entries(concepts).map(([k, c]) => column(k, c)).join('')}
</div></section>
<p class="picks">The placeholder app icon in <code>build/icon.svg</code> and <code>build/icon.png</code> is concept A until one is picked. Regenerate everything here with <code>node brand/build-brand.mjs</code>. On the dark stage the ink outlines lose most of their contrast, so whichever concept wins probably wants a thin light rim for dark UI.</p>
</body>
</html>
`;
writeFileSync(join(here, 'compare-mascots.html'), html);
console.log('brand files written');
