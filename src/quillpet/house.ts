// The house has three tabs: the room he lives in, the things you have given him, and the presents he leaves you.
// This is only which one is showing, plus the one way to open the house on a given tab. The tabs stay for the
// session, so the house opens where you left it, and the room is what you land on the first time.
import { createStore } from '../ui/mini';
import { showPanel } from '../ui/dock';
import type { Present } from './model';

export type HouseTab = 'room' | 'things' | 'presents';

export interface HouseTabDef {
  id: HouseTab;
  label: string;
  /** The help topic that explains what is on the tab. */
  help: string;
}

export const HOUSE_TABS: readonly HouseTabDef[] = [
  { id: 'room', label: 'Room', help: 'quill-pet' },
  { id: 'things', label: 'His things', help: 'quill-things' },
  { id: 'presents', label: 'Presents', help: 'quill-presents' },
];

export const houseStore = createStore<{ tab: HouseTab }>({ tab: 'room' });

export const isHouseTab = (x: unknown): x is HouseTab => HOUSE_TABS.some((t) => t.id === x);

export function setHouseTab(tab: HouseTab): void {
  houseStore.set({ tab });
}

/** Opens the house, on the room unless you say which tab. Every command and button that used to open a panel uses this. */
export function openHouse(tab: HouseTab = 'room'): void {
  setHouseTab(tab);
  showPanel('quill-pet');
}

/** The tab a left or right arrow lands on, wrapping round the ends. */
export function stepTab(from: HouseTab, by: 1 | -1): HouseTab {
  const i = HOUSE_TABS.findIndex((t) => t.id === from);
  return HOUSE_TABS[(i + by + HOUSE_TABS.length) % HOUSE_TABS.length].id;
}

/** How many presents are waiting to be opened, for the dot on the Presents tab. */
export const unopenedCount = (presents: readonly Present[]): number => presents.filter((p) => !p.opened).length;
