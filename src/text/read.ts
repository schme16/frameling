// Reading a text shape back from a file, checked: missing or wrong values take sensible defaults.
import type { TextAnimator, TextShape } from '../core/format';
import { isEasing } from '../core/ease';
import { clamp, color, isObj, readOrigin, readTransform } from '../io/shapes-extra';
import { TEXT_ANIMS } from './model';

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
  };
}
