import { Check } from '../export/options/controls';
import type { ExportUiProps } from '../export/registry';
import { openHelp } from '../ui/overlays';

/** What an Interactives export asks. */
export function InteractivesOptions({ s, set }: ExportUiProps) {
  return (
    <fieldset>
      <legend>For Interactives</legend>
      <p className="ex-note">
        One file to drop onto an Interactives page. Your clips and markers come with it, so a click can play "run" or wait for "hit".{' '}
        <button type="button" className="ex-link" onClick={() => openHelp('export-interactives')}>
          How to use it in Interactives
        </button>
      </p>
      <Check checked={s.includeSource !== false} onChange={(v) => set({ includeSource: v })}>
        Include the editable drawing, so it can come back to Frameling
      </Check>
    </fieldset>
  );
}
