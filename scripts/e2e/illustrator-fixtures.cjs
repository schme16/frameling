// Test documents for the Illustrator check (scripts/e2e/illustrator.cjs). Each fixture is a string of page code that
// builds its document with the debug hooks (`window.__framelingExport`, `window.__frameling`), plus what Illustrator
// should find in the .ai file Frameling writes from it.
//
// expect.layers: layer names that must exist (anywhere in the layer tree). expect.tree: [folder, its layers] pairs. expect.opacity: layer name to percent.
// expect.hidden: names that must be off. expect.hiddenWithArt: names that must be there, switched off, with art in them. expect.shown: names that must be there and on. expect.minPaths: at least this many path items. expect.size: artboard size.
// expect.texts: live text frames to find ({ contents, font, size, rgb, tracking, opacity, align }). expect.noText: no live text. expect.gradientStrokes: this many gradient strokes.
// expect.minGroups: at least this many groups (one per layer or folder). expect.maxRmse: the largest difference to Frameling's own PNG.

const HEAD = `
const E = window.__framelingExport, S = window.__frameling.store();
const R = (id, x, y, w, h, fill, extra) => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }], fill, stroke: null, opacity: 1, ...extra });
const ELL = (id, cx, cy, rx, ry, fill, extra) => { const k = 0.5523; const P = (x, y, a, b, c, d) => ({ x, y, c1: { x: a, y: b }, c2: { x: c, y: d } });
  return { id, type: 'path', paths: [{ closed: true, points: [
    { x: cx, y: cy - ry },
    P(cx + rx, cy, cx + rx * k, cy - ry, cx + rx, cy - ry * k),
    P(cx, cy + ry, cx + rx, cy + ry * k, cx + rx * k, cy + ry),
    P(cx - rx, cy, cx - rx * k, cy + ry, cx - rx, cy + ry * k),
    P(cx, cy - ry, cx - rx, cy - ry * k, cx - rx * k, cy - ry),
  ] }], fill, stroke: null, opacity: 1, ...extra }; };
const POLY = (id, pts, stroke, extra) => ({ id, type: 'path', paths: [{ closed: false, points: pts.map(([x, y]) => ({ x, y })) }], fill: null, stroke, opacity: 1, ...extra });
const layer = (id, name, drawingId, extra) => ({ id, name, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: id + 'c', start: 0, length: 1, drawingId }], ...extra });
const TX = (x, y) => ({ x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 });
const setup = async (name, w, h, build) => {
  await E.load('blank-vector');
  S.update('setup', (d) => {
    d.name = name; d.width = w; d.height = h; d.background = '#fffaf0'; d.length = 1; d.fps = 12; d.clips = []; d.markers = []; d.drawings = {}; d.layers = []; d.folders = {};
    build(d);
  });
  return true;
};
`;

const fixtures = [
  {
    id: 'layers-folders',
    title: 'Layers and folders',
    code: `(async () => { ${HEAD}
  return setup('Layers', 320, 180, (d) => {
    const dr = (id, shapes) => (d.drawings[id] = { id, kind: 'vector', shapes });
    d.folders = { fA: { id: 'fA', name: 'Characters', visible: true, opacity: 1 }, fB: { id: 'fB', name: 'Scenery', visible: true, opacity: 0.7 } };
    dr('dSky', [R('s1', 0, 0, 320, 110, '#7ec8ff')]);
    dr('dHill', [ELL('s2', 160, 190, 200, 80, '#5fbf6a')]);
    dr('dBody', [ELL('s3', 110, 100, 40, 50, '#ff7a59')]);
    dr('dEyes', [ELL('s4', 98, 88, 7, 9, '#ffffff'), ELL('s5', 122, 88, 7, 9, '#ffffff')]);
    dr('dUni', [R('s6', 200, 30, 90, 40, '#9b59ff')]);
    dr('dHid', [R('s7', 0, 0, 320, 180, '#ff0000')]);
    dr('dMul', [R('s8', 190, 100, 100, 60, '#ffd23f')]);
    d.layers = [
      layer('l1', 'Sky', 'dSky', { folder: 'fB' }),
      layer('l2', 'Hills', 'dHill', { folder: 'fB' }),
      layer('l3', 'Hero body', 'dBody', { folder: 'fA' }),
      layer('l4', 'Hero eyes', 'dEyes', { folder: 'fA' }),
      layer('l5', 'Ünï 日本 half see-through', 'dUni', { opacity: 0.5 }),
      layer('l6', 'Hidden red', 'dHid', { visible: false }),
      layer('l7', 'Multiply yellow', 'dMul', { blend: 'multiply' }),
    ];
  });
})()`,
    // tree: a folder's layers, top first (the way Illustrator lists them); opacity in percent.
    expect: { size: [320, 180], layers: ['Sky', 'Hills', 'Hero body', 'Hero eyes', 'Characters', 'Scenery', 'Multiply yellow', 'Ünï 日本 half see-through'], tree: [['Scenery', ['Hills', 'Sky']], ['Characters', ['Hero eyes', 'Hero body']]], opacity: { Scenery: 70, 'Ünï 日本 half see-through': 50 }, hidden: ["Hidden red"], hiddenWithArt: ["Hidden red"], minPaths: 8, minGroups: 5, maxRmse: 0.03 },
  },
  {
    id: 'nested-folders',
    title: 'Folders inside folders',
    code: `(async () => { ${HEAD}
  return setup('Nested', 320, 180, (d) => {
    const dr = (id, shapes) => (d.drawings[id] = { id, kind: 'vector', shapes });
    d.folders = {
      fOut: { id: 'fOut', name: 'Outer', visible: true, opacity: 0.8 },
      fMid: { id: 'fMid', name: 'Middle', visible: true, opacity: 0.6, parent: 'fOut' },
      fIn: { id: 'fIn', name: 'Inner', visible: true, opacity: 1, parent: 'fMid' },
      fQ: { id: 'fQ', name: 'Quiet', visible: false, opacity: 1, parent: 'fOut' },
    };
    dr('dBack', [R('b1', 0, 0, 320, 180, '#bfe6ff')]);
    dr('dOuter', [R('o1', 10, 10, 90, 60, '#ff7a59')]);
    dr('dQuiet', [R('q1', 110, 10, 90, 60, '#ff0000')]);
    dr('dMid', [ELL('m1', 80, 120, 50, 40, '#5fbf6a')]);
    dr('dA', [R('a1', 150, 90, 60, 60, '#9b59ff')]);
    dr('dB', [ELL('b1', 190, 120, 35, 35, '#ffd23f')]);
    dr('dFront', [R('f1', 250, 20, 50, 50, '#1d1b26')]);
    d.layers = [
      layer('l1', 'Back', 'dBack'),
      layer('l2', 'Outer solo', 'dOuter', { folder: 'fOut' }),
      layer('l3', 'Quiet layer', 'dQuiet', { folder: 'fQ' }),
      layer('l4', 'Middle solo', 'dMid', { folder: 'fMid' }),
      layer('l5', 'Inner a', 'dA', { folder: 'fIn' }),
      layer('l6', 'Inner b', 'dB', { folder: 'fIn' }),
      layer('l7', 'Front', 'dFront'),
    ];
  });
})()`,
    // Each folder holds its own level, three deep, with its own opacity; the hidden inner folder is there, switched off, with its art.
    expect: { size: [320, 180], layers: ['Back', 'Outer', 'Middle', 'Inner', 'Quiet', 'Inner a', 'Front'], tree: [['Outer', ['Middle', 'Quiet', 'Outer solo']], ['Middle', ['Inner', 'Middle solo']], ['Inner', ['Inner b', 'Inner a']]], opacity: { Outer: 80, Middle: 60 }, shown: ['Outer', 'Middle', 'Inner', 'Inner a'], hiddenWithArt: ['Quiet'], minPaths: 6, maxRmse: 0.03 },
  },
  {
    id: 'hidden-layers',
    title: 'Hidden layers and folders',
    code: `(async () => { ${HEAD}
  return setup('Hidden', 320, 180, (d) => {
    const dr = (id, shapes) => (d.drawings[id] = { id, kind: 'vector', shapes });
    d.folders = {
      fH: { id: 'fH', name: 'Off folder', visible: false, opacity: 1 },
      fS: { id: 'fS', name: 'On folder', visible: true, opacity: 1 },
      fM: { id: 'fM', name: 'Off masked folder', visible: false, opacity: 1 },
    };
    dr('dBack', [R('b1', 0, 0, 320, 180, '#bfe6ff')]);
    dr('dOff', [R('o1', 0, 0, 320, 180, '#ff0000')]);
    dr('dIn', [ELL('i1', 80, 90, 60, 60, '#00aa44')]);
    dr('dInOff', [R('i2', 150, 20, 100, 60, '#ffd200')]);
    dr('dSOn', [R('s1', 20, 20, 70, 40, '#9b59ff')]);
    dr('dSOff', [R('s2', 200, 110, 100, 60, '#ff00ff')]);
    dr('dFront', [ELL('f1', 250, 50, 30, 30, '#ff7a59')]);
    dr('dStripes', [R('t1', 0, 0, 160, 180, '#ff3366'), R('t2', 160, 0, 160, 180, '#3366ff')]);
    dr('dMask', [ELL('m1', 160, 90, 70, 70, '#000000')]);
    d.layers = [
      layer('l1', 'Back', 'dBack'),
      layer('l2', 'Off layer', 'dOff', { visible: false }),
      layer('l3', 'In off folder', 'dIn', { folder: 'fH' }),
      layer('l4', 'Off in off folder', 'dInOff', { folder: 'fH', visible: false }),
      layer('l5', 'On in on folder', 'dSOn', { folder: 'fS' }),
      layer('l6', 'Off in on folder', 'dSOff', { folder: 'fS', visible: false }),
      layer('l7', 'Stripes in off masked', 'dStripes', { folder: 'fM' }),
      layer('l8', 'Mask in off masked', 'dMask', { folder: 'fM', mask: 'show' }),
      layer('l9', 'Front', 'dFront'),
    ];
  });
})()`,
    // The hidden art is in the file, switched off, and not in the picture (Frameling's picture leaves it out too).
    expect: { size: [320, 180], layers: ['Back', 'Front', 'On folder', 'On in on folder'], shown: ['Back', 'Front', 'On folder', 'On in on folder', 'In off folder'], hiddenWithArt: ['Off layer', 'Off folder', 'Off in off folder', 'Off in on folder', 'Stripes in off masked + Mask in off masked'], minPaths: 8, maxRmse: 0.03, pdfReader: 0.03 },
  },
  {
    id: 'hidden-in-effect-folder',
    title: 'Hidden layers inside folders with effects',
    code: `(async () => { ${HEAD}
  return setup('HiddenFx', 320, 180, (d) => {
    const dr = (id, shapes) => (d.drawings[id] = { id, kind: 'vector', shapes });
    const soft = { id: 'e1', kind: 'blur', values: { radius: 3 } };
    d.folders = {
      fA: { id: 'fA', name: 'Soft group', visible: true, opacity: 1, effects: [soft] },
      fB: { id: 'fB', name: 'Quiet soft group', visible: false, opacity: 1, effects: [soft] },
    };
    dr('dBack', [R('b1', 0, 0, 320, 180, '#bfe6ff')]);
    dr('dA1', [ELL('a1', 80, 90, 50, 50, '#00aa44')]);
    dr('dA2', [R('a2', 160, 20, 120, 60, '#ff0000')]);
    dr('dB1', [R('b2', 20, 20, 80, 50, '#9b59ff')]);
    dr('dB2', [R('b3', 200, 100, 90, 60, '#ff00ff')]);
    dr('dFront', [ELL('f1', 270, 40, 25, 25, '#ff7a59')]);
    d.layers = [
      layer('l1', 'Back', 'dBack'),
      layer('l2', 'Soft shown', 'dA1', { folder: 'fA' }),
      layer('l3', 'Soft hidden', 'dA2', { folder: 'fA', visible: false }),
      layer('l4', 'Quiet shown', 'dB1', { folder: 'fB' }),
      layer('l5', 'Quiet hidden', 'dB2', { folder: 'fB', visible: false }),
      layer('l6', 'Front', 'dFront'),
    ];
  });
})()`,
    // The folder with the blur becomes a picture of what is on; the layer that is off keeps its art, switched off, in a folder next to the picture.
    expect: { size: [320, 180], layers: ['Back', 'Front'], shown: ['Back', 'Front', 'Soft shown'], hiddenWithArt: ['Soft group (hidden layers)', 'Soft hidden', 'Quiet soft group (hidden layers)', 'Quiet hidden', 'Quiet shown'], minPaths: 3, maxRmse: 0.03, pdfReader: 0.03 },
  },
  {
    id: 'paths',
    title: 'Paths, fills, strokes and joins',
    code: `(async () => { ${HEAD}
  return setup('Paths', 320, 180, (d) => {
    const sq = (a, b) => ({ closed: true, points: [{ x: a, y: a }, { x: b, y: a }, { x: b, y: b }, { x: a, y: b }] });
    const st = (join, cap) => ({ color: '#1d1b26', width: 10, join, cap });
    d.drawings.d1 = { id: 'd1', kind: 'vector', shapes: [
      POLY('a1', [[10, 60], [40, 15], [70, 60]], st('miter', 'butt')),
      POLY('a2', [[90, 60], [120, 15], [150, 60]], st('round', 'round')),
      POLY('a3', [[170, 60], [200, 15], [230, 60]], st('bevel', 'square')),
      { id: 'a4', type: 'fill', paths: [{ closed: true, points: [{ x: 250, y: 10 }, { x: 310, y: 10 }, { x: 310, y: 70 }, { x: 250, y: 70 }] }, { closed: true, points: [{ x: 265, y: 25 }, { x: 295, y: 25 }, { x: 295, y: 55 }, { x: 265, y: 55 }] }], color: '#ff6f91', opacity: 1 },
      ELL('a5', 60, 125, 45, 35, '#5ab8ff', { stroke: { color: '#0b3d91', width: 4, join: 'round', cap: 'round' } }),
      { id: 'a6', type: 'path', paths: [{ closed: true, points: [{ x: 150, y: 90 }, { x: 230, y: 130, c1: { x: 200, y: 80 }, c2: { x: 230, y: 100 } }, { x: 170, y: 170, c1: { x: 230, y: 160 }, c2: { x: 200, y: 180 } }] }], fill: '#4fd1a580', stroke: { color: '#14532d', width: 6, join: 'miter', cap: 'butt' }, opacity: 0.9 },
      R('a7', 250, 100, 50, 50, '#ffa500', { opacity: 0.5, stroke: { color: '#000000', width: 2, join: 'miter', cap: 'butt' } }),
      R('a8', 270, 120, 40, 40, '#0044ff', { opacity: 0.5 }),
    ] };
    d.layers = [layer('l1', 'Shapes', 'd1')];
  });
})()`,
    expect: { size: [320, 180], layers: ['Shapes'], minPaths: 8, maxRmse: 0.05 },
  },
  {
    id: 'gradients',
    title: 'Gradients',
    code: `(async () => { ${HEAD}
  return setup('Gradients', 320, 180, (d) => {
    const lin = { kind: 'linear', from: { x: 10, y: 0 }, to: { x: 150, y: 0 }, stops: [{ at: 0, color: '#ff0066' }, { at: 1, color: '#3300ff' }] };
    const rad = { kind: 'radial', from: { x: 240, y: 55 }, to: { x: 240, y: 5 }, stops: [{ at: 0, color: '#ffffff' }, { at: 0.5, color: '#ffcc00' }, { at: 1, color: '#ff3300' }] };
    const three = { kind: 'linear', from: { x: 10, y: 0 }, to: { x: 150, y: 0 }, stops: [{ at: 0, color: '#00cc66' }, { at: 0.3, color: '#ffee00' }, { at: 1, color: '#cc0033' }] };
    const alpha = { kind: 'linear', from: { x: 190, y: 0 }, to: { x: 310, y: 0 }, stops: [{ at: 0, color: '#0000ff' }, { at: 1, color: '#0000ff00' }] };
    const gl = { kind: 'linear', from: { x: 10, y: 0 }, to: { x: 150, y: 0 }, stops: [{ at: 0, color: '#ff8800' }, { at: 1, color: '#0088ff' }] };
    d.drawings.d1 = { id: 'd1', kind: 'vector', shapes: [
      R('g1', 10, 10, 140, 50, '#ffffff', { fillGradient: lin }),
      ELL('g2', 240, 55, 60, 45, '#ffffff', { fillGradient: rad }),
      R('g3', 10, 70, 140, 40, '#ffffff', { fillGradient: three }),
      R('g4', 190, 115, 120, 50, '#ffffff', { fillGradient: alpha }),
      R('g5', 10, 125, 140, 40, null, { stroke: { color: '#000000', width: 14, join: 'round', cap: 'butt' }, strokeGradient: gl }),
    ] };
    d.drawings.d0 = { id: 'd0', kind: 'vector', shapes: [R('bg', 180, 105, 140, 70, '#222222')] };
    d.layers = [layer('l0', 'Dark patch', 'd0'), layer('l1', 'Gradients', 'd1')];
  });
})()`,
    expect: { size: [320, 180], layers: ['Dark patch', 'Gradients'], minPaths: 5, gradientStrokes: 1, maxRmse: 0.06 },
  },
  {
    id: 'masks',
    title: 'Masks, clipping and effects',
    code: `(async () => { ${HEAD}
  return setup('Masks', 320, 180, (d) => {
    const stripes = []; for (let i = 0; i < 8; i++) stripes.push(R('st' + i, i * 40, 0, 20, 180, i % 2 ? '#ff3366' : '#33aaff'));
    d.drawings.dStripes = { id: 'dStripes', kind: 'vector', shapes: stripes };
    d.drawings.dMask = { id: 'dMask', kind: 'vector', shapes: [ELL('m1', 90, 90, 70, 70, '#000000')] };
    d.drawings.dClipSrc = { id: 'dClipSrc', kind: 'vector', shapes: [ELL('c1', 250, 60, 50, 40, '#00aa66')] };
    d.drawings.dClipTop = { id: 'dClipTop', kind: 'vector', shapes: [R('c2', 200, 40, 120, 30, '#ffee00')] };
    d.folders = { fM: { id: 'fM', name: 'Masked group', visible: true, opacity: 1 } };
    d.layers = [
      layer('l1', 'Stripes', 'dStripes', { folder: 'fM' }),
      layer('l2', 'Circle mask', 'dMask', { folder: 'fM', mask: 'show' }),
      layer('l3', 'Green blob', 'dClipSrc'),
      layer('l4', 'Yellow clipped to blob', 'dClipTop', { clipToBelow: true }),
    ];
  });
})()`,
    expect: { size: [320, 180], layers: [], minPaths: 0, maxRmse: 0.08 },
  },
  {
    id: 'text',
    title: 'Text (Nunito, which Illustrator does not have)',
    code: `(async () => { ${HEAD}
  return setup('Text', 320, 180, (d) => {
    const T = (id, text, x, y, size, extra) => ({ id, type: 'text', text, font: 'Nunito', size, weight: 800, color: '#ff3366', align: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1, transform: TX(x, y), ...extra });
    d.drawings.d1 = { id: 'd1', kind: 'vector', shapes: [
      T('t1', 'Hello Illustrator', 10, 45, 36),
      T('t2', 'Two lines\\nof centred text', 160, 90, 20, { align: 'center', color: '#1d1b26', weight: 400 }),
      T('t3', 'Italic 123', 10, 150, 28, { italic: true, color: '#3366ff', weight: 600 }),
    ] };
    d.layers = [layer('l1', 'Words', 'd1')];
  });
})()`,
    // Live text in a font Illustrator does not have: it keeps the font's name and shows another one until the font is installed, so the picture differs more.
    expect: {
      size: [320, 180],
      layers: ['Words'],
      noText: false,
      texts: [
        { contents: 'Hello Illustrator', font: 'Nunito-ExtraBold', size: 36, rgb: [255, 51, 102], align: 'LEFT' },
        { contents: 'Two lines\nof centred text', font: 'Nunito-Regular', size: 20, rgb: [29, 27, 38], align: 'CENTER' },
        { contents: 'Italic 123', font: 'Nunito-SemiBoldItalic', size: 28, rgb: [51, 102, 255], align: 'LEFT' },
      ],
      minPaths: 0,
      // Another font is drawn (lighter, and no italic), so the picture is a good way off.
      maxRmse: 0.17,
    },
  },
  {
    id: 'text-live',
    title: 'Text in a font Illustrator has (Arial)',
    code: `(async () => { ${HEAD}
  return setup('TextLive', 320, 180, (d) => {
    const T = (id, text, x, y, size, extra) => ({ id, type: 'text', text, font: 'Arial', size, weight: 400, color: '#ff3366', align: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1, transform: TX(x, y), ...extra });
    d.drawings.d1 = { id: 'd1', kind: 'vector', shapes: [
      T('t1', 'Hello Illustrator', 10, 45, 36, { weight: 700 }),
      T('t2', 'Two lines\\nof centred text', 160, 90, 20, { align: 'center', color: '#1d1b26', letterSpacing: 2, lineHeight: 1.5 }),
      T('t3', 'Italic 123', 10, 150, 28, { italic: true, color: '#3366ff', transform: { x: 10, y: 150, scaleX: 1.5, scaleY: 1.5, rotation: -12, skew: 0 } }),
      T('t4', 'Half see-through', 310, 175, 14, { align: 'right', opacity: 0.5, color: '#000000' }),
    ] };
    d.layers = [layer('l1', 'Words', 'd1')];
  });
})()`,
    expect: {
      size: [320, 180],
      layers: ['Words'],
      texts: [
        { contents: 'Hello Illustrator', font: 'Arial-BoldMT', size: 36, rgb: [255, 51, 102], align: 'LEFT' },
        { contents: 'Two lines\nof centred text', font: 'ArialMT', size: 20, rgb: [29, 27, 38], tracking: 100, align: 'CENTER' },
        { contents: 'Italic 123', font: 'Arial-ItalicMT', size: 42, rgb: [51, 102, 255], align: 'LEFT' },
        { contents: 'Half see-through', font: 'ArialMT', size: 14, opacity: 50, rgb: [0, 0, 0], align: 'RIGHT' },
      ],
      minPaths: 0,
      // The places, sizes and turns agree; the letters differ a little, since Frameling draws "Arial" with whatever font this computer has for it.
      maxRmse: 0.11,
    },
  },
  {
    id: 'text-big',
    title: 'Text, drawn at 4 times the size (the letter outlines of the PDF part)',
    scale: 4,
    // As PDF pages, which Illustrator reads without the live text: the outlines are what it shows.
    ai: 'pages',
    code: `(async () => { ${HEAD}
  return setup('TextBig', 160, 90, (d) => {
    const T = (id, text, x, y, size, extra) => ({ id, type: 'text', text, font: 'Nunito', size, weight: 800, color: '#ff3366', align: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1, transform: TX(x, y), ...extra });
    d.drawings.d1 = { id: 'd1', kind: 'vector', shapes: [
      T('t1', 'Hamburg@', 6, 34, 30),
      T('t2', 'Quick 85%', 6, 70, 22, { color: '#1d1b26', weight: 400, italic: true }),
    ] };
    d.layers = [layer('l1', 'Words', 'd1')];
  });
})()`,
    expect: { size: [640, 360], layers: ['Words'], minPaths: 3, noText: true, maxRmse: 0.04 },
  },
  {
    id: 'symbols',
    title: 'Symbols (instances)',
    code: `(async () => { ${HEAD}
  return setup('Symbols', 320, 180, (d) => {
    const star = []; const pts = []; for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2; const r = i % 2 ? 12 : 28; pts.push({ x: 40 + Math.cos(a) * r, y: 40 + Math.sin(a) * r }); }
    d.drawings.dStar = { id: 'dStar', kind: 'vector', shapes: [{ id: 'st1', type: 'path', paths: [{ closed: true, points: pts }], fill: '#ffc94a', stroke: { color: '#b36b00', width: 3, join: 'miter', cap: 'butt' }, opacity: 1 }] };
    d.symbols = { star: { id: 'star', name: 'Star', length: 1, origin: { x: 40, y: 40 }, layers: [layer('sl1', 'Star art', 'dStar')] } };
    const inst = (id, x, y, rot, sc, extra) => ({ id, type: 'instance', symbolId: 'star', transform: { x, y, scaleX: sc, scaleY: sc, rotation: rot, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0, ...extra });
    d.drawings.d1 = { id: 'd1', kind: 'vector', shapes: [inst('i1', 60, 60, 0, 1), inst('i2', 160, 60, 30, 1.6), inst('i3', 260, 60, -15, 1, { opacity: 0.5 }), inst('i4', 160, 140, 0, 0.8, { tint: { color: '#ff0000', amount: 0.6 } })] };
    d.layers = [layer('l1', 'Stars', 'd1')];
  });
})()`,
    expect: { size: [320, 180], layers: ['Stars'], minPaths: 4, maxRmse: 0.05 },
  },
  {
    id: 'frames',
    title: 'Several frames (pages)',
    frames: 3,
    code: `(async () => { ${HEAD}
  return setup('Frames', 240, 120, (d) => {
    d.length = 3;
    for (let i = 0; i < 3; i++) d.drawings['d' + i] = { id: 'd' + i, kind: 'vector', shapes: [R('r' + i, 20 + i * 70, 30, 60, 60, ['#ff3366', '#33cc66', '#3366ff'][i])] };
    d.layers = [{ ...layer('l1', 'Mover', 'd0'), cels: [0, 1, 2].map((i) => ({ id: 'c' + i, start: i, length: 1, drawingId: 'd' + i })) }];
  });
})()`,
    expect: { size: [240, 120], layers: ['Mover'], minPaths: 1, pages: 3, maxRmse: 0.05 },
  },
  {
    id: 'scale2-transparent',
    title: 'Scale 2, see-through background',
    scale: 2,
    transparent: true,
    code: `(async () => { ${HEAD}
  return setup('Scale', 200, 100, (d) => {
    d.drawings.d1 = { id: 'd1', kind: 'vector', shapes: [ELL('e1', 100, 50, 80, 35, '#33aaff', { stroke: { color: '#003366', width: 5, join: 'round', cap: 'round' } })] };
    d.layers = [layer('l1', 'Oval', 'd1')];
  });
})()`,
    expect: { size: [400, 200], layers: ['Oval'], minPaths: 1, maxRmse: 0.06 },
  },
];

module.exports = { fixtures };
