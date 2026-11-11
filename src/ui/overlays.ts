// Which big floating things are open: command palette, preferences, help window, welcome and new-document sheets.
import { createStore } from './mini';

export type PrefsPage = 'general' | 'themes' | 'behaviour' | 'keyboard' | 'workspaces';

export interface Overlays {
  palette: boolean;
  prefs: { page: PrefsPage; /** Scroll to and highlight this command in the keyboard page. */ commandId?: string } | null;
  help: { topic?: string; anchor?: string; query?: string } | null;
  /** `welcome` is the first-run sheet, `new` is the same chooser opened from File > New, `examples` is the same sheet scrolled to the examples. */
  sheet: 'welcome' | 'new' | 'examples' | null;
  /** The About Frameling card. */
  about: boolean;
  /** Quill's first-run hello (Help > Meet Quill again). */
  onboarding?: boolean;
}

export const overlays = createStore<Overlays>({ palette: false, prefs: null, help: null, sheet: null, about: false });

const patch = (p: Partial<Overlays>) => overlays.set((o) => ({ ...o, ...p }));

export const openPalette = () => patch({ palette: true });
export const closePalette = () => patch({ palette: false });
export const togglePalette = () => patch({ palette: !overlays.get().palette });

export const openPrefs = (page: PrefsPage = 'general', commandId?: string) => patch({ prefs: { page, commandId }, palette: false });
export const closePrefs = () => patch({ prefs: null });

/** Opens the help window on a topic (and a heading inside it), or on the contents when there's no topic. */
export const openHelp = (topic?: string, anchor?: string, query?: string) => patch({ help: { topic, anchor, query }, palette: false });
export const closeHelp = () => patch({ help: null });

export const openSheet = (sheet: 'welcome' | 'new' | 'examples') => patch({ sheet, palette: false });
export const closeSheet = () => patch({ sheet: null });

export const openAbout = () => patch({ about: true, palette: false });
export const closeAbout = () => patch({ about: false });

export const openOnboarding = () => patch({ onboarding: true, sheet: null, palette: false });
export const closeOnboarding = () => patch({ onboarding: false });

export const anyOverlayOpen = (): boolean => {
  const o = overlays.get();
  return o.palette || !!o.prefs || !!o.help || !!o.sheet || o.about || !!o.onboarding;
};
