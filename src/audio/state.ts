/** Which sound is picked in the timeline (what "Lip sync" and the sound commands act on). Not in the document, never undone. */
import type { Id } from '../core/format';
import { createStore } from '../ui/mini';
import { onFreshDrawing } from '../core/fresh';

export const soundUi = createStore<{ picked: Id | null }>({ picked: null });

export const pickSound = (id: Id | null): void => soundUi.set({ picked: id });

onFreshDrawing(() => pickSound(null));
