// Copying the address or the key without ever drawing the key on the screen.
import { desktop } from '../io/desktop';
import { toast } from '../ui/toast';
import { remoteStatus } from './state';

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
export async function fetchRemoteKey(): Promise<string> {
  try {
    return (await desktop()?.remote?.key()) ?? '';
  } catch {
    return '';
  }
}

export async function copyRemoteKey(): Promise<boolean> {
  const k = await fetchRemoteKey();
  if (!k || !(await toClipboard(k))) {
    toast('Could not copy the key.', { kind: 'warn' });
    return false;
  }
  toast('Copied the key. It is not shown on screen. Give it to the program that should drive Frameling.', { kind: 'success' });
  return true;
}

export async function copyRemoteAddress(): Promise<boolean> {
  const a = remoteStatus.get().address;
  if (!a || !(await toClipboard(a))) {
    toast('The remote door is off, so there is no address yet.', { kind: 'warn' });
    return false;
  }
  toast(`Copied ${a}.`, { kind: 'success' });
  return true;
}
