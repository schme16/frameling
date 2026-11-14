// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'saving-and-opening': `Your drawing lives in a single file ending in **.frameling**. It holds everything: every layer, every frame, your colours and clips.

## Saving

Press **Ctrl+S** (**Cmd+S** on a Mac). The first time, Frameling asks where to put the file and what to call it. After that, Save quietly updates the same file.

Want a second copy, or a new version to try something risky on? Use **Save as...** (**Ctrl+Shift+S**) to save under a new name. You carry on working in the new copy, and the copy keeps its own [versions](help:version-history), separate from the original's.

A dot next to the name at the top of the window means there are changes that aren't saved yet.

## Opening

Press **Ctrl+O** (**Cmd+O**) and pick a file. You can also double-click a .frameling file in your file manager, and it opens in Frameling.

**Open recent...** lists the drawings you had open lately, each with a little picture, so you can jump straight back in. See [Open recent](help:recent-drawings).

## Putting a drawing away

**File > Close drawing** (**Ctrl+W**) puts the drawing down and takes you back to the start screen, with the cards and **Start from an example**, even if you've turned **Show welcome** off. It's in **Open recent...** straight away, so you can pick it up again.

## If you have unsaved changes

Opening something else, starting a new drawing, closing the drawing, closing the window or quitting all ask first, and it's Quill who asks: **Save**, **Don't save**, or **Cancel**. Your drawing's name is in the question. **Save** is already chosen, so pressing **Enter** saves, and **Esc** is the same as **Cancel**. If the drawing has never been saved, the question says so, and **Save** asks where to put it. Nothing is lost by accident. Even **Don't save** isn't final: the work is kept for 7 days (see [Autosave](help:autosave)).

## If a file won't open

Frameling tells you why in plain words. If a file looks damaged, check whether you have an older copy, or look in your autosave (see [Autosave](help:autosave)).

---

Want to share your work as a video, a GIF or pictures? That's **Export**, a different thing from Save. See [Exporting](help:exporting).`,
  'recent-drawings': `**Open recent** shows each drawing you had open lately with a little picture of it, so you know your own work at a glance.

**Open it:** **File > Open recent...**, or search the command palette (**Ctrl+K**) for **Open recent**. Pick a row and the drawing opens. The start screen's **Pick up where you left off** shows the same pictures.

**Where the picture comes from:** every time you save, Frameling puts a small picture of the drawing inside the file (the first frame that has something on it, a few KB). It travels with the file, so it is there on any computer. Where the drawing is see-through you see a soft checkerboard behind it.

**Older drawings:** a file saved before this has no picture inside, so its row shows a folder icon. Open it once and Frameling keeps a picture for it in its own folder (your file isn't changed), and from then on it shows. Saving puts one in the file itself.

**Good to know:**
- The list appears at once and the pictures fill in a moment later, so it is never slow.
- If a file has gone (a drive unplugged, a folder moved) its row says so. It stays on the list in case it comes back; press the **x** beside it to take it off. The file itself is never touched.
- **Clear list** forgets them all, and the kept pictures with them.

help:saving-and-opening help:version-history`,
  restart: `Some things only change when Frameling starts again: the **Hardware drawing** switch, measuring plugins' memory, a new version that has just been put in. Wherever Frameling says that, a **Restart now** button does the whole job.

**What happens:** Frameling closes and opens again by itself, on the same drawing, the same frame and layer, the same zoom, with the window where you left it. If you have unsaved changes, they come across too. It all looks as if nothing happened: the drawing is still marked as unsaved, so closing it later still asks, and **Save** still saves.

**It never asks about saving,** because nothing is at risk. Your unsaved work is set aside first, the same safety copy [Autosave](help:autosave) keeps, and Frameling opens that.

**The one thing that doesn't come across is Undo.** The steps you could undo live in memory, so after a restart Undo starts fresh. The first time you restart with some steps to undo, Frameling tells you and asks once; it remembers your answer (change it in **Preferences > Behaviour**). Afterwards a short message says Undo started fresh.

**Any time:** search the command palette (**Ctrl+K**) for **Restart Frameling**.

**If it can't:**
- A drawing too big to set aside (hundreds of megabytes), or no room to write the copy: Frameling says so, then asks the usual question first (**Save**, **Don't save** or **Cancel**) and comes back to the saved drawing.
- A copy that can't find its own file to open again says so and stays open, so your drawing is safe. Close it and start it again yourself; the change is waiting.

**Good to know:**
- A drawing you have never saved comes back as **Untitled**, with its changes, ready for **Save**.
- After a Windows installer update, Frameling only closes so the installer can finish, so it asks about unsaved work like any close.

help:updates help:performance help:autosave`,
  autosave: `Every minute, if you have unsaved changes, Frameling tucks a copy of your work away in its own private folder.

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
- None of this ever touches your own file.`,
  'version-history': `Tried something and liked it better before? Open **File > Versions...** to look back.

## Versions Frameling keeps for you

- **Every 10 minutes** while you're drawing, if something changed.
- **Each time you save**, if something changed since the last version.
- **Named versions**, whenever you want one: **File > Save a version...** (**Ctrl+Alt+S**). Give it a name like "Before the big change".

Versions are kept in Frameling's own folder, never in your file, so your file stays the size it was.

Each drawing has its own list. A copy made with **Save as...** starts a fresh list, and the original keeps its versions.

## Looking back

The list shows each version, newest first, with a small picture and when it was made. Pick one to see it bigger. Drag the **Frame** slider to look through its frames.

## Bringing one back

- **Bring this back**: your drawing goes back to that version. It's one step, so **Ctrl+Z** (undo) brings your newer work straight back. Frameling also keeps a version of how it was, just in case.
- **Open as a copy**: the version opens as a new, unsaved drawing, and your current drawing stays as it is.

The first time, Frameling asks which of these you'd like **Bring this back** to do. You can change it later in Preferences > Behaviour.

## How long they're kept

- **Named versions** are kept until you delete them.
- **Automatic versions**: all of them from the last hour, then one an hour for a day, then one a day for 2 weeks. Older ones are tidied away.
- Press **Name it** on an automatic version to keep it for good. **Delete** removes a version straight away.`,
};
