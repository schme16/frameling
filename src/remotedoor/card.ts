// Whether the remote door's card (the log, and the switch, hanging from the pill) is open.
import { createStore } from '../ui/mini';

export const remoteCardOpen = createStore(false);
export const showRemoteCard = (): void => remoteCardOpen.set(true);
export const hideRemoteCard = (): void => remoteCardOpen.set(false);
