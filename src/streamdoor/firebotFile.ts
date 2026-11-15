// Saving the Firebot setup file. The Save dialog is the normal one; the file holds the address and no key.
import { desktop } from '../io/desktop';
import { toast } from '../ui/toast';
import { FIREBOT_SETUP_FILE, firebotSetupText } from './firebotSetup';
import { doorStatus, preferredPort } from './state';

export type SaveResult = 'saved' | 'cancelled' | 'failed';

/** The address to put in the file: the one in use, or the one the door will try when it is closed. */
export function setupAddress(): string {
  const s = doorStatus.get();
  return s.running && s.address ? s.address : `http://127.0.0.1:${preferredPort()}`;
}

/** Shows the Save dialog and writes the file. In a plain browser tab it downloads it instead. */
export async function writeFirebotSetup(): Promise<SaveResult> {
  const bytes = new TextEncoder().encode(firebotSetupText(setupAddress()));
  const api = desktop();
  if (api) {
    try {
      const target = await api.files.pickExportFile({ suggestedName: FIREBOT_SETUP_FILE, filters: [{ name: 'Firebot setup', extensions: ['firebotsetup'] }], title: 'Save the Firebot setup file' });
      if (!target) return 'cancelled';
      const r = await api.files.write(target, bytes);
      return 'error' in r ? 'failed' : 'saved';
    } catch {
      return 'failed';
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = FIREBOT_SETUP_FILE;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** The button and the palette command: save the file, then say what comes next. */
export async function saveFirebotSetup(): Promise<SaveResult> {
  const r = await writeFirebotSetup();
  if (r === 'saved') toast('Saved. Your key is not in the file. In Firebot, open the File menu, then Firebot Setups, then Import Firebot Setup. Paste the key when it asks (Copy beside Key here).', { kind: 'success' });
  else if (r === 'failed') toast('Could not save the Firebot setup file.', { kind: 'warn' });
  return r;
}
