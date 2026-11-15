// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'prompt-jar': `When you draw live, your audience can send you ideas for what to draw: "a frog in a teacup". They go into a jar that only you can see. You pull one out when you want one.

**Nothing shows until you say.** A prompt that arrives never appears on screen, not in a toast, not in a list. The **Jar** button in the title bar only shows a number. The words stay hidden until you open the jar yourself, so a rude one never gets in front of your viewers.

**Pull one out.** Open the jar and press **Pull one out** (or **Ctrl+Alt+Shift+J** from anywhere). The jar gives a little shake and a slip slides up with the prompt on it. Not feeling it? **Pass on it** throws it away, **Put it back** returns it, and **Pull another** tries again.

**Add your own.** Type a prompt in the box at the bottom, or paste a list with one on each line. Yours go through the same cleaning as everyone else's.

**What gets in.** Chat's words are cut to 80 plain characters first: no links, no @names, no emoji or odd symbols. A prompt with no real words is turned away, and so is one that is already in the jar. The jar holds 50. When it is full, new ones are turned away until you make room, and the **On air** card counts them as "did not work".

**You choose when it shows.** With [Stream-safe mode](help:stream-safe) on, a pulled prompt stays hidden until you press **Show it**. With the [stream overlay](help:stream-overlay) on, it waits for **Show on stream**.

**Who sent it?** Frameling never knows. Prompts are kept as words only: no name, no time, nothing about who sent them.

**Does it survive closing Frameling?** Not by default. The jar lives in memory only, so closing Frameling empties it and nothing is written to your computer. If you would rather keep a good prompt for next stream, set **Keep the prompt jar** to **Keep them for next time** in Preferences > Streaming. Then the words (and only the words) are saved on this computer. Either way, **Empty the jar** wipes everything, and the saved copy too, in one click.

**Sending prompts in.** The action is \`jar.add\`, on the [actions door](help:actions-door). Body \`{"text":"a frog in a teacup"}\`. A reward in Streamer.bot, Firebot or a Stream Deck can send it. There is nothing that reads the jar or shows a prompt from outside: only you pull.

**Stopping it.** It is part of [audience features](help:audience), so switching those off or pressing **Stop** closes the way in. What is already in the jar stays until you empty it.

From the keyboard: **Prompt jar**, **Pull a prompt out of the jar**, **Pass on this prompt**, **Add a prompt to the jar yourself** and **Empty the prompt jar** are all in the command palette and the **Audience features** menu.`,
};
