// The words of the topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  guess: `A **guessing game** is you drawing a secret word while your audience guesses it in chat. Frameling checks the guesses, counts them and shows who got it. **Nothing in your drawing changes, and the word never shows on the panel while the round runs.**

## Run a round
1. Open **Streaming > Guess the drawing > Start a guessing game** (**Ctrl+Alt+Q**). Type a word, or press **Pick one for me**, or **From the jar** to use a prompt from your [prompt jar](help:prompt-jar).
2. Choose how long it runs, and whether it ends when someone gets it or when the time is up. **Start the round.**
3. Draw. The panel shows blanks for the letters, how many people are guessing, and how close the nearest guess is: **Cold, Cool, Warm, Hot**. That is about spelling, and never shows the guess.
4. **Hint** shows one more letter, for everyone to see. **Reveal** (**Ctrl+Alt+Shift+Q**) ends it when you like.
5. When someone gets it, Quill cheers and the word flips up with who got it and how long it took. **Close** puts it away.

**Stop** (**Ctrl+Alt+K**) drops a round that's going, without showing the word.

## Where you see the word
Only in the box that starts the round, and in the reveal. While the round runs the panel shows blanks and Quill never says it.

In the start box the word is dots while you type, in case your viewers can see your screen. Press the **eye** to check it: it shows for six seconds, then covers again. **Pick one for me** and **From the jar** fill it with dots too. Only see the [capture window](help:stream-capture)? Say so once and it shows plainly: [Covering secrets](help:cover-spoilers).

Forgetful? **Preferences > Streaming > Peeking at the word** can be **Let me peek**: a **Peek** button shows it for three seconds, but only when your viewers cannot see this window.

## Getting the guesses in
Your stream tool sends each guess to the [actions door](help:actions-door), and [Chat commands](help:chat-commands) sets up typing **!guess** for viewers:
- **URL:** \`http://127.0.0.1:47213/v1/actions/guess.send\`
- **Body:** \`{"guess":"%rawInput%","player":"%userId%","name":"%user%"}\`

\`player\` is the viewer's **user id** (a number, not their name); \`name\` is optional. Frameling answers a right guess and a wrong one the same way.

## What counts as a match
Capitals, punctuation, accents and spaces don't matter: **a cat**, **is it a cat?** and **CAT!!** all get it. So do plurals (**boxes**), spelling by sound (**elefant**) and one letter out in a long word (**giraffee**). Short words must be exact, and a different real word never counts: **house** isn't **horse**.

## What it keeps
- Each guesser is a mixed-up mark, never their id, thrown away with the secret when the round ends. Each person gets 25 guesses.
- A guess is checked and dropped: no text, no log. Only counts stay.
- A winner's name shows only if you turn on **Show the winner's name**, and goes when you close the result.
- Nothing is written to a file, apart from how long you last ran a round.

See also [Audience features and the pill](help:audience).`,
};
