// Which reader a layered file needs: Photoshop's, or OpenRaster's (a zip). By what is inside, not what the name says.
import { LayeredProblem, type LayeredFile } from './model';
import { isZip, readOra } from './ora';
import { isPsd, readPsd } from './psd';

export const LAYERED_EXT = /\.(psd|ora)$/i;
export const LAYERED_ACCEPT = '.psd,.ora';

export async function readLayered(bytes: Uint8Array, path = ''): Promise<LayeredFile> {
  if (!bytes.length) throw new LayeredProblem("That file is empty: there's nothing in it to read.");
  if (isPsd(bytes)) return readPsd(bytes);
  if (isZip(bytes)) return readOra(bytes);
  if (/\.kra$/i.test(path)) throw new LayeredProblem("That is a Krita file (.kra), which Frameling can't read yet. In Krita choose File > Export, save it as OpenRaster (.ora) or Photoshop (.psd), and bring that in: the layers come across.");
  throw new LayeredProblem("Frameling couldn't tell what that file is. It reads Photoshop (.psd) and OpenRaster (.ora) files, and this is neither.");
}
