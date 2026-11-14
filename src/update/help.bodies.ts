// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  updates: `Frameling can tell you when a newer version is out, and put it in when you say so. It never does anything behind your back.

**How it works:** a little after Frameling starts, and again twice a day, it asks this project's releases on GitHub whether there's something newer. If there is, a small card turns up in the corner, but only at a calm moment, when nobody is drawing and nothing else is asking you a question. It says what is new in the release's own words.

**Three answers:**
- **Update now** gets the new version and puts it in. Nothing is downloaded until you press it.
- **Skip this one** means that version is never offered again, even next time you open Frameling. A newer one still is. **Offer it again** in Preferences brings a skipped one back.
- **Not right now** puts it away, and it comes back the next time Frameling starts.

**Check any time:** **Help > Check for updates**, or the same words in the command palette. It tells you plainly when you're already on the newest. You asked, so it goes ahead even if the quiet looking is switched off.

**What is sent:** one request to GitHub, which sees your internet address like any website does. Nothing of yours goes with it: no drawing, no name, no count of what you do. Switch it off in **Preferences > Diagnostics > Look for new versions** and Frameling never looks by itself.

**How it goes in:**
- **Linux AppImage:** the new file replaces this one in the same folder, then **Restart now** opens it.
- **Windows installer:** the installer opens and Frameling closes so it can finish. If you have unsaved work, Frameling asks about it first.
- **Anything else** (a Mac, the Windows portable version, a copy running from the source folder): Frameling says where to get the new one and opens the page.

**Good to know:**
- It checks the download's size and checksum before using it, and only ever downloads from this project's releases.
- Drafts and pre-releases are only offered to a **beta copy**. A beta copy is never swapped for an ordinary release; it opens the page so you can get the new beta, and it keeps its own settings.
- The offer waits while you draw, or while a window or question is open.

help:beta-reports help:preferences`,
};
