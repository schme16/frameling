// The person's switch, in one place for the command, the Preferences row and the pill.
import { desktop } from '../io/desktop';
import { ask } from '../platform/ask';
import { toast } from '../ui/toast';
import { remoteLink } from './instance';
import { remoteStatus } from './state';

export const hasRemote = (): boolean => !!desktop()?.remote;
export const remoteOn = (): boolean => remoteStatus.get().running;

/** Switches the door on or off. Resolves to whether it is on afterwards. */
export async function setRemoteOn(on: boolean): Promise<boolean> {
  if (!hasRemote()) {
    toast('The remote door needs the desktop app.', { kind: 'warn' });
    return false;
  }
  if (!on) {
    await remoteLink.close();
    return false;
  }
  const open = await remoteLink.open();
  if (open) toast('The remote door is open, on this computer only. A program with your key can drive Frameling. Switch it off from the pill at the top, or here.', { kind: 'info', duration: 6000 });
  return open;
}

/** Makes a new key, after saying what it breaks. Returns whether it did. */
export async function rollRemoteKey(): Promise<boolean> {
  const d = desktop()?.remote;
  if (!d) return false;
  const a = await ask({
    id: 'remote.roll',
    title: 'Make a new key?',
    message: 'The old key stops working at once. Every program that drives Frameling needs the new one.',
    buttons: [
      { value: 'roll', label: 'Make a new key', primary: true },
      { value: 'keep', label: 'Keep the old one' },
    ],
    cancel: 'keep',
  });
  if (a !== 'roll') return false;
  await d.roll();
  toast('Made a new key. Copy it from Preferences > Plugins, or with Copy the remote door key.', { kind: 'success' });
  return true;
}
