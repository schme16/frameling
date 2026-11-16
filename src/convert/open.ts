// Opens a dialog when asked; the dialog's code loads the first time.
import type { Way } from './ops';

export function openConvert(way: Way): void {
  void import('./ConvertDialog').then((m) => m.openConvertDialog(way));
}
