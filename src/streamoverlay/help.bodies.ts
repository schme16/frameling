// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'stream-overlay': `The overlay is what your **viewers** see on top of your drawing: Quill reacting, the dare that is running, the prompt you pulled, a vote. Nothing else: no menus, no panels, no drawing. The drawing comes from the [capture view](help:stream-capture), and the overlay goes over it with a see-through background.

**Add it to OBS.** About a minute:
1. Switch on [audience features](help:audience). The overlay only exists while they are on.
2. In **Preferences > Streaming**, find **Stream overlay** and press **Copy**. The address stays hidden on screen.
3. In OBS, under **Sources**, press **+** and pick **Browser**.
4. Paste the address into **URL**, and set **Width** and **Height** to match your stream, usually **1920** and **1080**.
5. Press **OK**, and drag it above your capture view.

Not sure it works? **Show a test on the stream overlay** (in the **Audience features** menu) puts a made-up Quill, banner and prompt up for a few seconds.

**What shows.** Each piece shows only while it is happening, then goes by itself. If nothing is happening, the overlay is empty, so it can stay in your scene all stream.
- **Quill**: when chat makes him cheer, hop, snack, cuddle or wave, or hold up a sign you said yes to.
- **Dares**: the challenge banner, the countdown (and **Time!**), and a small chip for each lasting dare.
- **Prompt**: the one you pulled from the [prompt jar](help:prompt-jar). By default it waits until you read it and press **Send to the overlay** on the jar card. Nothing else in the jar ever shows.
- **Votes**: when you run a chat vote, its bars and then its result.

**Nothing private reaches it.** It is on camera, so it works like [Stream-safe mode](help:stream-safe) that cannot be switched off. It is only handed a few plain facts: words, times and counts. Never a file name or folder, your name, a key, a link or an @name. Words from chat are boiled down to plain text first.

**Your choices.** In **Preferences > Streaming**: **Quill on the stream overlay** (show him, or keep him off it) and **Prompts on the stream overlay** (wait for you, or go up straight away).

**Is it safe?** The address only works from this computer, and it can only be read: it cannot press a button or change anything. It has its own secret in it, which is not your actions door key. Another web page in your browser cannot read it. If the address ever shows up on stream, press **Make a new stream overlay address**. The old one stops working at once.

**Stopping it.** It closes with the actions door, so switching audience features off, or **Stop**, empties it straight away.

See also [The actions door](help:actions-door).`,
};
