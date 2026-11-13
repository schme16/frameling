// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'crash-notes': `If Frameling crashed last time, a dazed **Quill** meets you when you open it again, swirly eyes and all, and asks whether to send the **crash notes** so it can be fixed.

**He asks, you decide.** Nothing is sent unless you press **Send the notes**. **Read what would go** shows the whole report, word for word, before you decide.

**What the notes are:** how Frameling stopped (it was shut down without closing properly, or the drawing window crashed), what Frameling and this computer are (version, platform, screen, what your pen can do). Never your drawing, what you called it, where it lives or anything you typed.

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

**The switch.** **Let me send reports to the makers** is on in a beta build, because that is what being a tester is, and off in an ordinary build. Turn it off and nothing is sent at all, crashes included.

**Crashes tell us by themselves.** In a beta build, when something falls over, the problem goes on its own, up to a few times a run so a build stuck in a loop cannot sit there sending. It carries what went wrong and nothing about what you were doing.

**Write what happened:** a sentence is plenty. "It froze when I pressed Export, with the timeline open" tells us more than a page of guessing. You can add where you were and how to reach you, and both are optional.

**Read it before it goes:** press **Show me what you would send** and the whole report appears, exactly as it will be sent. Nothing else goes with it.

**Then press Send it.** Nothing you have written goes before that press.

**What goes in:** what Frameling and this computer are (version, platform, screen, what your pen can do), the shape of your drawing (how big, how many frames, layers and artboards, whether it has sound) and anything that has gone wrong in the page while it was open.

**What never goes in:** your drawing, what you called it, where it lives on your computer, any file path, your name, your address unless you typed one in the box, and anything you typed anywhere else in Frameling. Paths and addresses are taken out of your note too, in case one slips in.

**Good to know:**
- There is still no telemetry. Nothing counts what you do, nothing is sent when Frameling starts, and nothing you write goes until you press Send. The one thing that goes on its own is a crash, in a beta build, with the switch on.
- Only a beta build can send. An ordinary build has no key in it, so the button says so and the pen check's **Save a file** is there instead.
- If a report won't go, Frameling says why in plain words and keeps it under the buttons. **Check the connection** asks the board if it is there and likes this copy's key, without sending anything.
- The report goes to the makers' board and nowhere else. The key a beta build carries can only add a report: it cannot read the board, and it cannot read back anything it has sent.

**The testing page.** [Everything a tester needs is on one page](https://project-boards.shanegadsby.com/s/qUR_fOzbJGN9T1_ItQ3HEJ6u): getting the build open on each kind of computer, what is most useful to send, and what we do and don't see. No login, nothing to join.

help:pen-check help:preferences help:crash-notes`,
};
