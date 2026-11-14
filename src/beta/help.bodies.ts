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

**Write what happened:** a sentence is plenty. "It froze when I pressed Export, with the timeline open" tells us more than a page of guessing. Where you were is optional.

**How to reach you** is about you, not this report, so it is remembered on this computer and stays after you send. It shows as a saved detail with **Change** and **Forget it** beside it. Forget it and nothing of yours goes until you type it again.

**Read it before it goes:** press **Show me what you would send** and the whole report appears, exactly as it will be sent. **Send it** stays greyed out until you have read it, and nothing goes before you press it. After a send, your note is cleared and a line says it went.

**Your computer, in plain rows.** With **Include details of this computer** ticked (it is by default), the report carries the **processor** (name, cores, type), **how much memory** the computer has, the **graphics card** and driver, and **how Frameling is drawing**: OpenGL or Vulkan, hardware drawing on or off, and the switches it started with. That is what it takes to sort out a blank or slow canvas without a round of questions. It shows in a box of its own above the exact text. Untick it and none of it is sent.

**What else goes in:** what Frameling is (version, platform, screen, what your pen can do), the shape of your drawing (how big, how many frames, layers and artboards, whether it has sound) and anything that went wrong in the page.

**What never goes in:** your drawing, what you called it, where it lives, any file path, your name, and anything you typed anywhere else.

**Good to know:**
- There is no telemetry. Nothing counts what you do and nothing is sent when Frameling starts.
- Only a beta build can send. An ordinary build says so, and the pen check's **Save a file** is there instead.
- If a report won't go, Frameling says why. **Check the connection** asks the board if it is there without sending anything.

**The testing page.** [Everything a tester needs is on one page](https://project-boards.shanegadsby.com/s/qUR_fOzbJGN9T1_ItQ3HEJ6u): getting the build open, what is most useful to send, and what we do and don't see. No login.

help:pen-check help:preferences help:crash-notes`,
};
