import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { PathShape, TextShape } from '../../src/core/format';
import { frameToSvg } from '../../src/export/svg';
import { addSheet, parseDecls, sheetStyle } from '../../src/import/svg/css';
import { importSvg, nonzeroDiffers, svgTextOf, SvgProblem } from '../../src/import/svg/convert';
import { arcToCubics, parsePathData } from '../../src/import/svg/pathData';
import { apply, mul, parseColor, parseLength, parseTransform, toHex } from '../../src/import/svg/values';
import { parseXml, XmlProblem } from '../../src/import/svg/xml';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/import/${n}`, import.meta.url), 'utf8');
const wrap = (body: string, attrs = 'width="100" height="100"') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;
const paths = (svg: ReturnType<typeof importSvg>) => svg.layers.flatMap((l) => l.shapes).filter((s): s is PathShape => s.type === 'path');
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('xml reader', () => {
  it('reads elements, attributes, text, CDATA and entities', () => {
    const r = parseXml(`<?xml version="1.0"?><!-- hi --><a x="1 &amp; 2" y='&#65;&#x42;'><b/>text &lt;<![CDATA[<raw>]]></a>`);
    expect(r.name).toBe('a');
    expect(r.attrs).toEqual({ x: '1 & 2', y: 'AB' });
    expect(r.kids.map((k) => (typeof k === 'string' ? k : k.name))).toEqual(['b', 'text <', '<raw>']);
  });

  it('skips a doctype and never expands an entity the file defines', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><svg>&b;</svg>`;
    const r = parseXml(bomb);
    expect(r.name).toBe('svg');
    expect(r.kids).toEqual(['&b;']);
  });

  it('says plainly what is wrong, with a line number', () => {
    expect(() => parseXml('<svg><g></svg>')).toThrow(/doesn't match what was opened/);
    expect(() => parseXml('<svg>\n<g>')).toThrow(/never closed.*line 2/);
    expect(() => parseXml('<svg a=1/>')).toThrow(/no quotes/);
    expect(() => parseXml('   ')).toThrow(XmlProblem);
    expect(() => parseXml('<svg a="x')).toThrow(/never closed/);
  });

  it('refuses a drawing nested absurdly deep instead of running out of stack', () => {
    expect(() => parseXml('<a>'.repeat(5000))).toThrow(/nested too deeply/);
  });
});

describe('colours, lengths and transforms', () => {
  it('reads every colour form it knows', () => {
    expect(toHex(parseColor('#f80')!)).toBe('#ff8800');
    expect(toHex(parseColor('#ff880080')!)).toBe('#ff880080');
    expect(toHex(parseColor('rgb(255, 0, 0)')!)).toBe('#ff0000');
    expect(toHex(parseColor('rgb(100% 0% 0% / 50%)')!)).toBe('#ff000080');
    expect(toHex(parseColor('hsl(120, 100%, 50%)')!)).toBe('#00ff00');
    expect(toHex(parseColor('RebeccaPurple')!)).toBe('#663399');
    expect(parseColor('none')).toBeNull();
    expect(parseColor('url(#x)')).toBeNull();
    expect(parseColor('#12')).toBeNull();
  });

  it('turns units into pixels', () => {
    expect(parseLength('10')).toBe(10);
    expect(parseLength('1in')).toBe(96);
    close(parseLength('25.4mm')!, 96);
    expect(parseLength('50%', 200)).toBe(100);
    expect(parseLength('2em', 0, 10)).toBe(20);
    expect(parseLength('abc')).toBeNull();
  });

  it('reads and combines transforms in order', () => {
    const m = parseTransform('translate(10 20) scale(2)')!;
    expect(apply(m, 1, 1)).toEqual({ x: 12, y: 22 });
    const r = parseTransform('rotate(90 5 5)')!;
    const p = apply(r, 10, 5);
    close(p.x, 5);
    close(p.y, 10);
    expect(parseTransform('matrix(1 0 0 1 3 4)')).toEqual([1, 0, 0, 1, 3, 4]);
    expect(parseTransform('bogus(1)')).toBeNull();
    expect(parseTransform('translate(1) junk')).toBeNull();
    expect(mul([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 5, 5])).toEqual([2, 0, 0, 2, 10, 10]);
  });
});

describe('path data', () => {
  it('reads absolute and relative lines, and closes', () => {
    const r = parsePathData('M10 10 l 20 0 v 10 H 10 z');
    expect(r.problem).toBeUndefined();
    expect(r.paths).toHaveLength(1);
    expect(r.paths[0].closed).toBe(true);
    expect(r.paths[0].points.map((p) => [p.x, p.y])).toEqual([[10, 10], [30, 10], [30, 20], [10, 20]]);
  });

  it('turns quadratics, smooth curves and arcs into cubics', () => {
    const q = parsePathData('M0 0 Q 10 20 20 0').paths[0].points[1];
    expect(q.c1).toEqual({ x: (2 / 3) * 10, y: (2 / 3) * 20 });
    expect(q.c2!.x).toBeCloseTo(20 + (2 / 3) * (10 - 20));
    const s = parsePathData('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0').paths[0].points[2];
    // The first control mirrors the last control of the curve before.
    expect(s.c1).toEqual({ x: 10, y: -10 });
    const half = arcToCubics(0, 0, 10, 10, 0, false, true, 20, 0);
    expect(half).toHaveLength(2);
    const end = half[half.length - 1][2];
    close(end.x, 20);
    close(end.y, 0);
    // Half way round a circle of radius 10 centred on (10, 0) passes through (10, 10) or (10, -10).
    expect(Math.abs(half[0][2].y)).toBeCloseTo(10, 5);
  });

  it('reads arc flags that run into the next number', () => {
    const r = parsePathData('M0 0a10 10 0 00 20 0');
    expect(r.problem).toBeUndefined();
    expect(r.paths[0].points.length).toBeGreaterThan(1);
    expect(parsePathData('M0 0a10 10 0 5 0 20 0').problem).toMatch(/flag/);
  });

  it('puts a closing curve on the first point, the way the format holds it', () => {
    const r = parsePathData('M0 0 L10 0 C 10 5 5 10 0 0 Z').paths[0];
    expect(r.points).toHaveLength(2);
    expect(r.points[0].c1).toEqual({ x: 10, y: 5 });
    expect(r.points[0].c2).toEqual({ x: 5, y: 10 });
  });

  it('starts a new part after Z, keeps what it read before an error, and never throws', () => {
    const two = parsePathData('M0 0 L10 0 L10 10 Z L20 20');
    expect(two.paths).toHaveLength(2);
    const bad = parsePathData('M0 0 L10 10 L 20');
    expect(bad.paths).toHaveLength(1);
    expect(bad.problem).toMatch(/ends in the middle/);
    expect(parsePathData('hello').problem).toBeDefined();
    expect(parsePathData('').paths).toEqual([]);
    expect(parsePathData('M 5 5').paths).toEqual([]);
  });
});

describe('style sheets', () => {
  it('reads simple rules by class, id and element, with the strongest winning', () => {
    const sheet = { rules: [], skipped: [] } as Parameters<typeof addSheet>[0];
    addSheet(sheet, '/* c */ .a{fill:red} #x{fill:blue} rect{fill:green;stroke:#000} rect.a{stroke:none}');
    const el = { name: 'rect', attrs: { id: 'x', class: 'a' }, kids: [] };
    expect(sheetStyle(sheet, el)).toEqual({ fill: 'blue', stroke: 'none' });
  });

  it('counts the rules it cannot judge', () => {
    const sheet = { rules: [], skipped: [] } as Parameters<typeof addSheet>[0];
    addSheet(sheet, 'g > path{fill:red} .a:hover{fill:blue} @media print{.a{fill:red}} @font-face{src:url(x)} .ok{fill:red}');
    expect(sheet.rules).toHaveLength(1);
    expect(sheet.skipped).toHaveLength(4);
  });

  it('splits inline style, keeping url(...) and !important', () => {
    expect(parseDecls('fill:url(#a;b) ; stroke : red !important;;bad')).toEqual({ fill: 'url(#a;b)', stroke: 'red' });
  });
});

describe('importing SVG', () => {
  it('brings in an Inkscape file as layers, with groups, gradients, transforms and what it left out', () => {
    const svg = importSvg(fixture('inkscape-layers.svg'), 'hero');
    // 200mm x 100mm at 96 to the inch.
    expect(svg.width).toBe(756);
    expect(svg.height).toBe(378);
    expect(svg.layers.map((l) => [l.name, l.visible, l.shapes.length])).toEqual([
      ['Sky', true, 1],
      ['Hero', true, 3],
      ['Notes', false, 1],
    ]);
    const sky = svg.layers[0].shapes[0] as PathShape;
    expect(sky.fill).toBe('#102040');
    expect(sky.fillGradient?.kind).toBe('linear');
    expect(sky.fillGradient?.stops.map((s) => s.color)).toEqual(['#102040', '#4080ff']);
    // The gradient runs top to bottom of the 756 x 378 rectangle.
    expect(sky.fillGradient!.from.y).toBeCloseTo(0);
    expect(sky.fillGradient!.to.y).toBeCloseTo(100 * (96 / 25.4), 3);
    const [circle, tri, curve] = svg.layers[1].shapes as PathShape[];
    // The layer's translate(20,10) and the 3.7795 scale both apply: the circle's right edge is at (20 + 30 + 10) units.
    const k = 96 / 25.4;
    const xs = circle.paths[0].points.map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(60 * k, 2);
    expect(circle.stroke).toMatchObject({ color: '#000000', join: 'round' });
    close(circle.stroke!.width, 2 * k, 1e-3);
    expect(tri.fill).toBe('#ff0000');
    expect(tri.opacity).toBe(0.5);
    expect(tri.stroke).toBeNull();
    // The circle and the triangle sit in one group; the lone curve is not in a group.
    expect(circle.group).toBeDefined();
    expect(circle.group).toBe(tri.group);
    expect(curve.group).toBeUndefined();
    expect(curve.fill).toBeNull();
    const note = svg.layers[2].shapes[0] as unknown as TextShape;
    expect(note).toMatchObject({ type: 'text', text: 'Hi', font: 'Arial', size: 8, color: '#ffffff' });
    expect(svg.left.some((l) => /1 filter effect/.test(l))).toBe(true);
    expect(svg.left).toHaveLength(1);
    expect(svg.info.join(' ')).toMatch(/Text came in as text/);
  });

  it('brings in an Illustrator file: class styles, a polygon, a dashed line, group opacity', () => {
    const svg = importSvg(fixture('illustrator-classes.svg'), 'logo');
    expect([svg.width, svg.height]).toEqual([64, 64]);
    expect(svg.layers.map((l) => l.name)).toEqual(['Logo']);
    const [tri, poly, rect, ell] = paths(svg);
    expect(tri.fill).toBe('#ff6600');
    expect(poly.fill).toBeNull();
    expect(poly.stroke).toMatchObject({ color: '#222222', width: 2 });
    expect(poly.paths[0].closed).toBe(true);
    // A rounded rectangle is four straight sides and four curved corners.
    expect(rect.paths[0].points.filter((p) => p.c1).length).toBe(4);
    expect(rect.opacity).toBe(0.5);
    expect(ell.opacity).toBe(0.5);
    expect(rect.group).toBe(ell.group);
    expect(rect.fill).toBe('#0066ff');
    expect(svg.left.join('\n')).toMatch(/1 dashed line/);
    expect(svg.left).toHaveLength(1);
    // The group's see-through is applied to each shape: a change, not a loss.
    expect(svg.info.join('\n')).toMatch(/1 group with see-through/);
  });

  it('applies a viewBox with a different size, centring the picture', () => {
    const svg = importSvg(wrap('<rect width="10" height="10"/>', 'width="200" height="100" viewBox="0 0 10 10"'));
    expect([svg.width, svg.height]).toEqual([200, 100]);
    // The square keeps its shape: scaled by 10 and centred across the wider picture.
    const xs = paths(svg)[0].paths[0].points.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(50);
    expect(Math.max(...xs)).toBeCloseTo(150);
  });

  it('takes the size from the drawing when the file has none', () => {
    const svg = importSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="90" height="40"/></svg>');
    expect([svg.width, svg.height]).toEqual([100, 50]);
  });

  it('follows <use> and <defs>, and resolves gradient inheritance', () => {
    const svg = importSvg(
      wrap(`<defs><linearGradient id="base"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>
      <linearGradient id="g" xlink:href="#base" x1="0" y1="0" x2="1" y2="0"/><path id="p" d="M0 0H10V10H0Z" fill="url(#g)"/></defs>
      <use xlink:href="#p" x="30" y="40"/>`),
    );
    const p = paths(svg)[0];
    expect(p.paths[0].points[0]).toMatchObject({ x: 30, y: 40 });
    expect(p.fillGradient!.stops.map((s) => s.color)).toEqual(['#ff0000', '#0000ff']);
    // Across the shape's own box, so from x = 30 to x = 40.
    expect(p.fillGradient!.from.x).toBeCloseTo(30);
    expect(p.fillGradient!.to.x).toBeCloseTo(40);
  });

  it('keeps a radial gradient as a centre and a reach, through a transform', () => {
    const svg = importSvg(wrap(`<defs><radialGradient id="r" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="20" gradientTransform="translate(10 0)"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><circle cx="50" cy="50" r="30" fill="url(#r)"/>`));
    const g = paths(svg)[0].fillGradient!;
    expect(g.kind).toBe('radial');
    expect(g.from).toEqual({ x: 60, y: 50 });
    expect(g.to).toEqual({ x: 80, y: 50 });
  });

  it('says which things it left out, with counts', () => {
    const svg = importSvg(
      wrap(`<defs><pattern id="pt" width="4" height="4"><rect width="2" height="2"/></pattern><mask id="m"><rect width="9" height="9" fill="#fff"/></mask>
      <clipPath id="c"><circle r="3" cx="5" cy="5"/></clipPath><marker id="mk"/></defs>
      <rect width="10" height="10" fill="url(#pt)"/>
      <rect width="10" height="10" mask="url(#m)"/>
      <rect width="10" height="10" clip-path="url(#c)"/>
      <path d="M0 0L5 5" stroke="red" marker-end="url(#mk)"/>
      <image href="data:image/png;base64,AAAA" width="5" height="5"/>
      <foreignObject width="5" height="5"/>
      <rect width="10" height="10" style="mix-blend-mode:multiply"/>
      <rect width="10" height="10" display="none"/>
      <animate attributeName="x" from="0" to="1" dur="1s"/>
      <rect width="10" height="10" fill="url(#nothere)"/>`),
    );
    const left = svg.left.join('\n');
    expect(left).toMatch(/1 pattern fill/);
    expect(left).toMatch(/1 mask/);
    expect(left).toMatch(/1 clipping path/);
    expect(left).toMatch(/1 line end marker/);
    expect(left).toMatch(/1 picture/);
    expect(left).toMatch(/1 embedded web element/);
    expect(left).toMatch(/1 shape with a blend mode/);
    expect(left).toMatch(/1 hidden shape/);
    expect(left).toMatch(/1 animation/);
    expect(left).toMatch(/1 reference/);
    // The pattern became grey, so the shape is still there.
    expect(paths(svg)[0].fill).toBe('#808080');
  });

  it('does not count a clip that is the whole picture (Figma wraps everything in one)', () => {
    const svg = importSvg(wrap(`<g clip-path="url(#c)"><rect width="30" height="30" fill="red"/></g><defs><clipPath id="c"><rect width="100" height="100" fill="white"/></clipPath></defs>`));
    expect(svg.left).toEqual([]);
    expect(paths(svg)).toHaveLength(1);
  });

  it('puts a fill rule note on overlapping parts that would show a hole', () => {
    const ring = [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }, { closed: true, points: [{ x: 2, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 6 }] }];
    expect(nonzeroDiffers(ring)).toBe(true);
    // Turning the other way makes a real hole in both rules.
    expect(nonzeroDiffers([ring[0], { closed: true, points: [...ring[1].points].reverse() }])).toBe(false);
    const svg = importSvg(wrap('<path d="M0 0H10V10H0Z M2 2H8V8H2Z"/>'));
    expect(svg.info.join('')).toMatch(/nonzero/);
    expect(svg.left).toEqual([]);
    expect(importSvg(wrap('<path fill-rule="evenodd" d="M0 0H10V10H0Z M2 2H8V8H2Z"/>')).info).toEqual([]);
  });

  it('brings in text as text with its place, size and look', () => {
    const svg = importSvg(wrap(`<text x="10" y="40" font-family="'Nunito Variable', sans-serif" font-size="20" font-weight="bold" font-style="italic" text-anchor="middle" fill="#112233"><tspan>Hello</tspan><tspan x="10" dy="24">there</tspan></text>`));
    const t = svg.layers[0].shapes[0] as TextShape;
    expect(t).toMatchObject({ type: 'text', text: 'Hello\nthere', font: 'Nunito', size: 20, weight: 700, italic: true, align: 'center', color: '#112233', lineHeight: 1.2 });
    expect(t.transform).toMatchObject({ x: 10, y: 40, scaleX: 1, scaleY: 1, rotation: 0 });
  });

  it('turns a rotated, scaled text group into the text shape\'s own transform', () => {
    const svg = importSvg(wrap(`<g transform="translate(50 50) rotate(90) scale(2)"><text x="0" y="0">A</text></g>`));
    const t = svg.layers[0].shapes[0] as TextShape;
    expect(t.transform.x).toBeCloseTo(50);
    expect(t.transform.rotation).toBeCloseTo(90);
    expect(t.transform.scaleX).toBeCloseTo(2);
    expect(t.transform.scaleY).toBeCloseTo(2);
  });

  it('keeps the shape when a stroke is scaled non-uniformly, using the average', () => {
    const svg = importSvg(wrap('<path transform="scale(4 1)" d="M0 0L10 0" stroke="#000" stroke-width="2"/>'));
    expect(paths(svg)[0].stroke!.width).toBeCloseTo(4);
  });

  it('reads a packed .svgz and UTF-16 text', () => {
    const text = wrap('<rect width="5" height="5"/>');
    const packed = gzipSync(new TextEncoder().encode(text));
    expect(svgTextOf(packed, gunzipSync)).toBe(text);
    const u16 = new Uint8Array(2 + text.length * 2);
    u16[0] = 0xff;
    u16[1] = 0xfe;
    for (let i = 0; i < text.length; i++) u16[2 + i * 2] = text.charCodeAt(i);
    expect(svgTextOf(u16, gunzipSync)).toBe(text);
    expect(() => svgTextOf(new Uint8Array([0x1f, 0x8b, 1, 2, 3]), gunzipSync)).toThrow(/damaged/);
  });

  it('comes back from Frameling\'s own SVG export with layers, shapes, gradients and text', () => {
    const doc = newDoc({ width: 100, height: 50, background: null });
    doc.layers[0].name = 'Back art';
    const v = newVectorDrawing();
    v.shapes.push({
      id: 'p',
      type: 'path',
      paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0, c1: { x: 3, y: -4 }, c2: { x: 7, y: -4 } }, { x: 10, y: 10 }] }],
      fill: '#00ff0080',
      fillGradient: { kind: 'linear', stops: [{ at: 0, color: '#ff0000' }, { at: 1, color: '#0000ff80' }], from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
      stroke: { color: '#000000', width: 2, join: 'round', cap: 'square' },
      opacity: 0.75,
    });
    v.shapes.push({ id: 't', type: 'text', text: 'Hi', font: 'Nunito', size: 20, weight: 700, color: '#112233', align: 'left', opacity: 1, transform: { x: 50, y: 30, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } } as never);
    doc.drawings[v.id] = v;
    doc.layers[0].cels.push({ id: 'c', start: 0, length: 1, drawingId: v.id });
    const svg = importSvg(frameToSvg(doc, 0));
    expect([svg.width, svg.height]).toEqual([100, 50]);
    expect(svg.layers.map((l) => l.name)).toEqual(['Back art']);
    const [p, t] = svg.layers[0].shapes as [PathShape, TextShape];
    expect(p.paths[0].points[1]).toMatchObject({ x: 10, y: 0, c1: { x: 3, y: -4 }, c2: { x: 7, y: -4 } });
    expect(p.fillGradient!.stops.map((s) => s.color)).toEqual(['#ff0000', '#0000ff80']);
    expect(p.stroke).toMatchObject({ width: 2, join: 'round', cap: 'square' });
    expect(p.opacity).toBe(0.75);
    expect(t).toMatchObject({ text: 'Hi', font: 'Nunito', size: 20, weight: 700, color: '#112233' });
    expect(t.transform.x).toBeCloseTo(50, 1);
    expect(svg.left).toEqual([]);
  });

  it('fails in plain words for a file that is not a readable SVG', () => {
    const fails = (s: string, re: RegExp) => expect(() => importSvg(s)).toThrow(re);
    fails('', /nothing in that file/);
    fails('hello, this is a text file', /nothing in that file|readable SVG/);
    fails('<html><body/></html>', /isn't an SVG: it starts with <html> instead of <svg>/);
    fails('<svg><g><path d="M0 0"></svg>', /isn't a readable SVG: the tag <\/svg> doesn't match/);
    fails('<svg width="10"', /isn't a readable SVG/);
    expect(() => importSvg('<svg><g>')).toThrow(SvgProblem);
    fails(`\u0000\u0001binary`, /readable SVG|nothing/);
  });

  it('copes with a file whose copies make copies without end', () => {
    // Each level uses the one below it ten times over: ten to the power of twelve, if it were all drawn.
    const tower = (base: string) => {
      let defs = `<g id="g0">${base}</g>`;
      for (let i = 1; i <= 12; i++) defs += `<g id="g${i}">${`<use href="#g${i - 1}"/>`.repeat(10)}</g>`;
      return wrap(`<defs>${defs}</defs><use href="#g12"/>`);
    };
    // Drawing something: it stops at the limit and says how many it left.
    const some = importSvg(tower('<rect width="1" height="1"/>'));
    expect(some.counts.shapes).toBe(60000);
    expect(some.left.join(' ')).toMatch(/past the limit of 60,000/);
    // Drawing nothing: it would never end, so it gives up and says why.
    expect(() => importSvg(tower(''))).toThrow(/too complicated to bring in/);
  });

  it('survives hostile and odd input without crashing', () => {
    // Deep groups, huge counts, NaN-ish numbers, missing attributes, recursive <use>.
    const deep = wrap('<g>'.repeat(150) + '<rect width="5" height="5"/>' + '</g>'.repeat(150));
    expect(paths(importSvg(deep))).toHaveLength(1);
    const loop = importSvg(wrap('<defs><g id="a"><use href="#a"/></g></defs><use href="#a"/><rect width="NaN" height="5"/><circle r="-3"/><path d="M0 0 L Infinity 5"/>'));
    expect(paths(loop)).toHaveLength(0);
    const empty = importSvg(wrap(''));
    expect(empty.layers).toHaveLength(1);
    expect(empty.layers[0].shapes).toEqual([]);
  });
});

describe('the badge the help pictures open', () => {
  it('comes in as three layers, with the blur, the dashes and the mask named', () => {
    const svg = importSvg(readFileSync(new URL('../../scripts/docs/help/assets/import-logo.svg', import.meta.url), 'utf8'), 'badge');
    expect([svg.width, svg.height]).toEqual([320, 240]);
    expect(svg.layers.map((l) => l.name)).toEqual(['Background', 'Badge', 'Words']);
    expect(svg.counts.text).toBe(1);
    expect(svg.counts.gradients).toBe(2);
    const s = svg.left.join('\n');
    expect(s).toMatch(/1 filter effect/);
    expect(s).toMatch(/1 dashed line/);
    expect(s).toMatch(/1 mask/);
  });
});
