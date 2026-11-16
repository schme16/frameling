// Making a picture tip from a picture file: pick it, read it with the size checks (imageIn.ts), shrink it to at most 32 by 32,
// and hand the little grid on to the editor. A picture with see-through parts is taken as it is (its shape and colours); one
// that is solid all over has no shape, so it is asked once whether the dark parts or the light parts are the brush.
import { registerChoice, withChoice } from '../core/choices';
import { choiceWord } from '../words/choices';
import { pickFiles } from '../import/pick';
import { PICTURE_ACCEPT } from '../pixel/import/picture';
import { toast } from '../ui/toast';
import { ImageProblem, readImageFile, type ImagePixels } from './imageIn';
import { colourCount, gridFromPicture, isEmpty, type TipGrid } from './tipGrid';
import type { PixelStampColours } from './tips';

export type ImageTipReading = 'dark' | 'light' | 'colours';

registerChoice<ImageTipReading>({
  id: 'brush.imageTipReading',
  title: choiceWord('choice.brush.imageTipReading.title'),
  question: choiceWord('choice.brush.imageTipReading.question'),
  options: [
    { value: 'dark', label: choiceWord('choice.brush.imageTipReading.dark.label'), detail: choiceWord('choice.brush.imageTipReading.dark.detail'), did: choiceWord('choice.brush.imageTipReading.dark.did') },
    { value: 'light', label: choiceWord('choice.brush.imageTipReading.light.label'), detail: choiceWord('choice.brush.imageTipReading.light.detail'), did: choiceWord('choice.brush.imageTipReading.light.did') },
    { value: 'colours', label: choiceWord('choice.brush.imageTipReading.colours.label'), detail: choiceWord('choice.brush.imageTipReading.colours.detail'), did: choiceWord('choice.brush.imageTipReading.colours.did') },
  ],
  default: 'dark',
  category: 'Drawing',
  help: 'pixel-brush-picture',
});

/** Where a picture turned into a grid lands: the grid, and whether it should paint in its own colours. */
export type GridDone = (grid: TipGrid, colour: boolean) => void;

/** A picture as a tip grid. Asks (once) what to make of a solid picture, and (once) about colours when there are several. False when nothing was left to paint with. */
export function tipFromImage(img: ImagePixels, done: GridDone): boolean {
  const finish = (how: ImageTipReading) => {
    const grid = gridFromPicture(img.width, img.height, img.rgba, how, img.clear);
    if (isEmpty(grid)) {
      toast('There is nothing in that picture to paint with: it is all clear, or all one flat shade.', { kind: 'warn' });
      return;
    }
    if (how === 'colours' || img.clear) {
      const several = colourCount(grid) > 1;
      withChoice<PixelStampColours>('brush.pixelStampColours', (v) => done(grid, v === 'own' && several), { matters: several });
    } else done(grid, false);
  };
  if (img.clear) finish('colours');
  else withChoice<ImageTipReading>('brush.imageTipReading', finish);
  return true;
}

/** Asks for a picture file and makes a tip grid of it. Says in plain words what went wrong. */
export async function pickPictureTip(done: GridDone): Promise<boolean> {
  const [f] = await pickFiles(PICTURE_ACCEPT);
  if (!f) return false;
  try {
    return tipFromImage(await readImageFile(f.file), done);
  } catch (e) {
    toast(e instanceof ImageProblem ? e.message : 'That picture could not be used.', { kind: 'warn', duration: 8000 });
    return false;
  }
}
