// The plain Brush on a pixel layer draws with the shared pixel brush. These set it to what the Brush's own size, shape
// and picture settings used to be, so a test can say "size 3, round" in one line.
import { dabFromPencil, OLD_BRUSH_DEFAULT, type Footprint } from '../../src/dab/pencil';
import { setWholeDab } from '../../src/dab/settings';

export function setPencil(fp: Partial<Footprint> = {}): void {
  setWholeDab(dabFromPencil({ ...OLD_BRUSH_DEFAULT, ...fp }));
}
