// The colour of an artboard's name on the pasteboard: the usual colour, moved lighter or darker (same hue) only when it
// can't be read there. The gold of the open board is pale on a light pasteboard.
import { ensureContrast } from '../ui/themes/color';

export const LABEL_CONTRAST = 4.5;

/** `color` as it must be to read on `bg`: untouched when it already does, else the nearest shade that does. */
export function readableOn(bg: string, color: string, min = LABEL_CONTRAST): string {
  return ensureContrast(color, bg, min);
}
