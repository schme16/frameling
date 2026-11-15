// The words of the topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  guess: `A **guessing game** is you drawing a secret word while your audience guesses it in chat. Frameling checks the guesses, counts them and shows who got it. **Nothing in your drawing changes, and the word never shows on screen while the round runs.**

## Run a round
1. Open **View > Audience features > Start a guessing game** (**Ctrl+Alt+Q**). Type a word, or press **Pick one for me**, or **From the jar** to use a prompt from your [prompt jar](help:prompt-jar).
2. Choose how long it runs, and whether it ends when someone gets it or when the time is up. **Start the round.**
3. Draw. The panel shows blanks for the letters, how many people are guessing, and how close the nearest guess is: **Cold, Cool, Warm, Hot**. That is about spelling, and never shows the guess.
4. **Hint** shows one more letter, for everyone to see. **Reveal** (**Ctrl+Alt+Shift+Q**) ends it when you like.
5. When someone gets it, Quill cheers and the word flips up with who got it and how long it took. **Close** puts it away.

**Stop** (**Ctrl+Alt+K**) drops a round that's going, without showing the word.

## Where you see the word
Only in the box that starts the round, and in the reveal. Your window may be on stream, so while the round runs the panel shows blanks and Quill never says it. With **Stream-safe** on, the word is dots in the start box until you press **Show**.

Forgetful? **Preferences > Behaviour > Peeking at the word** can be **Let me peek**: a **Peek** button shows it for three seconds. It never works while Stream-safe is on.

## Getting the guesses in
Your stream tool sends each guess to the [actions door](help:actions-door):
- **URL:** \`http://127.0.0.1:47213/v1/actions/guess.send\`
- **Body:** \`{"guess":"%rawInput%","player":"%userId%","name":"%user%"}\`

\`player\` is the viewer's **user id** (a number, not their name); \`name\` is optional. Frameling answers the same for a right guess and a wrong one, so nobody can use it to test words.

## What counts as a match
Capitals, punctuation, accents and spaces don't matter: **a cat**, **is it a cat?** and **CAT!!** all get it. So do plurals (**boxes**), spelling by sound (**elefant**) and one letter out in a word of five or more letters (**giraffee**). A word of four letters or fewer must be exact, and a different real word never counts: **house** isn't a slip for **horse**.

## What it keeps
- Each guesser is a mixed-up mark made with a secret for this round, never their id. Each person can guess 25 times, and once they've got it they're done. When the round ends, the secret and every mark are thrown away.
- A guess is checked and dropped: no text, no log. Only counts stay.
- A winner's name is read only if you turn on **Show the winner's name**, and is gone when you close the result.
- Nothing is written to a file. Only how long you last let a round run is remembered.

See also [Audience features and the On air pill](help:audience).`,
};
