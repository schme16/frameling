// The page's one link to the actions door, wired to the app's gate and the desktop side.
import { audience } from '../audience';
import { withChoice } from '../core/choices';
import { desktop } from '../io/desktop';
import { toast } from '../ui/toast';
import { createDoorLink } from './link';
import { doorStatus, preferredPort } from './state';

export const doorLink = createDoorLink({
  bridge: () => desktop()?.door ?? null,
  port: preferredPort,
  gate: { snapshot: () => audience.snapshot(), submit: (id, raw) => audience.submit(id, raw) },
  setStatus: (s) => doorStatus.set(s),
  portBusy: (then) => withChoice<string>('streamdoor.portBusy', then),
  tell: (m) => void toast(m, { kind: 'warn' }),
});
