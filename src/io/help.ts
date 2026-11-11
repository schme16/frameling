import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'saving-and-opening',
    order: 1,
    media: 'saving-and-opening.png',
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

Opening something else, starting a new drawing, or closing the window all ask first: **Save**, **Don't save**, or **Cancel**. Nothing is lost by accident. Even **Don't save** isn't final: the work is kept for 7 days (see [Autosave](help:autosave)).

## If a file won't open

Frameling tells you why in plain words. If a file looks damaged, check whether you have an older copy, or look in your autosave (see [Autosave](help:autosave)).

---

Want to share your work as a video, a GIF or pictures? That's **Export**, a different thing from Save. See [Exporting](help:exporting).`,
  },
  {
    id: 'autosave',
    media: 'autosave.png',
    title: 'Autosave',
    section: 'Files',
    summary: 'Frameling keeps a safety copy of unsaved work every minute, in case something goes wrong.',
    keywords: ['recover', 'crash', 'lost', 'backup', 'restore', 'safety', 'lost my work', 'lost work', 'safety copy'],
    body: `Every minute, if you have unsaved changes, Frameling tucks a copy of your work away in its own private folder.

It **never touches your own file**. It's only a safety net.

## Getting your work back

If Frameling closes unexpectedly (a power cut, a crash), the next time you start it the welcome sheet's first card
says **Your unsaved work from today at 22:50** (with your own time). If the welcome sheet is turned off, a message at
the bottom asks instead.

Press **Restore** and you're back where you were. **Not now** leaves it in Recover unsaved work. The drawing comes back marked as unsaved, so press **Ctrl+S** to keep it.

Frameling only offers this when the safety copy is newer than your saved file.

## Changed your mind? Recover unsaved work

When you choose **Don't save**, Frameling doesn't throw the work away. It keeps a copy for **7 days**. To get it back, open **File > Recover unsaved work...** (or search for it in the command palette).

The list shows each kept drawing with a small picture, its name and when it was last changed. Press **Open** and it comes back as unsaved work, so **Save** asks where to put it. **Delete** removes a kept copy straight away. Copies older than 7 days are cleared out each time Frameling starts.

A copy left behind by a crash is kept in the same list, even if you press **Not now**.

## Good to know

- Saving the drawing clears its kept copies, because your file is up to date.
- There's one live safety copy at a time (the latest drawing you worked on). Kept copies are one per drawing, the newest.
- None of this ever touches your own file.`
  },
]);
