// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'crash-notes': `If Frameling crashed last time, a dazed **Quill** meets you when you open it again, swirly eyes and all, and asks whether to send the **crash notes** so it can be fixed.

**He asks, you decide.** Nothing is sent unless you press **Send the notes**. **Read what would go** shows the whole report, word for word, before you decide.

**What the notes are:** how Frameling stopped (it was shut down without closing properly, or the drawing window crashed), what Frameling and this computer are (version, platform, screen, what your pen can do) and, unless you turned it off in Preferences > Diagnostics, the processor, memory and graphics card, shown in plain rows inside **Read what would go**. Never your drawing, what you called it, where it lives or anything you typed.

**No thanks:** the box under the buttons remembers it, and then Quill stays away after a crash. Change your mind any time in **Preferences > Behaviour > Quill after a crash**.

**Later:** the command **Send the notes from the last crash** brings him back with the same notes, whatever you said before.

**How Frameling knows:** when it starts it leaves a small file in its own folder, and when it quits properly it takes the file away. If the file is still there next time, it didn't quit properly. Nothing leaves your computer for this.

**Good to know:**
- He turns up once per crash, and never after you closed Frameling the usual way.
- Only a beta build can send. A copy without a way to send still has Quill say what happened, and then leaves it there.
- With **Let me send reports to the makers** off in Preferences > Diagnostics, he doesn't offer to send anything.
- If the notes won't go, Frameling says why in plain words and you can try again.

help:beta-reports help:preferences`,
  'beta-reports': `Something went wrong and you want to tell us? **Preferences > Diagnostics > Telling the makers**, or the command **Tell the makers what happened**.

**The switch.** **Let me send reports to the makers** is on in a beta build and off in an ordinary one. Turn it off and nothing is sent at all, crashes included.

**Crashes tell us by themselves.** In a beta build, when something falls over, the problem goes on its own, up to a few times a run. It carries what went wrong and nothing about what you were doing.

**Your computer in those reports.** Nobody reads them before they go, so Frameling asks you once, soon after it starts: may they also say what your computer is (the processor, memory and graphics card)? That is what sorts out a blank or slow canvas. **Yes, include them** sends the same details a report you write by hand carries. **No, keep them out** leaves them bare. Until you answer they stay bare. Change your mind any time in **Preferences > Diagnostics > Telling the makers**, or in **Preferences > Behaviour**.

**Write what happened:** a sentence is plenty, like "It froze when I pressed Export." Where you were is optional.

**How to reach you** is about you, not this report, so it is remembered on this computer and stays after you send. It goes exactly as you typed it, address and all, and the preview shows it that way. **Change** and **Forget it** sit beside it.

**Read it before it goes:** **Show me what you would send** shows the whole report, exactly as it will be sent. **Send it** stays greyed out until you have.

**Your computer, in plain rows.** With **Include details of this computer** ticked (it is by default), a report carries the **processor**, **memory**, **graphics card** and driver, and **how Frameling is drawing**, in a box above the exact text. Untick it and none is sent, by hand or by itself.

**What else goes in:** the version, platform and screen, the shape of your drawing (size, frames, layers, sound) and what went wrong in the page.

**What never goes in:** your drawing, what you called it, where it lives, any file path, your name, and anything you typed anywhere else. A path or an email address inside your note is swapped for a plain label first. Only **How to reach you** goes as typed.

**Good to know:**
- There is no telemetry. Nothing counts what you do and nothing is sent when Frameling starts.
- Only a beta build can send. An ordinary build says so, and the pen check's **Save a file** is there instead.
- If a report won't go, Frameling says why.

**The testing page.** [Everything a tester needs, on one page](https://project-boards.shanegadsby.com/s/qUR_fOzbJGN9T1_ItQ3HEJ6u). No login.

help:pen-check help:preferences help:crash-notes`,
};
