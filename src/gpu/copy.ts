// Copying the drawing report for a bug report. Apart from the page so the command can use it without loading Preferences.
import { toast } from '../ui/toast';
import { reportText } from './describe';
import { refreshReport, reportStore } from './report';
import { keptBytes, perfStore } from './settings';

/** Copies the report. Returns false when the clipboard is not there. */
export async function copyGpuReport(): Promise<boolean> {
  const r = reportStore.get() ?? (await refreshReport());
  if (!r) {
    toast('There is no drawing report to copy in the web version.', { kind: 'warn' });
    return false;
  }
  const s = perfStore.get();
  const text = reportText(r, keptBytes(), { hardware: !(r.off.file || r.off.env), cacheMb: s.cacheMb, scrub: s.scrub, fpsCap: s.fpsCap }, window.frameling?.versions?.app);
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into your bug report.', { kind: 'success' });
    return true;
  } catch {
    toast('Could not reach the clipboard.', { kind: 'warn' });
    return false;
  }
}
