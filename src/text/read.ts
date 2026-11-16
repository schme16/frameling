// Reading a text shape back from a file, checked: missing or wrong values take sensible defaults.
import type { SubPath, TextAnimator, TextOnPath, TextShape } from '../core/format';
import { isEasing } from '../core/ease';
import { clamp, color, isObj, readOrigin, readTransform } from '../io/shapes-extra';
import { TEXT_ANIMS } from './model';

/** Most points a curve keeps from a file: a longer one is damaged or hostile, and the words are better on a straight line. */
const MAX_CURVE_POINTS = 5000;

function readPoint(p: any): { x: number; y: number } | null {
  return isObj(p) && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
}

/** The curve words follow, from a file: at least two points, every number finite, or nothing at all. */
export function readOnPath(o: any): TextOnPath | undefined {
  if (!isObj(o) || !isObj(o.curve) || !Array.isArray(o.curve.points) || o.curve.points.length < 2 || o.curve.points.length > MAX_CURVE_POINTS) return undefined;
  const points: SubPath['points'] = [];
  for (const raw of o.curve.points) {
    const pt = readPoint(raw);
    if (!pt) return undefined;
    const c1 = readPoint(raw.c1);
    const c2 = readPoint(raw.c2);
    points.push(c1 && c2 ? { ...pt, c1, c2 } : pt);
  }
  const out: TextOnPath = { curve: { points, closed: o.curve.closed === true } };
  if (typeof o.source === 'string' && o.source) out.source = o.source.slice(0, 200);
  if (o.side === 'inside') out.side = 'inside';
  if (o.flip === true) out.flip = true;
  const start = clamp(o.start, 0, 0, 1);
  if (start) out.start = start;
  const offset = clamp(o.offset, 0, -5000, 5000);
  if (offset) out.offset = offset;
  return out;
}

function readAnimator(a: any): TextAnimator | null {
  if (!isObj(a) || typeof a.id !== 'string' || !TEXT_ANIMS.some((x) => x.kind === a.kind)) return null;
  const out: TextAnimator = {
    id: a.id,
    kind: a.kind,
    by: a.by === 'word' || a.by === 'line' ? a.by : 'letter',
    start: Math.round(clamp(a.start, 0, -100000, 100000)),
    duration: Math.max(1, Math.round(clamp(a.duration, 10, 1, 100000))),
    stagger: clamp(a.stagger, 2, 0, 10000),
    amount: clamp(a.amount, 0, -100000, 100000),
  };
  if (a.direction === 'out') out.direction = 'out';
  if (a.order === 'backward' || a.order === 'middle' || a.order === 'random') out.order = a.order;
  if (typeof a.angle === 'number' && Number.isFinite(a.angle)) out.angle = a.angle;
  if (isEasing(a.ease)) out.ease = a.ease;
  if (typeof a.seed === 'number' && Number.isFinite(a.seed)) out.seed = a.seed;
  if (a.on === false) out.on = false;
  return out;
}

export function readTextShape(s: any): TextShape | null {
  if (!isObj(s) || typeof s.id !== 'string' || typeof s.text !== 'string') return null;
  const onPath = readOnPath(s.onPath);
  const animators = Array.isArray(s.animators) ? s.animators.map(readAnimator).filter((a: TextAnimator | null): a is TextAnimator => !!a) : [];
  return {
    id: s.id,
    ...readOrigin(s),
    ...(typeof s.group === 'string' ? { group: s.group } : {}),
    type: 'text',
    text: s.text.slice(0, 20000),
    font: typeof s.font === 'string' && s.font.trim() ? s.font.slice(0, 120) : 'Nunito',
    size: clamp(s.size, 48, 0.5, 5000),
    weight: Math.round(clamp(s.weight, 400, 100, 900)),
    ...(s.italic === true ? { italic: true } : {}),
    color: color(s.color, '#000000'),
    align: s.align === 'center' || s.align === 'right' ? s.align : 'left',
    lineHeight: clamp(s.lineHeight, 1.2, 0.3, 10),
    letterSpacing: clamp(s.letterSpacing, 0, -500, 5000),
    opacity: clamp(s.opacity, 1, 0, 1),
    transform: readTransform(s.transform),
    ...(animators.length ? { animators } : {}),
    ...(onPath ? { onPath } : {}),
  };
}
