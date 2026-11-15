// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  audience: `Some people draw live. Audience features are the small, safe ways viewers or stream tools can join in, like cheering Quill on. This page is the switch and the safety they share.

**It starts off.** Nothing from outside can reach Frameling until you switch it on, in **Preferences > Streaming**, the **Streaming** menu, or the command palette.

**Not for you?** It all lives in the **Streaming** menu and the **Streaming** tab in Preferences. **Tuck away the streaming tools** takes the whole family out of your menus at once, and **Bring back the streaming tools** puts it back.

**The pill.** While it is on, a yellow **Audience participation: on** pill sits in the title bar and nothing can hide it. Yellow because it only means the switch is on, not that you are streaming. **Press it to turn audience participation off.** The small arrow beside it opens the card, with what is waiting and what has happened. A number on the arrow says how many are waiting.

**OBS shares the pill.** With [Going live with OBS](help:obs-golive) on, what OBS is doing (**OBS ready** in green, **Live** or **Rec** in red, **No OBS** quiet) sits beside the yellow part. Red only ever means OBS is really recording or streaming. Press it for the OBS settings.

**Stop.** Pressing the yellow **Audience participation: on** pill, **Stop everything** on the card, or **Ctrl+Alt+K** drops everything at once: the queue is emptied, every effect stops, every way in is closed and the switch goes off. The key works from any window if your desktop allows it, otherwise only while Frameling is the window you are in. It never touches OBS, and a note on screen has **Turn back on** if you pressed by mistake.

**Kept in check.** Every audience action is on a short list, and anything not on it is turned away. Then:
- **A cooldown for each kind.** After a Quill cheer, the next Quill action waits a little.
- **A limit on how often anything happens.** A pause between any two, and a most-per-minute.
- **A queue.** Too many at once wait their turn, oldest first. A full queue turns the rest away, and waiting too long drops one. **Empty the queue** clears it in one click.

**How careful.** The first time you switch it on, Frameling asks if you want **Relaxed**, **Balanced** or **Strict**. Change it in **Preferences > Streaming**, where you can also choose whether it always starts off.

**Interrupting your drawing.** Most actions only turn the view, move Quill or put words on the stream. Some, like dares and pen tricks, reach your drawing. A second switch, **Let the audience interrupt your drawing**, starts off, and while it is off those are turned away. When it is on, each one is a single step: one **Undo** takes it back, and the limits still apply.

**What is kept.** Counts only: how many things happened, and how many were turned away and why. Never who sent them.

See also [Preferences](help:preferences) and [Finding things](help:command-palette).`,
};
