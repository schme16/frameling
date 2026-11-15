// Getting the overlay's address to the clipboard, or to the screen for a moment, at the moment it is needed.
import { desktop } from '../io/desktop';
import { toast } from '../ui/toast';

async function toClipboard(text: string): Promise<boolean> {
  try {
    const d = desktop();
    if (d?.clipboard) return await d.clipboard.writeText(text);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The full address with its token, or '' when the actions door is closed. Not kept. */
export async function fetchOverlayUrl(): Promise<string> {
  try {
    return (await desktop()?.overlay?.url()) ?? '';
  } catch {
    return '';
  }
}

export async function copyOverlayUrl(): Promise<boolean> {
  const u = await fetchOverlayUrl();
  if (!u) {
    toast('The overlay is not open yet. Switch audience features on first (Preferences > Streaming).', { kind: 'warn' });
    return false;
  }
  if (!(await toClipboard(u))) {
    toast('Could not copy the overlay address.', { kind: 'warn' });
    return false;
  }
  toast('Copied the overlay address. It stays hidden on screen. In OBS: Sources, plus, Browser, paste it in the URL box.', { kind: 'success' });
  return true;
}
