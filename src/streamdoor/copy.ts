// Copying the address or the key without ever drawing the key on the screen.
import { desktop } from '../io/desktop';
import { toast } from '../ui/toast';
import { doorStatus } from './state';

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

/** The key, fetched at the moment it is needed and not kept. Empty when there is no desktop side. */
export async function fetchKey(): Promise<string> {
  try {
    return (await desktop()?.door?.key()) ?? '';
  } catch {
    return '';
  }
}

export async function copyKey(): Promise<boolean> {
  const k = await fetchKey();
  if (!k || !(await toClipboard(k))) {
    toast('Could not copy the key.', { kind: 'warn' });
    return false;
  }
  toast('Copied the key. It is not shown on screen. Paste it into your stream tool.', { kind: 'success' });
  return true;
}

export async function copyAddress(): Promise<boolean> {
  const a = doorStatus.get().address;
  if (!a || !(await toClipboard(a))) {
    toast('The actions door is not open, so there is no address yet.', { kind: 'warn' });
    return false;
  }
  toast(`Copied ${a}. Paste it into your stream tool.`, { kind: 'success' });
  return true;
}
