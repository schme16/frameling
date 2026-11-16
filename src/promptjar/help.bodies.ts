// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'prompt-jar': `When you draw live, your audience can send you ideas for what to draw: "a frog in a teacup". They go into a jar that only you can see. You pull one out when you want one.

**Nothing shows until you say.** A prompt that arrives never appears on screen, not in a toast, not in a list. The **Jar** button in the title bar only shows a number. The words stay hidden until you open the jar yourself.

**Pull one out.** Open the jar and press **Pull one out** (or **Ctrl+Alt+Shift+J** from anywhere). The jar gives a little shake and a slip slides up. Not feeling it? **Pass on it** throws it away, **Put it back** returns it, and **Pull another** tries again.

**It stays covered until you read it.** A viewer may have typed something rude, and if they can see your screen it would be on stream before you read it. So the slip arrives as a covered bar. Press **Read it** (or **Enter**, it is already selected). **Cover it** puts it back, and closing the card does too. Only see the [capture window](help:stream-capture)? Say so once and it shows at once: [Covering secrets](help:cover-spoilers).

**Add your own.** Type one in the box at the bottom, or paste a list, one per line. Yours are cleaned like everyone else's.

**What gets in.** Chat's words are cut to 80 plain characters: no links, no @names, no emoji. A prompt with no real words, or one already in the jar, is turned away. The jar holds 50; when it is full, new ones wait outside until you make room.

**How fast.** It takes one prompt, then waits 3 seconds. Change that under **Pause between prompts** in Preferences > Streaming. A pause for each person is your chat program's job.

**You choose when viewers see it.** With the [stream overlay](help:stream-overlay) on, a prompt you have read waits for **Send to the overlay**, so it only goes up when you say.

**Who sent it?** Frameling never knows: prompts are kept as words only.

**Does it survive closing Frameling?** Not by default: the jar lives in memory only, and nothing is written to your computer. To keep good prompts for next stream, set **Keep the prompt jar** to **Keep them for next time** in Preferences > Streaming. Only the words are saved. **Empty the jar** wipes everything, the saved copy too, in one click.

**Sending prompts in.** The action is \`jar.add\`, on the [actions door](help:actions-door). Body \`{"text":"a frog in a teacup"}\`. A **!prompt** chat command can send it: see [Chat commands](help:chat-commands). There is nothing that reads the jar or shows a prompt from outside: only you pull.

**Stopping it.** Switching [audience features](help:audience) off, or pressing **Stop**, closes the way in. What is in the jar stays until you empty it.

Every step is in the command palette and the **Audience features** menu.`,
};
