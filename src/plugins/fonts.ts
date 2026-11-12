// Fonts for a plugin's text: only the ones Frameling ships and the ones found on this computer (the text tools' list),
// so a plugin cannot load a font from anywhere, and a name that is not installed quietly becomes plain sans-serif.
import { systemFonts } from '../text/fonts';
import { fontFamilyCss, SHIPPED_FONTS } from '../text/model';

/** The font's proper name if it is available here, otherwise null. */
export function knownFont(name: string | undefined): string | null {
  if (!name) return null;
  const want = name.trim().toLowerCase();
  const shipped = SHIPPED_FONTS.find((f) => f.name.toLowerCase() === want);
  if (shipped) return shipped.name;
  return systemFonts().find((f) => f.toLowerCase() === want) ?? null;
}

/** The CSS family list for a canvas: the font asked for when it is here, else plain sans-serif. */
export function cssFontFor(name: string | undefined): string {
  const known = knownFont(name);
  return known ? fontFamilyCss(known) : 'sans-serif';
}
