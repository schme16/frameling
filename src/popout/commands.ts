// The commands for the picture window.
import { registerCommands } from '../core/registry';
import { withChoice } from '../core/choices';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { isPopoutOpen, subscribePopout } from './link';
import { pageOf } from './show';
import { cameraLayerOf } from '../core/camera';

const HELP = 'canvas-popout';
const bridge = () => window.frameling?.popout;

// A menu tick is read from the command, so tell the menus when the window comes or goes.
subscribePopout(() => store().setUi({}));

const ask = <V extends string>(id: string, matters: boolean) => new Promise<V>((res) => withChoice<V>(id, res, { matters }));

/** Opens the second window (asking the two questions the first time, if they matter), or brings it forward. */
export async function openPopout(): Promise<void> {
  const api = bridge();
  if (!api) {
    toast('The second window needs the Frameling desktop app.', { kind: 'info' });
    return;
  }
  const { doc } = store().get();
  await ask('popout.camera', !!cameraLayerOf(pageOf(doc))?.visible);
  await ask('popout.marks', !!doc.marks?.length);
  await api.open();
}

export async function closePopout(): Promise<void> {
  await bridge()?.close();
}

registerCommands([
  {
    id: 'popout.toggle',
    label: 'Second window',
    category: 'View',
    keys: ['Mod+Alt+P'],
    description: 'Shows your drawing big in a window of its own, to put on a second screen. It follows what you draw and plays along when you play. You cannot draw in it, so nothing there can change your drawing.',
    help: HELP,
    keywords: ['second window', 'second screen', 'second monitor', 'extra screen', 'preview', 'pop out', 'popout', 'picture window', 'tablet', 'mirror', 'external display', 'big picture', 'presentation'],
    checked: () => isPopoutOpen(),
    enabled: () => !!bridge(),
    run: () => void (isPopoutOpen() ? closePopout() : openPopout()),
  },
  {
    id: 'popout.front',
    label: 'Bring the second window forward',
    category: 'View',
    description: 'Puts the second window on top, if it has got lost behind other windows.',
    help: HELP,
    keywords: ['second window', 'find', 'lost', 'forward', 'focus', 'popout'],
    enabled: () => isPopoutOpen(),
    run: () => void openPopout(),
  },
]);
