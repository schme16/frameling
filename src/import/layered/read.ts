// Which reader a layered file needs: Photoshop's, or OpenRaster's (a zip). By what is inside, not what the name says.
import { desktop } from '../../io/desktop';
import { canvasMeasure } from '../../text/draw';
import { fontLooksInstalled } from '../../text/fonts';
import { SHIPPED_FONTS } from '../../text/model';
import { LayeredProblem, type LayeredFile, type LayerNode } from './model';
import { isZip, readOra } from './ora';
import { isPsd, readPsd } from './psd';
import { settleText, type FontEnv } from './psdfonts';

export const LAYERED_EXT = /\.(psd|ora)$/i;
export const LAYERED_ACCEPT = '.psd,.ora';

/** The families the text layers of a file use that Frameling doesn't ship. */
function textFamilies(nodes: LayerNode[], out = new Map<string, { family: string; weight: number; italic: boolean }>()) {
  for (const n of nodes) {
    if (n.type === 'group') textFamilies(n.children, out);
    else if (n.type === 'text' && !out.has(n.font.toLowerCase())) out.set(n.font.toLowerCase(), { family: n.font, weight: n.weight, italic: n.italic });
  }
  return out;
}

/** Which of a file's fonts are here: the desktop app reads the font files, and the page can try drawing in a font. */
export async function fontsHere(nodes: LayerNode[]): Promise<FontEnv> {
  const shipped = new Set(SHIPPED_FONTS.map((f) => f.name.toLowerCase()));
  const wants = [...textFamilies(nodes).values()].filter((w) => !shipped.has(w.family.toLowerCase()));
  const found = new Set<string>();
  const api = desktop()?.fonts;
  if (api && wants.length) {
    try {
      const names = await api.psNames(wants);
      wants.forEach((w, i) => typeof names[i] === 'string' && found.add(w.family.toLowerCase()));
    } catch {
      // no answer from the desktop side: the page's own check below still runs
    }
  }
  return { has: (family) => found.has(family.toLowerCase()) || fontLooksInstalled(family), measure: canvasMeasure };
}

export async function readLayered(bytes: Uint8Array, path = ''): Promise<LayeredFile> {
  if (!bytes.length) throw new LayeredProblem("That file is empty: there's nothing in it to read.");
  if (isPsd(bytes)) {
    const file = readPsd(bytes);
    if (textFamilies(file.nodes).size) settleText(file, await fontsHere(file.nodes));
    return file;
  }
  if (isZip(bytes)) return readOra(bytes);
  if (/\.kra$/i.test(path)) throw new LayeredProblem("That is a Krita file (.kra), which Frameling can't read yet. In Krita choose File > Export, save it as OpenRaster (.ora) or Photoshop (.psd), and bring that in: the layers come across.");
  throw new LayeredProblem("Frameling couldn't tell what that file is. It reads Photoshop (.psd) and OpenRaster (.ora) files, and this is neither.");
}
