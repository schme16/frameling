/**
 * Illustrator's own data for a .ai file, so layers, folders and artboards arrive as real ones.
 *
 * A .ai file is a PDF, and Adobe Illustrator reads two things from it: the PDF drawing (when it knows nothing else, it
 * imports that, which flattens layers into groups and asks for a page), and its own private data kept in the page's
 * /PieceInfo /Illustrator /Private streams (AIMetaData and AIPrivateData1..n). That data is the document as the
 * PostScript style operators Illustrator has used since version 3 ("%AI5_BeginLayer", "m", "L", "c", "Xa", ...), split into
 * 64 KB blocks. When it is there Illustrator opens it as its own file.
 *
 * This writes that data from the same drawing the PDF part holds: it reads the PDF content streams the writer made (a small
 * set of operators, see `translate`) and says the same things in Illustrator's operators. Layers and folders come from the
 * PDF layers (optional content) the writer wraps each unit in, artboards from the pages. Everything is our own text; only
 * the names of the operators and the layout of the file come from what Illustrator itself writes and reads.
 *
 * Pure: no canvas needed.
 */
import type { Color, Gradient } from '../core/format';
import { sortedStops } from '../core/gradient';
import type { RawImage } from '../io/png';
import type { PdfWriter } from './pdf';
import { liveFontName } from './ai-fonts';
import { textItem, textSetupLines, type AiTextFrame } from './ai-text';

type Mat = [number, number, number, number, number, number];
const ident: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
  // m applied first, then n (PDF's cm order: new = m x current)
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const r4 = (v: number) => {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A string in Illustrator's brackets: the escapes it uses, the rest as UTF-8. */
export function aiString(s: string): string {
  return '(' + s.replace(/[\\()]/g, (c) => '\\' + c).replace(/[\r\n]+/g, ' ') + ')';
}

// ---------------------------------------------------------------- colour

type Rgb = [number, number, number];

/** The CMYK numbers that go with an RGB colour (the file is an RGB document; Illustrator shows the RGB part). */
function cmyk([r, g, b]: Rgb): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}

/** Colour numbers the way Illustrator writes a custom colour: cyan magenta yellow black, then red green blue. */
const colorOps = (c: Rgb): string => [...cmyk(c), ...c].map(r4).join(' ');

function parseHex(c: Color): { rgb: Rgb; a: number } {
  const h = c.replace('#', '');
  const f = h.length === 3 || h.length === 4 ? [...h].map((x) => x + x).join('') : h;
  const v = (i: number) => parseInt(f.slice(i, i + 2), 16) / 255;
  return { rgb: [v(0) || 0, v(2) || 0, v(4) || 0], a: f.length >= 8 ? v(6) : 1 };
}

// ---------------------------------------------------------------- the tree of layers

/** A group of items with its own opacity and blend (Illustrator stores them after the items). */
interface AiGroup {
  kind: 'group';
  items: AiItem[];
  opacity: number;
  blend: number;
}
/** A picture: its operators, the pixel bytes, and what closes it. */
interface AiRaster {
  kind: 'raster';
  head: string;
  body: Uint8Array;
  tail: string;
}
type AiItem = string | AiGroup | AiRaster;

interface AiLayer {
  name: string;
  items: AiItem[];
  children: AiLayer[];
  opacity: number;
  blend: number;
  /** Switched off in the document. */
  hidden?: boolean;
}

const BLEND_INDEX: Record<string, number> = {
  Normal: 0,
  Multiply: 1,
  Screen: 2,
  Overlay: 3,
  SoftLight: 4,
  HardLight: 5,
  ColorDodge: 6,
  ColorBurn: 7,
  Darken: 8,
  Lighten: 9,
  Difference: 10,
  Exclusion: 11,
  Hue: 12,
  Saturation: 13,
  Color: 14,
  Luminosity: 15,
};

interface Sub {
  segs: { op: 'm' | 'l' | 'c'; p: number[] }[];
  closed: boolean;
}

interface GState {
  ctm: Mat;
  fill: Rgb;
  stroke: Rgb;
  lw: number;
  cap: number;
  join: number;
  /** Dashes and gaps (as the page has them), and where the pattern starts. */
  dash: number[];
  phase: number;
  ca: number;
  CA: number;
  blend: string;
  fade: boolean;
}

/** What Illustrator needs written once for the whole file. */
interface Resources {
  gradients: Map<string, { name: string; gradient: Gradient }>;
  /** The live text frames, in the order their art items name them. */
  texts: AiTextFrame[];
  /** Where the text space (y down, centred on 8191) has the first artboard's corner. */
  origin: [number, number];
}

/** The artboards, and the drawing of each page read into layers. */
export interface AiPageInput {
  content: string;
  /** Page size in points. */
  width: number;
  height: number;
}

interface Run {
  w: PdfWriter;
  res: Resources;
  /** Where this page's artboard starts across. Art coordinates are the artboards' own: y up from the bottom edge of the page. */
  x0: number;
  y0: number;
}

const CAP_NUM: Record<string, number> = { butt: 0, round: 1, square: 2 };
const JOIN_NUM: Record<string, number> = { miter: 0, round: 1, bevel: 2 };

const gsOf = (): GState => ({ ctm: ident, fill: [0, 0, 0], stroke: [0, 0, 0], lw: 1, cap: 1, join: 1, dash: [], phase: 0, ca: 1, CA: 1, blend: 'Normal', fade: false });

/** Reads one page's content stream into layers. */
function translate(run: Run, content: string, rootName: string): AiLayer[] {
  const roots: AiLayer[] = [];
  const mk = (name: string): AiLayer => ({ name, items: [], children: [], opacity: 1, blend: 0 });
  // Containers being filled: layers (with their items) and groups.
  type Box = { layer: AiLayer } | { group: AiGroup };
  const boxes: Box[] = [];
  const layerStack: AiLayer[] = [];
  // What each open `BDC` is: a layer, or a marked piece (live text, a gradient line) whose drawing is only the PDF part's outlines.
  type Mark = { kind: 'oc' } | { kind: 'text' | 'stroke'; id: number; sink: AiGroup };
  const marks: Mark[] = [];

  const items = (): AiItem[] => {
    const b = boxes[boxes.length - 1];
    if (b) return 'layer' in b ? b.layer.items : b.group.items;
    // Drawing outside any layer (nothing the writer makes, but be safe) goes into one extra layer.
    let l = roots.find((r) => r.name === rootName);
    if (!l) roots.push((l = mk(rootName)));
    return l.items;
  };

  let gs = gsOf();
  const saved: GState[] = [];
  let subs: Sub[] = [];
  let cur: Sub | null = null;
  let cx = 0;
  let cy = 0;
  let pendingClip = false;
  // A fill that may be joined by a stroke of the same outline.
  let pendingFill: { key: string; subs: Sub[]; rgb: Rgb; a: number; rule: boolean; blend: number } | null = null;

  const pt = (x: number, y: number): [number, number] => {
    const [px, py] = apply(gs.ctm, x, y);
    return [px + run.x0, py - run.y0];
  };
  const scale = () => Math.sqrt(Math.abs(gs.ctm[0] * gs.ctm[3] - gs.ctm[1] * gs.ctm[2]));

  const subText = (s: Sub): string[] => {
    const out: string[] = [];
    const first = s.segs[0];
    out.push(`${r4(first.p[0])} ${r4(first.p[1])} m`);
    for (let i = 1; i < s.segs.length; i++) {
      const g = s.segs[i];
      out.push(g.op === 'c' ? `${g.p.map(r4).join(' ')} c` : `${r4(g.p[0])} ${r4(g.p[1])} L`);
    }
    if (s.closed) {
      const last = s.segs[s.segs.length - 1];
      const lp = last.p.slice(-2);
      // Illustrator writes the closing point again before the closing paint operator.
      if (Math.abs(lp[0] - first.p[0]) > 1e-6 || Math.abs(lp[1] - first.p[1]) > 1e-6) out.push(`${r4(first.p[0])} ${r4(first.p[1])} L`);
    }
    return out;
  };

  const flushFill = () => {
    if (!pendingFill) return;
    const f = pendingFill;
    pendingFill = null;
    paintPath(f.subs, { fill: f.rgb, fillA: f.a, rule: f.rule, blend: f.blend });
  };

  /** Writes the paths as Illustrator items: a path, or a compound path for several. */
  function paintPath(
    list: Sub[],
    p: { fill?: Rgb; fillA?: number; stroke?: Rgb; strokeA?: number; width?: number; cap?: number; join?: number; dash?: number[]; phase?: number; rule?: boolean; blend: number; gradient?: { g: Gradient; ctm: Mat }; strokeGradient?: { g: Gradient; ctm: Mat } },
  ): void {
    const out: string[] = [];
    if (p.strokeGradient) {
      // A line painted with a gradient: no fill, and each path takes the gradient across itself.
      const live = list.filter((s) => s.segs.length > 1);
      if (!live.length) return;
      out.push('0 O', '0 R', `${p.blend} ${r4(p.strokeA ?? 1)} 0 0 0 Xy`, `${p.cap ?? 0} J ${p.join ?? 0} j ${r4(p.width ?? 1)} w 10 M []0 d`, '0 XR');
      if (live.length > 1) out.push('*u');
      for (const s of live) {
        out.push(...subText(s));
        out.push(...gradientBlock(run, p.strokeGradient.g, p.strokeGradient.ctm, run.x0, s, { stroke: s.closed ? 's' : 'S', width: p.width ?? 1 }));
        out.push('2 BB');
      }
      if (live.length > 1) out.push('*U');
      out.push('0 1 0 0 0 Xy');
      items().push(out.join('\n'));
      return;
    }
    const opacity = p.gradient ? (p.fillA ?? 1) : Math.max(p.fill ? (p.fillA ?? 1) : 0, p.stroke ? (p.strokeA ?? 1) : 0);
    // A fill and stroke at different strengths are two items, so each keeps its own.
    if (p.fill && p.stroke && Math.abs((p.fillA ?? 1) - (p.strokeA ?? 1)) > 0.002) {
      paintPath(list, { ...p, stroke: undefined });
      paintPath(list, { ...p, fill: undefined });
      return;
    }
    out.push('0 O');
    if (p.fill) out.push(`${colorOps(p.fill)} Xa`);
    out.push('0 R');
    if (p.stroke) out.push(`${colorOps(p.stroke)} XA`);
    out.push(`${p.blend} ${r4(opacity)} 0 0 0 Xy`);
    out.push(`${p.cap ?? 0} J ${p.join ?? 0} j ${r4(p.width ?? 1)} w 10 M [${(p.dash ?? []).map(r4).join(' ')}]${r4(p.phase ?? 0)} d`);
    out.push(`${p.rule ? 1 : 0} XR`);
    const live = list.filter((s) => s.segs.length > 1);
    if (!live.length) return;
    const paint = (s: Sub): string => (p.fill && p.stroke ? (s.closed ? 'b' : 'B') : p.fill ? (s.closed ? 'f' : 'F') : s.closed ? 's' : 'S');
    const several = live.length > 1;
    if (several) out.push('*u');
    for (const s of live) {
      out.push(...subText(s));
      if (p.gradient) out.push(...gradientBlock(run, p.gradient.g, p.gradient.ctm, run.x0, s));
      else out.push(paint(s));
      if (p.gradient) out.push('0 BB');
    }
    if (several) out.push('*U');
    out.push('0 1 0 0 0 Xy');
    items().push(out.join('\n'));
  }

  const subKey = (l: Sub[]) => l.map((s) => s.segs.map((g) => g.p.map((v) => Math.round(v * 100)).join(',')).join(';') + (s.closed ? 'z' : '')).join('|');

  const finishPath = (op: string) => {
    if (cur) subs.push(cur);
    cur = null;
    const list = subs;
    subs = [];
    const clip = pendingClip;
    pendingClip = false;
    if (op === 'n') return; // only a clip, handled with `sh`
    void clip;
    const blend = BLEND_INDEX[gs.blend] ?? 0;
    const dashOf = () => (gs.dash.length ? { dash: gs.dash.map((v) => v * scale()), phase: gs.phase * scale() } : {});
    if (op === 'f' || op === 'f*') {
      flushFill();
      pendingFill = { key: subKey(list), subs: list, rgb: gs.fill, a: gs.ca, rule: op === 'f*', blend };
    } else if (op === 'S') {
      const w = gs.lw * scale();
      if (pendingFill && pendingFill.key === subKey(list) && Math.abs(pendingFill.a - gs.CA) < 0.002) {
        const f = pendingFill;
        pendingFill = null;
        paintPath(list, { fill: f.rgb, fillA: f.a, stroke: gs.stroke, strokeA: gs.CA, width: w, cap: gs.cap, join: gs.join, ...dashOf(), rule: f.rule, blend });
      } else {
        flushFill();
        paintPath(list, { stroke: gs.stroke, strokeA: gs.CA, width: w, cap: gs.cap, join: gs.join, ...dashOf(), blend });
      }
    }
  };

  // Group forms (`Do`): a transparency group with opacity or blend becomes an Illustrator group; the rest is inlined.
  const runForm = (name: string) => {
    const text = run.w.formInfo.get(name);
    if (text === undefined) return;
    const wraps = !gs.fade && (gs.ca < 0.999 || gs.blend !== 'Normal');
    flushFill();
    if (wraps) {
      const g: AiGroup = { kind: 'group', items: [], opacity: gs.ca, blend: BLEND_INDEX[gs.blend] ?? 0 };
      items().push(g);
      boxes.push({ group: g });
      const outer = gs;
      gs = { ...gs, ca: 1, CA: 1, blend: 'Normal' };
      exec(text);
      flushFill();
      gs = outer;
      boxes.pop();
    } else {
      const outer = gs;
      exec(text);
      flushFill();
      gs = outer;
    }
  };

  const drawImage = (name: string) => {
    const img = run.w.imageInfo.get(name);
    if (!img) return;
    flushFill();
    const blend = BLEND_INDEX[gs.blend] ?? 0;
    items().push(rasterItem(img, gs.ctm, run.x0, run.y0, gs.ca, blend));
  };

  const shade = (name: string) => {
    const g = run.w.shadingInfo.get(name);
    if (!g || !subs.length) return;
    flushFill();
    const list = subs;
    subs = [];
    cur = null;
    paintPath(list, { fillA: gs.ca, blend: BLEND_INDEX[gs.blend] ?? 0, rule: false, gradient: { g, ctm: gs.ctm }, fill: [0, 0, 0] });
  };

  /** A text the PDF part drew as outlines becomes a live Illustrator text frame. */
  const liveText = (id: number) => {
    const info = run.w.liveInfo.get(id);
    if (!info || info.kind !== 'text') return;
    // The text's own space to the page (points, y up), then to the file's art space.
    const mp = mul(info.matrix as Mat, gs.ctm);
    let [a, b, c, d, tx, ty] = [mp[0], -mp[1], mp[2], -mp[3], mp[4] + run.x0, mp[5] - run.y0];
    // A turned, evenly scaled text keeps its size as the font size; anything else keeps the scale in the matrix.
    const k = Math.hypot(a, b);
    const similar = k > 1e-6 && Math.abs(Math.hypot(c, d) - k) < k * 1e-3 && Math.abs(a * c + b * d) < k * k * 1e-3 && a * d - b * c > 0;
    const size = similar ? info.size * k : info.size;
    if (similar) [a, b, c, d] = [a / k, b / k, c / k, d / k];
    const [ox, oy] = run.res.origin;
    // The frame's own origin sits at the text space's origin: the matrix has to carry that to where the text goes.
    const fx = ox + tx;
    const fy = oy - ty;
    const m: Mat = [a, b, c, d, fx - (a * ox + c * oy), fy - (b * ox + d * oy)];
    const col = parseHex(info.color);
    const index = run.res.texts.length;
    run.res.texts.push({
      text: info.text,
      font: liveFontName(info.font, info.weight, info.italic),
      size,
      rgb: col.rgb,
      align: info.align === 'center' ? 2 : info.align === 'right' ? 1 : 0,
      leading: info.lineHeight * size,
      tracking: (info.letterSpacing / Math.max(1e-6, info.size)) * 1000,
      m,
    });
    items().push(textItem(index, 0, info.opacity * col.a));
  };

  /** A gradient line the PDF part drew as an outline becomes a path with a real gradient stroke. */
  const liveStroke = (id: number) => {
    const info = run.w.liveInfo.get(id);
    if (!info || info.kind !== 'stroke') return;
    const list: Sub[] = [];
    for (const sp of info.paths) {
      const pts = sp.points;
      if (!pts.length) continue;
      const sub: Sub = { segs: [{ op: 'm', p: pt(pts[0].x, pts[0].y) }], closed: !!sp.closed };
      const seg = (i: number) => {
        const q = pts[i];
        if (q.c1 && q.c2) sub.segs.push({ op: 'c', p: [...pt(q.c1.x, q.c1.y), ...pt(q.c2.x, q.c2.y), ...pt(q.x, q.y)] });
        else sub.segs.push({ op: 'l', p: pt(q.x, q.y) });
      };
      for (let i = 1; i < pts.length; i++) seg(i);
      if (sp.closed && pts[0].c1 && pts[0].c2) seg(0);
      list.push(sub);
    }
    if (!list.length) return;
    flushFill();
    paintPath(list, { stroke: [0, 0, 0], strokeA: info.opacity, width: info.width * scale(), cap: CAP_NUM[info.cap] ?? 1, join: JOIN_NUM[info.join] ?? 1, blend: BLEND_INDEX[gs.blend] ?? 0, strokeGradient: { g: info.gradient, ctm: gs.ctm } });
  };

  function exec(text: string): void {
    const tok = text.split(/\s+/).filter(Boolean);
    const st: (string | number)[] = [];
    const num = (i: number) => Number(st[st.length - i]);
    // A dash array arrives as `[3 2] 0 d`: gather what is between the brackets.
    let arr: number[] | null = null;
    let lastArr: number[] = [];
    for (const t of tok) {
      if (t.startsWith('[') || arr) {
        const body = t.startsWith('[') ? t.slice(1) : t;
        if (t.startsWith('[')) arr = [];
        const end = body.endsWith(']');
        const text = end ? body.slice(0, -1) : body;
        if (text && Number.isFinite(Number(text))) arr!.push(Number(text));
        if (end) {
          lastArr = arr!;
          arr = null;
        }
        continue;
      }
      const c = t.charCodeAt(0);
      if (c === 47 || c === 45 || c === 46 || (c >= 48 && c <= 57)) {
        st.push(c === 47 ? t : Number(t));
        continue;
      }
      switch (t) {
        case 'q':
          saved.push(gs);
          gs = { ...gs };
          break;
        case 'Q':
          flushFill();
          gs = saved.pop() ?? gs;
          break;
        case 'cm':
          gs = { ...gs, ctm: mul([num(6), num(5), num(4), num(3), num(2), num(1)], gs.ctm) };
          break;
        case 'rg':
          gs = { ...gs, fill: [num(3), num(2), num(1)] };
          break;
        case 'RG':
          gs = { ...gs, stroke: [num(3), num(2), num(1)] };
          break;
        case 'w':
          gs = { ...gs, lw: num(1) };
          break;
        case 'J':
          gs = { ...gs, cap: num(1) };
          break;
        case 'j':
          gs = { ...gs, join: num(1) };
          break;
        case 'd':
          gs = { ...gs, dash: lastArr, phase: num(1) };
          break;
        case 'gs': {
          const info = run.w.gsInfo.get(String(st[st.length - 1]).slice(1));
          if (info) gs = { ...gs, ca: info.fill, CA: info.stroke, blend: info.blend, fade: info.fade || gs.fade };
          break;
        }
        case 'm': {
          if (cur) subs.push(cur);
          const [x, y] = pt(num(2), num(1));
          cur = { segs: [{ op: 'm', p: [x, y] }], closed: false };
          cx = num(2);
          cy = num(1);
          break;
        }
        case 'l':
          if (cur) cur.segs.push({ op: 'l', p: pt(num(2), num(1)) });
          cx = num(2);
          cy = num(1);
          break;
        case 'c':
          if (cur) cur.segs.push({ op: 'c', p: [...pt(num(6), num(5)), ...pt(num(4), num(3)), ...pt(num(2), num(1))] });
          cx = num(2);
          cy = num(1);
          break;
        case 're': {
          if (cur) subs.push(cur);
          const x = num(4);
          const y = num(3);
          const w = num(2);
          const h = num(1);
          cur = { segs: [{ op: 'm', p: pt(x, y) }, { op: 'l', p: pt(x + w, y) }, { op: 'l', p: pt(x + w, y + h) }, { op: 'l', p: pt(x, y + h) }], closed: true };
          subs.push(cur);
          cur = null;
          break;
        }
        case 'h':
          if (cur) cur.closed = true;
          break;
        case 'f':
        case 'f*':
        case 'S':
          finishPath(t);
          break;
        case 'W':
        case 'W*':
          pendingClip = true;
          break;
        case 'n':
          if (cur) subs.push(cur);
          cur = null;
          // A clip path followed by `sh` keeps the path for the gradient; any other clip is dropped.
          if (!pendingClip) subs = [];
          break;
        case 'sh':
          shade(String(st[st.length - 1]).slice(1));
          pendingClip = false;
          break;
        case 'Do': {
          const n = String(st[st.length - 1]).slice(1);
          if (n.startsWith('Fm')) runForm(n);
          else drawImage(n);
          break;
        }
        case '<<':
        case '>>':
          continue;
        case 'BDC': {
          flushFill();
          if (st[0] === '/FrText' || st[0] === '/FrStroke') {
            // A marked piece: what the PDF part draws inside it goes nowhere; the data gets the live version at its end.
            const sink: AiGroup = { kind: 'group', items: [], opacity: 1, blend: 0 };
            marks.push({ kind: st[0] === '/FrText' ? 'text' : 'stroke', id: Number(st[st.length - 1]), sink });
            boxes.push({ group: sink });
            break;
          }
          marks.push({ kind: 'oc' });
          // `/OC /OCn BDC`: a layer, inside the layer or folder being drawn into.
          const o = run.w.ocgs[Number(String(st[st.length - 1]).replace('/OC', '')) - 1];
          const l = mk(o?.name ?? 'Layer');
          if (o?.hidden) l.hidden = true;
          const parent = layerStack[layerStack.length - 1];
          (parent ? parent.children : roots).push(l);
          layerStack.push(l);
          boxes.push({ layer: l });
          break;
        }
        case 'EMC': {
          flushFill();
          const mark = marks.pop();
          if (mark && mark.kind !== 'oc') {
            boxes.pop();
            if (mark.kind === 'text') liveText(mark.id);
            else liveStroke(mark.id);
            break;
          }
          const l = layerStack.pop();
          boxes.pop();
          if (l) hoist(l);
          break;
        }
        default:
          break;
      }
      st.length = 0;
    }
    void cx;
    void cy;
  }

  exec(content);
  flushFill();
  return roots;
}

/** A layer whose whole content is one group takes that group's opacity and blend as its own. */
function hoist(l: AiLayer): void {
  const g = l.items[0];
  if (l.items.length === 1 && typeof g !== 'string' && g.kind === 'group') {
    // The group was only there to carry the layer's opacity and blend (a folder's layers sit in layers of their own).
    l.items = g.items;
    l.opacity = g.opacity;
    l.blend = g.blend;
  }
}

// ---------------------------------------------------------------- gradients

function gradientName(run: Run, g: Gradient): string {
  const key = JSON.stringify([g.kind, g.stops]);
  let e = run.res.gradients.get(key);
  if (!e) {
    e = { name: `Frameling gradient ${run.res.gradients.size + 1}`, gradient: g };
    run.res.gradients.set(key, e);
  }
  return e.name;
}

/** The lines that turn the path just written into a gradient filled one (up to and including `f`). */
function gradientBlock(run: Run, g: Gradient, ctm: Mat, x0: number, s: Sub, line?: { stroke: 's' | 'S'; width: number }): string[] {
  // A gradient line starts "1 Bb" and ends with the stroke operator; a filled one starts "Bb" and ends with "f".
  const out: string[] = [line ? '1 Bb' : 'Bb'];
  const end = line ? line.stroke : 'f';
  const name = gradientName(run, g);
  const P = (x: number, y: number): [number, number] => {
    const [px, py] = apply(ctm, x, y);
    return [px + x0, py - run.y0];
  };
  const stops = sortedStops(g.stops);
  const bg = `1 ${aiString(name)} 0 0 0 1 1 0 0 1 0 0 1 Bg`;
  if (g.kind === 'radial') {
    const [cx, cy] = P(g.from.x, g.from.y);
    const r = Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y);
    const [ex, ey] = P(g.from.x + r, g.from.y);
    const [fx, fy] = P(g.from.x, g.from.y + r);
    out.push('0 0 0 0 Bh', bg, `${r4(ex - cx)} ${r4(ey - cy)} ${r4(fx - cx)} ${r4(fy - cy)} ${r4(cx)} ${r4(cy)} Bm`, end);
    return out;
  }
  const [x1, y1] = P(g.from.x, g.from.y);
  const [x2, y2] = P(g.to.x, g.to.y);
  const L = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / L;
  const uy = (y2 - y1) / L;
  // The gradient's own width across the path: anything wider than the shape works.
  const ys = s.segs.flatMap((q) => q.p.filter((_, i) => i % 2 === 1));
  const h = Math.max(1, Math.max(...ys) - Math.min(...ys)) + 4 + (line ? line.width * 2 : 0);
  const cc = h * uy;
  const dd = -h * ux;
  const mat = (ax: number, ay: number, bx: number, by: number) => `${r4(bx - ax)} ${r4(by - ay)} ${r4(cc)} ${r4(dd)} ${r4(ax - cc / 2)} ${r4(ay - dd / 2)}`;
  const BIG = 8000;
  out.push(bg, `${mat(x1, y1, x2, y2)} Xm`, `${mat(x1 - ux * BIG, y1 - uy * BIG, x1, y1)} Bc`);
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i].at;
    const b = stops[i + 1].at;
    out.push(`${mat(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b)} Bm`);
  }
  out.push(`${mat(x2, y2, x2 + ux * BIG, y2 + uy * BIG)} Bc`, end);
  return out;
}

/** The definition of one gradient, written once in the document setup. */
function gradientDef(name: string, g: Gradient): string[] {
  const stops = sortedStops(g.stops);
  const out: string[] = [`%AI5_BeginGradient: ${aiString(name)}`, `${aiString(name)} ${g.kind === 'radial' ? 1 : 0} ${stops.length} 0 0 Bd`];
  const colour = (i: number) => parseHex(stops[i].color);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  // One run of 256 samples per stretch between stops, a line of hex per colour part.
  out.push('[');
  for (let seg = 0; seg + 1 < stops.length; seg++) {
    const a = colour(seg).rgb;
    const b = colour(seg + 1).rgb;
    const ca = cmyk(a);
    const cb = cmyk(b);
    const chans: number[][] = [0, 1, 2, 3].map((k) => Array.from({ length: 256 }, (_, i) => lerp(ca[k], cb[k], i / 255)));
    const rgbc: number[][] = [0, 1, 2].map((k) => Array.from({ length: 256 }, (_, i) => lerp(a[k], b[k], i / 255)));
    for (const arr of [...chans, ...rgbc]) {
      const hex = arr.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0').toUpperCase()).join('');
      out.push('<');
      for (let i = 0; i < hex.length; i += 80) out.push(hex.slice(i, i + 80));
      out.push('>');
    }
    out.push('4 %_Br');
  }
  out.push('[');
  // Linear gradients list their stops from the far end, radial ones from the centre.
  for (let k = 0; k < stops.length; k++) {
    const i = g.kind === 'radial' ? k : stops.length - 1 - k;
    const c = colour(i);
    const line = `${colorOps(c.rgb)} 2 ${r4(c.a)} 6 50 ${r4(stops[i].at * 100)}`;
    out.push(`${line} %_BS`, `%_${line} Bs`);
  }
  out.push('BD', '%AI5_EndGradient');
  return out;
}

// ---------------------------------------------------------------- rasters

/** A picture as an Illustrator raster item: RGB, then an alpha plane when some of it is see-through. */
function rasterItem(img: RawImage, ctm: Mat, x0: number, y0: number, opacity: number, blend: number): AiItem {
  const n = img.width * img.height;
  let alpha = false;
  for (let i = 0; i < n; i++) if (img.pixels[i * 4 + 3] < 255) {
    alpha = true;
    break;
  }
  // The picture's top left corner (the unit square's (0,1)) in page points; Illustrator counts its rows down from there.
  const [tx, ty] = apply(ctm, 0, 1);
  const m = `[ ${r4(ctm[0] / img.width)} ${r4(ctm[1] / img.width)} ${r4(ctm[2] / img.height)} ${r4(ctm[3] / img.height)} ${r4(tx + x0)} ${r4(ty - y0)} ]`;
  const body = new Uint8Array(n * (alpha ? 4 : 3));
  for (let i = 0; i < n; i++) {
    body[i * 3] = img.pixels[i * 4];
    body[i * 3 + 1] = img.pixels[i * 4 + 1];
    body[i * 3 + 2] = img.pixels[i * 4 + 2];
    if (alpha) body[n * 3 + i] = img.pixels[i * 4 + 3];
  }
  const head = ['0 O', '0 R', `${blend} ${r4(opacity)} 0 0 0 Xy`, '%AI5_File:', '%AI5_BeginRaster', '() 1 XG', '/DeviceRGB XN', `${m} ${img.width} ${img.height} 0 Xh`, `${m} 0 0 ${img.width} ${img.height} ${img.width} ${img.height} 8 3 ${alpha ? '1 17' : '0 1'} 1 0 4 4 0 0`, `%%BeginData: ${n * 3 + 4}`, 'XI'];
  const tail = ['%%EndData', 'XH', '%AI5_EndRaster', 'N', '0 1 0 0 0 Xy'];
  return { kind: 'raster', head: head.join('\n') + '\n', body, tail: tail.join('\n') };
}

// ---------------------------------------------------------------- the document

const LAYER_COLORS: Rgb[] = [
  [79, 128, 255],
  [255, 79, 79],
  [79, 255, 79],
  [79, 79, 255],
  [255, 79, 255],
  [79, 255, 255],
  [255, 255, 79],
  [255, 152, 79],
];

/** Joins the layers of several pages that have the same names in the same places (each page's art stays where it is). */
function mergeLayers(into: AiLayer[], from: AiLayer[]): void {
  from.forEach((l, i) => {
    const t = into[i] && into[i].name === l.name ? into[i] : null;
    if (!t) {
      into.splice(i, 0, l);
      return;
    }
    t.items.push(...l.items);
    mergeLayers(t.children, l.children);
  });
}

class Out {
  private parts: (string | Uint8Array)[] = [];
  private enc = new TextEncoder();
  ln(s: string) {
    this.parts.push(s + '\r\n');
  }
  raw(b: Uint8Array) {
    this.parts.push(b);
  }
  text(s: string) {
    this.parts.push(s);
  }
  bytes(): Uint8Array {
    const chunks = this.parts.map((p) => (typeof p === 'string' ? this.enc.encode(p) : p));
    const n = chunks.reduce((t, c) => t + c.length, 0);
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

function writeItems(o: Out, items: AiItem[]): void {
  for (const it of items) {
    if (typeof it === 'string') o.ln(it);
    else if (it.kind === 'raster') {
      o.text(it.head.replace(/\n/g, '\r\n'));
      o.raw(it.body);
      o.ln(it.tail.replace(/\n/g, '\r\n'));
    } else {
      o.ln('u');
      writeItems(o, it.items);
      o.ln('U');
      o.ln(`${it.blend} ${r4(it.opacity)} 0 2 0 Xy`);
      o.ln('0 0 Xd');
      o.ln('6 () XW');
    }
  }
}

function writeLayer(o: Out, l: AiLayer, index: { n: number }): void {
  const [r, g, b] = LAYER_COLORS[index.n % LAYER_COLORS.length];
  o.ln('%AI5_BeginLayer');
  o.ln(`${l.hidden ? 0 : 1} 1 1 1 0 0 ${l.hidden ? 0 : 1} ${index.n++} ${r} ${g} ${b} 0 50 0 Lb`);
  o.ln(`${aiString(l.name)} Ln`);
  o.ln(`${l.children.length ? 1 : 0} AE`);
  o.ln('0 A');
  o.ln('0 Xw');
  writeItems(o, l.items);
  for (const c of l.children) writeLayer(o, c, index);
  if (l.opacity < 0.999 || l.blend !== 0) {
    o.ln(`${l.blend} ${r4(l.opacity)} 0 2 0 Xy`);
    o.ln('0 0 Xd');
    o.ln('7 () XW');
  }
  o.ln('LB');
  o.ln('%AI5_EndLayer--');
}

function countLayers(l: AiLayer[]): number {
  return l.length;
}

export interface AiNative {
  /** The comment header (AIMetaData). */
  header: Uint8Array;
  /** The whole document, cut into 64 KB blocks after a small preview block (AIPrivateData1..n). */
  blocks: Uint8Array[];
}

/**
 * Illustrator's data for the pages of a PDF the writer has made. Page k sits at artboard k, side by side with a gap.
 * `contents` are the page content streams, in order.
 */
export function nativeData(writer: PdfWriter, pages: AiPageInput[], title: string): AiNative {
  const gap = 24;
  // The text space's origin: where the file's (0, 0) sits in the text space (the ruler origin below, with the half point Illustrator keeps it off by).
  const res: Resources = { gradients: new Map(), texts: [], origin: [8191 - pages[0].width / 2 + 0.5, 8191 + pages[0].height / 2 + 0.5] };
  let layers: AiLayer[] = [];
  const boards: { x: number; w: number; h: number }[] = [];
  let x = 0;
  pages.forEach((p, i) => {
    boards.push({ x, w: p.width, h: p.height });
    const l = translate({ w: writer, res, x0: x, y0: 0 }, p.content, 'Layer 1');
    if (i === 0) layers = l;
    else mergeLayers(layers, l);
    x += p.width + gap;
  });
  // Illustrator wants at least one layer.
  if (!layers.length) layers = [{ name: 'Layer 1', items: [], children: [], opacity: 1, blend: 0 }];
  const W = Math.max(1, boards[boards.length - 1].x + boards[boards.length - 1].w);
  const H = Math.max(1, ...boards.map((b) => b.h));
  const o = new Out();
  const headLines = [
    '%!PS-Adobe-3.0 ',
    // The file format version we write. Illustrator only reads the extended lines (the "%_" ones, which hold gradient stops and
    // artboards) when the header says Illustrator 17 or newer, the way other programs that write .ai files do.
    '%%Creator: Adobe Illustrator(R) 17.0',
    '%%AI8_CreatorVersion: 30.1.0',
    `%%For: (Frameling) ()`,
    `%%Title: ${aiString(title)}`,
    '%%CreationDate: 1/1/2026 12:00 PM',
    '%%Canvassize: 16383',
    `%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}`,
    `%%HiResBoundingBox: 0 0 ${r4(W)} ${r4(H)}`,
    '%%DocumentProcessColors: Cyan Magenta Yellow Black',
    '%AI5_FileFormat 13.0',
    '%AI12_BuildNumber: 136',
    '%AI3_ColorUsage: Color',
    '%AI7_ImageSettings: 0',
    '%%RGBProcessColor: 0 0 0 ([Registration])',
    `%AI3_Cropmarks: 0 0 ${r4(boards[0].w)} ${r4(boards[0].h)}`,
    `%AI3_TemplateBox: ${r4(boards[0].w / 2)} ${r4(boards[0].h / 2)} ${r4(boards[0].w / 2)} ${r4(boards[0].h / 2)}`,
    `%AI3_TileBox: 0 0 ${r4(boards[0].w)} ${r4(boards[0].h)}`,
    '%AI3_DocumentPreview: None',
    '%AI5_ArtSize: 14400 14400',
    '%AI5_RulerUnits: 2',
    '%AI9_ColorModel: 1',
    '%AI5_ArtFlags: 0 0 0 1 0 0 1 0 0',
    '%AI5_TargetResolution: 800',
    `%AI5_NumLayers: ${countLayers(layers)}`,
    '%AI9_OpenToView: 0 0 1 1196 905 18 0 0 46 89 0 0 0 1 1 0 1 1 0 1',
    // One digit per top layer, top layer first: 7 shown, 6 hidden (bits: shown 1, preview 2, editable 4).
    `%AI5_OpenViewLayers: ${layers.map((l) => (l.hidden ? '6' : '7')).reverse().join('')}`,
    '%%PageOrigin:0 0',
    '%AI9_Flatten: 1',
    '%AI12_CMSettings: 00.MS',
    '%%EndComments',
  ];
  for (const l of headLines) o.ln(l);
  const header = new TextEncoder().encode(headLines.join('\r\n') + '\r\n');
  o.ln('%%BeginProlog');
  o.ln('%%EndProlog');
  o.ln('%%BeginSetup');
  // The layers are written first so the gradients they use are known.
  const body = new Out();
  const idx = { n: 0 };
  for (const l of layers) writeLayer(body, l, idx);
  if (res.gradients.size) {
    o.ln('%AI5_Begin_NonPrinting');
    o.ln('Np');
    o.ln(`${res.gradients.size} Bn`);
    for (const e of res.gradients.values()) for (const l of gradientDef(e.name, e.gradient)) o.ln(l);
    o.ln('%AI5_End_NonPrinting--');
  }
  o.ln('%AI9_BeginDocumentData');
  for (const l of documentData(boards)) o.ln('%_' + l);
  o.ln('%AI9_EndDocumentData');
  for (const l of textSetupLines(res.texts, res.origin)) o.ln(l);
  o.ln('%%EndSetup');
  o.raw(body.bytes());
  o.ln('%%PageTrailer');
  o.ln('gsave annotatepage grestore showpage');
  o.ln('%%Trailer');
  o.ln('%%EOF');
  const all = o.bytes();
  const preview = new TextEncoder().encode(`%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}\r\n%%HiResBoundingBox: 0 0 ${r4(W)} ${r4(H)}\r\n%%EndData\r\n`);
  const blocks: Uint8Array[] = [preview];
  for (let i = 0; i < all.length; i += 65536) blocks.push(all.subarray(i, Math.min(all.length, i + 65536)));
  return { header, blocks };
}

/** The document data block: the artboards and the few settings that go with them. */
function documentData(boards: { x: number; w: number; h: number }[]): string[] {
  const out: string[] = ['/Document :', '/Dictionary :', '/Dictionary :', '/Dictionary :', '; (GenAIVariationsDictionary) ,', '/Array :', '; (MigratedArtList) ,', '; (GenAIRecorded) ,', '0 /Int (AI11 Document Setup Language Popup) ,', '/Array :'];
  boards.forEach((b, i) => {
    out.push(
      '/Dictionary :',
      `${r4(b.x)} ${r4(b.h)} /RealPointRelToROrigin`,
      ' (PositionPoint1) ,',
      `${r4(b.x + b.w)} 0 /RealPointRelToROrigin`,
      ' (PositionPoint2) ,',
      '1 /Real (PAR) ,',
      `${aiString(boards.length > 1 ? `Frame ${i + 1}` : 'Artboard 1')} /UnicodeString (Name) ,`,
      `${boards.length > 1 ? 0 : 1} /Bool (IsArtboardDefaultName) ,`,
      '0 /Bool (IsArtboardSelected) ,',
      '0 /Int (DisplayMark) ,',
      `${r4(8191 - b.w / 2 + b.x)} ${r4(8191 + b.h / 2)} /RealPoint`,
      ' (RulerOrigin) ,',
      '/FillStyle : 0 1 0 0 0 Xy',
      '0 J 0 j 1 w 10 M []0 d',
      '0 XR',
      '0 0 Xd',
      '/Def ; ',
      ' (EachArtboardColor) ,',
      '0 /Bool (IsArtboardLocked) ,',
      `(${uuid(i)}) /String (ArtboardUUID) ,`,
      '; ,',
    );
  });
  out.push(
    '; (ArtboardArray) ,',
    '1 /Bool (AI11 Preserve Text Editability) ,',
    '16383 /Int (AIDocumentCanvasSize) ,',
    '; /Recorded ,',
    '/Dictionary : /NotRecorded ,',
    `${boards.length - 1} /Int (LastArtboardID) ,`,
    '; /NotRecorded ,',
    ';',
  );
  return out;
}

function uuid(i: number): string {
  const h = (n: number) => n.toString(16).padStart(8, '0');
  const a = h(0x46726d00 + i);
  return `${a}-1c3a-4f6e-9a55-${h(0x6c696e67 + i)}${h(0x1234).slice(4)}`;
}
