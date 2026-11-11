import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'saving-and-opening',
    title: 'Saving and opening',
    section: 'Files',
    summary: 'Save your drawing as a .frameling file, and open it again any time.',
    keywords: ['save', 'open', 'file', 'load', 'recent', 'frameling file'],
    body: `Your drawing lives in a single file ending in **.frameling**. It holds everything: every layer, every frame, your colours and clips.

## Saving

Press **Ctrl+S** (**Cmd+S** on a Mac). The first time, Frameling asks where to put the file and what to call it. After that, Save quietly updates the same file.

Want a second copy, or a new version to try something risky on? Use **Save as...** (**Ctrl+Shift+S**) to save under a new name. You carry on working in the new copy.

A dot next to the name at the top of the window means there are changes that aren't saved yet.

## Opening

Press **Ctrl+O** (**Cmd+O**) and pick a file. You can also double-click a .frameling file in your file manager, and it opens in Frameling.

**Open recent...** lists the drawings you had open lately, so you can jump straight back in.

## If you have unsaved changes

Opening something else, starting a new drawing, or closing the window all ask first: **Save**, **Don't save**, or **Cancel**. Nothing is lost by accident.

## If a file won't open

Frameling tells you why in plain words. If a file looks damaged, check whether you have an older copy, or look in your autosave (see [Autosave](help:autosave)).

---

Want to share your work as a video, a GIF or pictures? That's **Export**, a different thing from Save. See [Exporting](help:exporting).`,
  },
  {
    id: 'autosave',
    title: 'Autosave',
    section: 'Files',
    summary: 'Frameling keeps a safety copy of unsaved work every minute, in case something goes wrong.',
    keywords: ['recover', 'crash', 'lost', 'backup', 'restore', 'safety'],
    body: `Every minute, if you have unsaved changes, Frameling tucks a copy of your work away in its own private folder.

It **never touches your own file**. It's only a safety net.

## Getting your work back

If Frameling closes unexpectedly (a power cut, a crash), the next time you start it you'll see:

> We kept a copy of your unsaved work. Restore it?

Press **Restore** and you're back where you were. The drawing comes back marked as unsaved, so press **Ctrl+S** to keep it.

Frameling only offers this when the safety copy is newer than your saved file.

## Good to know

- Saving clears the safety copy, because your file is up to date.
- Choosing **Don't save** when closing also clears it. You said you didn't want those changes.
- There's one safety copy at a time: the latest drawing you worked on.`,
  },
]);
