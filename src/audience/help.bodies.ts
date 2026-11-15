// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  audience: `Some people draw live. Audience features are the small, safe ways viewers or stream tools can join in, like cheering Quill on. This page is the switch, and the safety every one of them shares.

**It starts off.** Nothing from outside can reach Frameling until you switch it on: **Preferences > Features > Audience features**, **Streaming > Audience features**, or **Audience features** in the command palette.

**Not for you?** Everything for streaming lives in one place: the **Streaming** menu in the menu bar, and the **Streaming** heading in **Preferences > Features**. **Tuck away the streaming tools** (palette, or the **Streaming** menu) takes the whole family out of your menus in one go, and **Bring back the streaming tools** puts it back.

**The On air pill.** While it is on, a red **On air** pill sits in the title bar and nothing can hide it. Press it to see what is waiting and what has happened. A little number says how many are waiting.

**Stop.** The **Stop** button beside the pill, or **Ctrl+Alt+K**, drops everything at once: the queue is emptied, every effect stops, every way in is closed and the switch goes off. The key works from any window if your desktop allows it, and otherwise only while Frameling is the window you are in, so remember the button.

**Kept in check.** Every audience action is on a short list, and anything not on it is turned away. Then:
- **A cooldown for each kind.** After a Quill cheer, the next Quill action waits a little.
- **A limit on how often anything happens.** There is a pause between any two, and a most-per-minute.
- **A queue.** Too many at once wait their turn, oldest first. A full queue turns the rest away, and anything that waits too long is dropped. **Empty the queue** clears it in one click.

**How careful.** The first time you switch it on, Frameling asks if you want **Relaxed**, **Balanced** or **Strict**. Change it in **Preferences > Behaviour**, where you can also choose whether it always starts off (the default).

**Interrupting your drawing.** Most actions only turn the view, move Quill or put words on the stream. Some, like dares and pen tricks, reach your drawing. A second switch, **Let the audience interrupt your drawing**, starts off. While it is off those are turned away, and your audience is told only that it is not available. When it is on, each one is a single step: one **Undo** takes it back, and the queue and limits still apply. **Stop** halts them too.

**What is kept.** Counts only: how many things happened, and how many were turned away and why. Never who sent them. Nothing about your audience goes in your drawing, a file or a report.

See also [Preferences](help:preferences) and [Finding things](help:command-palette).`,
};
