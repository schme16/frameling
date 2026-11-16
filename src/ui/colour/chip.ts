import type { CSSProperties } from 'react';
import { hasAlpha } from '../../canvas/colors';

/** The background for a swatch of `color`: plain when solid, over a chequerboard when see-through, so it reads as see-through. */
export function chipBackground(color: string): CSSProperties {
  return hasAlpha(color) ? { background: `linear-gradient(${color}, ${color}), var(--cp-checker)` } : { backgroundColor: color };
}
