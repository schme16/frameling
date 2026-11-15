// The dialog and the badge load when first used, so the app starts without them.
import { lazyModule } from '../core/lazy';

const load = lazyModule(() => import('./TimelapseDialog'));

export function openTimelapseExport(): void {
  void load().then((m) => m.openTimelapseDialog());
}
