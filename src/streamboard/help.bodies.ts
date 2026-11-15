// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'stream-control': `**Stream control** is the private side of your stream: a window for your second screen where you read and choose what is not agreed to yet, while the drawing window stays the thing your viewers see. Open it from **Streaming > Stream control** or press **Ctrl+Alt+I**. It keeps working while you draw: one tap does the job even with the drawing window in front.

**Below the buttons**
- **Vote.** Press **Write a vote**, type the question and options, read them over, then **Start the vote**. While it runs you see each count and the time left. See [Votes](help:votes).
- **Guessing game.** The secret word, the blanks your viewers see and the guesses coming in, newest first. **Pick a word here** starts a round without the word ever touching the drawing window. See [Guess the drawing](help:guess).
- **Prompt jar.** Every prompt waiting, not one pulled blind. **Pull this one** puts your choice in your hand. See [the prompt jar](help:prompt-jar).

It shows counts and never who sent anything.

**Is this screen private?** A line at the top says. It follows the answer you already gave to **What can your viewers see?**, so you are never asked twice:
- **Only the capture window**: private.
- **One screen, the one Frameling is on**: private while the board is on your other screen, covered on the same one.
- **All my screens, or I am not sure**: covered.

**Private** shows the word, the guesses and the waiting prompts plainly. **Covered** shows dots with **Read it**, since words from chat are unread until you read them, and the secret word is not sent here at all. If you show the board to your viewers as a panel, press **This board is on my stream**: it covers whatever the answer was. See [Covering secrets and unread words](help:cover-spoilers).

**The buttons** start and end a vote or a round, give a hint, pull a prompt, switch **Audience participation** on or off, and clear dares and the queue. A button that cannot work now is dimmed and says why. A chip at the top says what **OBS** is doing.

**Stop everything** is the red bar at the bottom, in the same place every time. One press empties the queue, stops every effect and switches audience participation off.

**Moving the buttons.** Press **Arrange**, tap a button, then tap where it goes. **Put away** tucks one into a tray, **Smaller** and **Bigger** resize them all, **Put them back** starts again.

**Good to know:** nothing here goes on your drawing. Frameling asks once whether the board stays on top of OBS, and whether a setup window should come forward.`,
};
