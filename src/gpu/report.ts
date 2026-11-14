// The report the Performance page shows: asked of the desktop side, kept here so the page and the command share it.
import type { GpuReport } from '../preload/api';
import { desktop } from '../io/desktop';
import { createStore } from '../ui/mini';

export const reportStore = createStore<GpuReport | null>(null);

let pretend: GpuReport | null = null;
/** For shots and checks: show this report instead of asking the computer (null goes back to the real one). */
export function pretendReport(r: GpuReport | null): void {
  pretend = r;
  void refreshReport();
}

/** Is this the desktop app, which can say what it found? The web build leaves drawing to the browser. */
export const canReadGpu = (): boolean => !!desktop()?.gpu || pretend !== null;

export async function refreshReport(): Promise<GpuReport | null> {
  const api = desktop()?.gpu;
  let r: GpuReport | null = pretend;
  if (!r && api) {
    try {
      r = await api.report();
    } catch {
      r = null;
    }
  }
  reportStore.set(r);
  return r;
}
