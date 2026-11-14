// Switches that keep a whole feature out of sight for now (see `hidden` on a feature descriptor). Today that is
// Interactives, which is off, so nothing in the app says the word: no menu entry, no export card, no command, no help,
// no Preferences switch, no file type. To bring it all back, set "interactives" to true in flags.json (next to this
// file) and rebuild. The installers read the same file (electron-builder.cjs), so the .flplay file type comes back with
// it. Nothing is deleted while it is off: the feature's code all stays.
import flags from './flags.json';

export const INTERACTIVES_ENABLED: boolean = flags.interactives === true;

let forced: boolean | undefined;
/** Tests only: pretend the switch is on or off (undefined puts it back). Set it before the modules that build words from it load. */
export function _forceInteractivesForTests(on: boolean | undefined): void {
  forced = on;
}

export const interactivesEnabled = (): boolean => forced ?? INTERACTIVES_ENABLED;

/** `on` while Interactives is switched on, `off` (nothing, by default) while it is hidden. For its mentions in other features' help and menus. */
export const ix = (on: string, off = ''): string => (interactivesEnabled() ? on : off);
