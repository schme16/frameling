// With ?debug in the page address (the screenshot script and local checks use it), expose the store so a test can
// read and drive state. Never on in normal use.
import { store } from '../core/store';
import { findTemplate } from '../templates';
import { allCommands, getCommand } from '../core/registry';
import { celebrate } from '../quests/feedback';
import { getQuest, startQuest } from '../quests/registry';
import { quillSheet, setQuillSheet, tick as quillTick } from '../ui/mascot/runtime';

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
    commands: () => allCommands().map((c) => c.id),
    // Swap in another Quill sheet (a placeholder, or art being tried out) without a rebuild.
    quests: {
      start: startQuest,
      celebrate: (id: string) => {
        const q = getQuest(id);
        if (q) celebrate(q, q.badge ?? null, false, 60_000);
      },
    },
    quill: { sheet: () => quillSheet.get(), setSheet: setQuillSheet, tick: quillTick },
  };
}
