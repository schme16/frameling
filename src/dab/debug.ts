// With ?debug in the page address, expose the pixel brush's settings, for help pictures and A/B shots. The picture helpers
// take the bytes of a picture file as a plain list of numbers, since a harness cannot drive the file picker.
import { readImageBytes } from '../brushes/imageIn';
import { openTipEditor } from '../brushes/TipEditor';
import { tipFromImage } from '../brushes/tipEdit';
import type { PixelStamp } from '../brushes/stamps';
import { applyEditedTip } from './pictureTip';
import { getDab, resetDab, setDab, setWholeDab } from './settings';
import { DEFAULT_DUAL, DEFAULT_GRAIN } from './texture';
import { textureFromBytes } from './texturePick';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingDab: unknown }).__framelingDab = {
    settings: getDab,
    set: setDab,
    whole: setWholeDab,
    reset: resetDab,
    /** Opens the picture tip editor, on a tip or on a blank grid. */
    editor: (from?: PixelStamp | null): void => void openTipEditor(applyEditedTip, from),
    /** Opens the editor on a picture file's bytes, the way the file button does. */
    editorFromBytes: async (bytes: number[]) => tipFromImage(await readImageBytes(Uint8Array.from(bytes)), (grid, colour) => openTipEditor(applyEditedTip, null, { grid, colour })),
    grainFromBytes: async (bytes: number[]) => {
      const picture = await textureFromBytes(Uint8Array.from(bytes));
      if (picture) setDab({ grain: { ...(getDab().grain ?? DEFAULT_GRAIN), picture } });
      return !!picture;
    },
    dualFromBytes: async (bytes: number[]) => {
      const picture = await textureFromBytes(Uint8Array.from(bytes));
      if (picture) setDab({ dual: { ...(getDab().dual ?? DEFAULT_DUAL), picture, scale: 1 } });
      return !!picture;
    },
  };
}
