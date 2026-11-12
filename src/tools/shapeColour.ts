/** The colours of a shape, and swapping them. Shared by "Recolour the whole animation" and a variation's colourway. */
import type { Color, Shape } from '../core/format';
import { recolourGradient } from '../core/gradient';

export function recolourShape(s: Shape, f: (c: Color) => Color): Shape {
  switch (s.type) {
    case 'stroke': {
      const color = f(s.color);
      return color === s.color ? s : { ...s, color };
    }
    case 'fill': {
      const color = f(s.color);
      const gradient = s.gradient && recolourGradient(s.gradient, f);
      if (color === s.color && gradient === s.gradient) return s;
      return { ...s, color, ...(gradient ? { gradient } : {}) };
    }
    case 'path': {
      const fill = s.fill && f(s.fill);
      const sc = s.stroke && f(s.stroke.color);
      const fg = s.fillGradient && recolourGradient(s.fillGradient, f);
      const sg = s.strokeGradient && recolourGradient(s.strokeGradient, f);
      if (fill === s.fill && sc === (s.stroke?.color ?? null) && fg === s.fillGradient && sg === s.strokeGradient) return s;
      const out = { ...s, fill, stroke: s.stroke && sc ? { ...s.stroke, color: sc } : s.stroke };
      if (fg) out.fillGradient = fg;
      if (sg) out.strokeGradient = sg;
      return out;
    }
    case 'text': {
      const color = f(s.color);
      return color === s.color ? s : { ...s, color };
    }
    case 'particles': {
      const colorStart = f(s.colorStart);
      const colorEnd = f(s.colorEnd);
      return colorStart === s.colorStart && colorEnd === s.colorEnd ? s : { ...s, colorStart, colorEnd };
    }
    case 'instance': {
      if (!s.tint) return s;
      const color = f(s.tint.color);
      return color === s.tint.color ? s : { ...s, tint: { ...s.tint, color } };
    }
  }
}

/** Every colour a shape is made of (fills, lines, text, particles, gradient stops, a symbol wash). */
export function shapeColours(s: Shape): Color[] {
  const out: Color[] = [];
  const add = (c: Color | null | undefined) => {
    if (c) out.push(c);
  };
  if (s.type === 'stroke' || s.type === 'text') add(s.color);
  else if (s.type === 'fill') {
    add(s.color);
    for (const g of s.gradient?.stops ?? []) add(g.color);
  } else if (s.type === 'path') {
    add(s.fill);
    add(s.stroke?.color);
    for (const g of [...(s.fillGradient?.stops ?? []), ...(s.strokeGradient?.stops ?? [])]) add(g.color);
  } else if (s.type === 'particles') {
    add(s.colorStart);
    add(s.colorEnd);
  } else if (s.type === 'instance') add(s.tint?.color);
  return out;
}
