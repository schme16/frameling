// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'review-page': `**Send for review** makes one web page with your drawing on it. Whoever you send it to opens it in any browser, looks around, and leaves notes. They don't need Frameling, an account, or to be online when you are. Their comments come back as a tiny file, and you bring them into your drawing.

**Send a drawing out**
1. Pick **File > Send for review...**, or press **Ctrl+Alt+Shift+E** (**Cmd+Alt+Shift+E** on a Mac).
2. Choose where the page goes. Frameling draws every frame and packs them in, then tells you how big it came out.
3. Send the file however you like: a message, an email, a shared folder.

**What the other person sees.** Your drawing as a picture, with a slider and **Play** if it moves. They can't change it. They pick a tool and click:
- **Note** leaves a message where they click.
- **Arrow**, **Circle** and **Sketch** draw right on the picture.
- On your notes, they can type an answer or tick **Done**.

They type their name, then press **Save my comments** (a small file) or **Copy as text**. Closing the page doesn't lose their work.

**Your own notes: the first time, it asks.** If your drawing has notes and marks, should they go on the page? **Show them** lets the other person answer and tick them off. **A clean page** sends just the drawing. Frameling remembers, and you can change it in **Preferences > Behaviour**.

**Bring the comments back**
1. Pick **File > Bring in comments...**, or press **Ctrl+Alt+Shift+I**, and choose the file.
2. Or, if they sent text, copy it and pick **Bring in comments from the clipboard**.
3. Their notes, answers and marks join yours, each with their name and the time. It's one **Undo** step.

Nothing of yours is replaced. Bring in the same file twice and nothing changes the second time, and two people can comment at once without clashing. A note counts as **done** if either of you ticked it, and you can untick it whenever you like.

**If frames moved.** The page remembers when it was sent. If you've added or moved frames since, a note pinned to one frame could land a frame off. Frameling says so, shows which version was looked at, and asks whether to bring the comments in anyway. Page notes aren't affected. Undo takes them all back out.

**Good to know**
- The page holds only the pictures, your notes and marks. No file paths, no folders, nothing about your computer.
- It's a picture, so it can't be turned back into your drawing. To hand over the drawing itself, use [Send a copy](help:send-a-copy).
- Notes and marks never go into an export. See [Notes on the canvas](help:canvas-notes) and [Draw marks on your drawing](help:canvas-marks).
`,
};
