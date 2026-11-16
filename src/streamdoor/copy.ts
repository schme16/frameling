// Copying the address or the key without ever drawing the key on the screen.
import { desktop } from '../io/desktop';
import { toast } from '../ui/toast';
import { doorStatus } from './state';
import { testCommand } from './testCommand';
import { noteStreamMark } from '../features/streamMarks';

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
  noteStreamMark('doorAddress');
  toast(`Copied ${a}. Paste it into your stream tool.`, { kind: 'success' });
  return true;
}

/**
 * A ready curl line with the live address and the current key in it, to paste into a terminal. It asks the door for its
 * list, so it proves the address and the key and changes nothing. Copy only: the key is never drawn on the screen.
 */
export async function copyTestCommand(): Promise<boolean> {
  const a = doorStatus.get().address;
  if (!a) {
    toast('The actions door is not open, so there is nothing to test yet. Switch audience features on first.', { kind: 'warn' });
    return false;
  }
  const line = testCommand(a, await fetchKey());
  if (!line || !(await toClipboard(line))) {
    toast('Could not copy a test command.', { kind: 'warn' });
    return false;
  }
  toast('Copied a test command. Paste it into a terminal. If the door is working you get a list of actions back. It has your key in it, so keep it off the stream.', { kind: 'success' });
  return true;
}
