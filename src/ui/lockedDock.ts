// The dock's changing calls, as the screen makes them: the same names as in dock.ts, but a locked panel layout says no
// (and why) instead of changing. The views import these; code that tidies the layout by itself (a timeline that grows
// to fit its sounds, a workspace that opens) keeps using dock.ts, because a lock is about what a person might knock.
import { closeFloatWindow as closeWindow, evenGroupSplit as evenSplit, hidePanel as hide, nudgeGroupSplit as nudgeSplit, renameFloat as renameWindow, renamePanel as renameTab, resetFloatSize as resetSize, resizeFloatBy as resizeBy, resizeZone as resize, setGroupSplit as setSplit } from './dock';
import { refuseIfLocked } from './lockState';

type DoingFor = Parameters<typeof refuseIfLocked>[1];
const open = (doing: DoingFor): boolean => !refuseIfLocked('panels', doing);

export const hidePanel = (id: string): void => void (open('arrange') && hide(id));
export const closeFloatWindow = (id: string): void => void (open('arrange') && closeWindow(id));
export const renamePanel = (id: string, name: string): void => void (open('arrange') && renameTab(id, name));
export const renameFloat = (id: string, name: string): void => void (open('arrange') && renameWindow(id, name));
export const resizeZone = (...a: Parameters<typeof resize>): void => void (open('size') && resize(...a));
export const setGroupSplit = (...a: Parameters<typeof setSplit>): void => void (open('size') && setSplit(...a));
export const nudgeGroupSplit = (...a: Parameters<typeof nudgeSplit>): void => void (open('size') && nudgeSplit(...a));
export const evenGroupSplit = (...a: Parameters<typeof evenSplit>): void => void (open('size') && evenSplit(...a));
export const resizeFloatBy = (id: string, dw: number, dh: number): { w: number; h: number } | null => (open('size') ? resizeBy(id, dw, dh) : null);
export const resetFloatSize = (id: string): { w: number; h: number } | null => (open('size') ? resetSize(id) : null);
