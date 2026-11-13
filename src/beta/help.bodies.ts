// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'beta-reports': `Something went wrong and you want to tell us? **Preferences > Diagnostics > Telling the makers**, or the command **Tell the makers what happened**.

**Start with the switch.** **Let me send reports to the makers** is off until you turn it on. With it off there is no panel and no button.

**Write what happened:** a sentence is plenty. "It froze when I pressed Export, with the timeline open" tells us more than a page of guessing. You can add where you were and how to reach you, and both are optional.

**Read it before it goes:** press **Show me what you would send** and the whole report appears, exactly as it will be sent. Nothing else goes with it.

**Then press Send it.** That press is the only thing that sends anything, ever.

**What goes in:** what Frameling and this computer are (version, platform, screen, what your pen can do), the shape of your drawing (how big, how many frames, layers and artboards, whether it has sound) and anything that has gone wrong in the page while it was open.

**What never goes in:** your drawing, what you called it, where it lives on your computer, any file path, your name, your address unless you typed one in the box, and anything you typed anywhere else in Frameling. Paths and addresses are taken out of your note too, in case one slips in.

**Good to know:**
- Frameling has no telemetry. Nothing counts what you do, nothing is sent when it starts, and there is no report you have not read and sent yourself.
- Only a beta build can send. An ordinary build has no key in it, so the button says so and the pen check's **Save a file** is there instead.
- The report goes to the makers' board and nowhere else. The key a beta build carries can only add a report: it cannot read the board, and it cannot read back anything it has sent.

help:pen-check help:preferences`,
};
