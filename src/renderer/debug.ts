// With ?debug in the page address (the screenshot script and local checks use it), expose the store so a test can
// read and drive state. Never on in normal use.
import { store } from '../core/store';
import { allCommands, getCommand } from '../core/registry';
import { celebrate } from '../quests/feedback';
import { getQuest, startQuest } from '../quests/registry';
import { quillSheet, setQuillSheet, tick as quillTick } from '../ui/mascot/runtime';

if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __frameling: unknown }).__frameling = {
    store,
    run: (id: string) => getCommand(id)?.run(),
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
