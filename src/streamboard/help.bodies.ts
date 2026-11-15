// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'stream-control': `**Stream control** is a window of big buttons for another screen, so you can run your stream without leaving your drawing. Open it from **Streaming > Stream control** or press **Ctrl+Alt+I**.

It keeps working while you draw: press a button with the drawing window still in front, and one tap does the job. Frameling remembers where you put it.

**The buttons**
- **Start a vote** starts one. While it runs it becomes **End the vote** and counts the votes, then **Put the result away**. See [Votes](help:votes).
- **Start a guessing game** works the same way and turns into **Reveal the word**. **Give a hint** shows one more letter. The secret word is never on this board. See [Guess the drawing](help:guess).
- **Pull a prompt** takes one from the [prompt jar](help:prompt-jar). **Pass on this prompt** throws it away.
- **Audience participation** switches it on or off. It is yellow while on, an information colour and not a broadcast light. See [Audience features](help:audience).
- **Empty the queue**, **Put every dare back** and **Put my pen back** are for when chaos is too much. **Stream-safe** hides paths and names.
- At the top, a chip says what **OBS** is doing: green when it is ready, red only while it is really live or recording.

A button that cannot work right now is dimmed and says why.

**Stop everything** is the red bar at the bottom, in the same place every time and never among the other buttons. One press empties the queue, stops every effect and switches audience participation off. Press **Audience participation** to turn it back on.

**Moving the buttons.** Press **Arrange**. Tap a button to pick it up, then tap where it goes: it takes that spot and the others shuffle along. **Earlier** and **Later** nudge it a place, **Put away** moves it to a tray where **Add** brings it back, and **Smaller** and **Bigger** resize them all. Nothing to drag or hold, so a mouse, a finger and a tablet pen all work. **Put them back** starts again. Your layout is saved with your other settings.

**Covered words stay covered here too.** This screen is often one you share, so a prompt you pulled shows as dots with **Read it**, just like the main window, and reading it in one reads it in both. The secret word of a guessing game is never sent to this window, and the board shows counts, never who. Tell Frameling once what your viewers can see with **What can your viewers see?** (see [Covering secrets and unread words](help:cover-spoilers)).

**Buttons that open a setup window.** **Start a vote** and **Start a guessing game** need a question or a word typed in Frameling. The first time, Frameling asks if it should come forward for you. Change it in **Preferences > Behaviour**.

**On top of OBS?** The first time, Frameling asks if the board should stay above your other windows.

It goes when the streaming tools are tucked away.`,
};
