// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pen-check': `If your pen or tablet is not behaving, Quill can check it with you. It takes about a minute.

**When it starts.** The first time Frameling sees a pen, Quill pops up and asks if you want to check it. Say **Not now** and he asks again next time. Say **Don't ask again** and he won't. You can also start it any time from **Preferences, Diagnostics**, or press **Ctrl+K** and type *check my pen*.

## What he asks for

One thing at a time, on a grey pad. He ticks each off when he sees it, and you can **Skip this one** if your pen can't do it.

1. **Hover** the pen just above the pad.
2. **Press** from very light to very hard in one line.
3. **Lean** the pen left, then right.
4. **Twist** the pen in your fingers (few pens can).
5. **Flip** it and use the eraser end.
6. Hold the **button nearest the tip** while you draw.
7. Hold the **other button**, if there is one.
8. **Scribble fast** for a couple of seconds, so he can count how many dots a second the pen gives.
9. Press an **express key**, or spin the **touch ring**, if your tablet has them.

## The report

At the end Quill shows a Save dialog and writes a small file named like *frameling-tablet-report-2026-11-12.json*. It holds what Frameling heard from your pen (pressure, lean, twist, button numbers, how fast the dots come), the version of Frameling and of your system, and a short trace of the pen's movements. It has no drawings, no file names and nothing about you. Nothing is sent anywhere: you choose whether to share the file.

Once a report is saved, Quill won't offer the check again by himself. You can still run it from Preferences, Diagnostics.

Not working at all? See [Drawing with a pen or tablet](help:pen-tablet) for the Windows Ink setting that most often fixes it.`,
};
