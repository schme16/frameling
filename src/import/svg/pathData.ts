// SVG path data ("M 10 10 C ... Z") as Frameling sub-paths: points with optional cubic curve controls. Every command is
// turned into lines and cubic curves (quadratics and arcs are exact as cubics). Pure.
import type { PathPoint, SubPath } from '../../core/format';

export interface ParsedPath {
  paths: SubPath[];
  /** Set when the data stopped making sense part way: what was read before that is kept. */
  problem?: string;
}

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

type Tok = { cmd: string } | { num: number };

/** Arc flags are a single 0 or 1 and may run into the next number ("a1 1 0 00.5.5"), so they are read from the text. */
function tokenize(d: string): { toks: Tok[]; problem?: string } {
    const toks: Tok[] = [];
  let i = 0;
  const n = d.length;
  const num = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  let arc = false;
  let arcArg = 0;
  const readNum = (): number | null => {
    num.lastIndex = i;
    const m = num.exec(d);
    if (!m) return null;
    i = num.lastIndex;
    return parseFloat(m[0]);
  };
  while (i < n) {
    const c = d[i];
    if (c === ' ' || c === ',' || c === '\n' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      if (!(c.toLowerCase() in ARGS)) return { toks, problem: `The path has a command "${c}" that is not part of SVG` };
      toks.push({ cmd: c });
      arc = c === 'a' || c === 'A';
      arcArg = 0;
      i++;
      continue;
    }
    if (arc && (arcArg % 7 === 3 || arcArg % 7 === 4)) {
      if (c !== '0' && c !== '1') return { toks, problem: 'An arc in the path has a flag that is not 0 or 1' };
      toks.push({ num: c === '1' ? 1 : 0 });
      i++;
      arcArg++;
      continue;
    }
    const v = readNum();
    if (v === null) return { toks, problem: 'The path data has something that is not a number' };
    toks.push({ num: v });
    if (arc) arcArg++;
  }
  return { toks };
}

type V = { x: number; y: number };

/** An elliptical arc as cubic curves: [c1, c2, end] for each piece. */
export function arcToCubics(x0: number, y0: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x: number, y: number): [V, V, V][] {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry || (x0 === x && y0 === y)) return [];
  const phi = (rotDeg * Math.PI) / 180;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1 = cp * dx + sp * dy;
  const y1 = -sp * dx + cp * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1) / ry;
  const cyp = (-k * ry * x1) / rx;
  const cx = cp * cxp - sp * cyp + (x0 + x) / 2;
  const cy = sp * cxp + cp * cyp + (y0 + y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const pieces = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / pieces;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const out: [V, V, V][] = [];
  const at = (t: number) => ({ x: Math.cos(t), y: Math.sin(t) });
  const map = (p: V): V => ({ x: cx + cp * rx * p.x - sp * ry * p.y, y: cy + sp * rx * p.x + cp * ry * p.y });
  const dmap = (p: V): V => ({ x: cp * rx * p.x - sp * ry * p.y, y: sp * rx * p.x + cp * ry * p.y });
  for (let i = 0; i < pieces; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const pa = at(a);
    const pb = at(b);
    const da = dmap({ x: -pa.y, y: pa.x });
    const db = dmap({ x: -pb.y, y: pb.x });
    const ma = map(pa);
    const mb = i === pieces - 1 ? { x, y } : map(pb);
    out.push([
      { x: ma.x + alpha * da.x, y: ma.y + alpha * da.y },
      { x: mb.x - alpha * db.x, y: mb.y - alpha * db.y },
      mb,
    ]);
  }
  return out;
}

/** Reads path data into sub-paths. Never throws. */
export function parsePathData(d: string): ParsedPath {
  const { toks, problem: tokProblem } = tokenize(d);
  const paths: SubPath[] = [];
  let problem = tokProblem;
  let pts: PathPoint[] = [];
  let closed = false;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCmd = '';
  let ctrl: V | null = null; // last control point, for S and T
  let started = false;

  const finish = () => {
    if (pts.length > 1) {
      if (closed) {
        const f = pts[0];
        const l = pts[pts.length - 1];
        if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) {
          if (l.c1 && l.c2) {
            f.c1 = l.c1;
            f.c2 = l.c2;
          }
          pts.pop();
        }
      }
      if (pts.length > 1) paths.push({ points: pts, closed });
    }
    pts = [];
    closed = false;
  };
  const begin = (x: number, y: number) => {
    finish();
    pts = [{ x, y }];
    sx = x;
    sy = y;
    started = true;
  };
  const lineTo = (x: number, y: number) => {
    if (!started) return;
    if (closed) {
      // A segment after Z starts a new sub-path where the last one began.
      const nx = sx;
      const ny = sy;
      begin(nx, ny);
    }
    pts.push({ x, y });
    cx = x;
    cy = y;
  };
  const curveTo = (c1: V, c2: V, x: number, y: number) => {
    if (!started) return;
    if (closed) begin(sx, sy);
    pts.push({ x, y, c1, c2 });
    cx = x;
    cy = y;
    ctrl = c2;
  };

  let i = 0;
  let cmd = '';
  while (i < toks.length) {
    const t = toks[i];
    if ('cmd' in t) {
      cmd = t.cmd;
      i++;
      if (cmd === 'z' || cmd === 'Z') {
        if (started && pts.length) closed = true;
        cx = sx;
        cy = sy;
        prevCmd = 'z';
        ctrl = null;
        // A new sub-path may follow without M; it begins at the start point.
        continue;
      }
    } else if (!cmd) {
      problem ??= 'The path data does not start with a command';
      break;
    } else if (cmd.toLowerCase() === 'z') {
      problem ??= 'The path has numbers after a close command';
      break;
    }
    const lc = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const need = ARGS[lc];
    if (!need) continue;
    const a: number[] = [];
    for (let k = 0; k < need; k++) {
      const tk = toks[i + k];
      if (!tk || 'cmd' in tk) {
        problem ??= `The path ends in the middle of a "${cmd}" command`;
        i = toks.length;
        break;
      }
      a.push(tk.num);
    }
    if (a.length < need) break;
    i += need;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (lc) {
      case 'm': {
        begin(a[0] + ox, a[1] + oy);
        cx = a[0] + ox;
        cy = a[1] + oy;
        // More pairs after M are lines.
        cmd = rel ? 'l' : 'L';
        ctrl = null;
        break;
      }
      case 'l':
        lineTo(a[0] + ox, a[1] + oy);
        ctrl = null;
        break;
      case 'h':
        lineTo(a[0] + ox, cy);
        ctrl = null;
        break;
      case 'v':
        lineTo(cx, a[0] + oy);
        ctrl = null;
        break;
      case 'c':
        curveTo({ x: a[0] + ox, y: a[1] + oy }, { x: a[2] + ox, y: a[3] + oy }, a[4] + ox, a[5] + oy);
        break;
      case 's': {
        const c1 = (prevCmd === 'c' || prevCmd === 's') && ctrl ? { x: 2 * cx - ctrl.x, y: 2 * cy - ctrl.y } : { x: cx, y: cy };
        curveTo(c1, { x: a[0] + ox, y: a[1] + oy }, a[2] + ox, a[3] + oy);
        break;
      }
      case 'q': {
        const q = { x: a[0] + ox, y: a[1] + oy };
        const x = a[2] + ox;
        const y = a[3] + oy;
        curveTo({ x: cx + (2 / 3) * (q.x - cx), y: cy + (2 / 3) * (q.y - cy) }, { x: x + (2 / 3) * (q.x - x), y: y + (2 / 3) * (q.y - y) }, x, y);
        ctrl = q;
        break;
      }
      case 't': {
        const q: V = (prevCmd === 'q' || prevCmd === 't') && ctrl ? { x: 2 * cx - ctrl.x, y: 2 * cy - ctrl.y } : { x: cx, y: cy };
        const x = a[0] + ox;
        const y = a[1] + oy;
        curveTo({ x: cx + (2 / 3) * (q.x - cx), y: cy + (2 / 3) * (q.y - cy) }, { x: x + (2 / 3) * (q.x - x), y: y + (2 / 3) * (q.y - y) }, x, y);
        ctrl = q;
        break;
      }
      case 'a': {
        const x = a[5] + ox;
        const y = a[6] + oy;
        const pieces = arcToCubics(cx, cy, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, x, y);
        if (!pieces.length) lineTo(x, y);
        else for (const [c1, c2, e] of pieces) curveTo(c1, c2, e.x, e.y);
        ctrl = null;
        break;
      }
    }
    prevCmd = lc;
  }
  finish();
  return problem ? { paths, problem } : { paths };
}
