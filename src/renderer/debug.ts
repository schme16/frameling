// With ?debug in the page address (the screenshot script and local checks use it), expose the store so a test can
// read and drive state. Never on in normal use.
import { store } from '../core/store';
import { findTemplate } from '../templates';
import * as tiles from '../tiles/debug';
import { allCommands, getCommand } from '../core/registry';
import { celebrate, praise } from '../quests/feedback';
import { allQuests, getQuest, questProgress, startQuest } from '../quests/registry';
import { getPrefs, setPrefs } from '../ui/prefs';
import { quillSheet, setQuillSheet, tick as quillTick } from '../ui/mascot/runtime';
import { setWeightsLook } from '../rig/weightsTool';
import { setShowQuill } from '../ui/mascot/goodbye';
import { closeSheet, openHelp, openPrefs } from '../ui/overlays';
import { toast } from '../ui/toast';

if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __frameling: unknown }).__frameling = {
    store,
    run: (id: string) => getCommand(id)?.run(),
    // Opens a starter template by id (for shots of a known document).
    template: (id: string) => {
      const t = findTemplate(id);
      if (t) store().load(t.make());
      return !!t;
    },
    tiles,
    // Theme and look picks, for shots in a given theme.
    prefs: { get: getPrefs, set: setPrefs },
    commands: () => allCommands().map((c) => c.id),
    // Swap in another Quill sheet (a placeholder, or art being tried out) without a rebuild.
    quests: {
      start: startQuest,
      // The dialogue shots also want the card for a quest with no badge, or no finish line of its own.
      celebrate: (id: string, o: { noBadge?: boolean; noFinish?: boolean } = {}) => {
        const q = getQuest(id);
        if (q) celebrate(o.noFinish ? { ...q, finish: undefined } : q, o.noBadge ? null : (q.badge ?? null), false, 60_000);
      },
      praise,
      progress: questProgress,
      all: () => allQuests().map((q) => q.id),
    },
    quill: { sheet: () => quillSheet.get(), setSheet: setQuillSheet, tick: quillTick, setShown: setShowQuill },
    toast,
    overlays: { openHelp, openPrefs, closeSheet },
    // The weight painting look, for the A/B in brand/ab/weights.
    weightsLook: setWeightsLook,
  };
}
