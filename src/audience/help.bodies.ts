// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'viewers-take-part': `Viewers can take part in two ways, and they need different things. **Twitch events** (channel point rewards, cheers, follows, subs, raids) reach Frameling straight from Twitch, with nothing else installed. **Chat** (votes, guesses, a prompt typed in the box) never does: Frameling doesn't read your chat, on purpose, so a **bot** (a small program that reads chat for you) has to pass it on. This page is the route, in order.

**1. Switch audience features on.** **Preferences > Streaming > Audience features**. A red **On air** pill shows, and **Stop** (**Ctrl+Alt+K**) drops everything. Leave **Let the audience interrupt your drawing** off until you want dares and pen tricks to touch your art. See [Audience features](help:audience).

**2. Connect Twitch, for events.** In **Preferences > Streaming**, find **Twitch**: tick what you want to hear, press **Connect Twitch**, and approve the short code. Frameling has its own Twitch app, so that's all. If your copy says it has none, paste your own Client ID where it asks. See [Connect Twitch](help:twitch).

**3. Link events to actions.** On the same screen press **Add a link**: a reward makes Quill cheer, a cheer sets off a dare. A reward that asks viewers to type something can feed the [prompt jar](help:prompt-jar). See [Twitch links](help:twitch-links).

**4. Add a bot, for chat.** Without one, nobody can vote or guess. **Firebot** is the easy one, and runs on Linux:
- In Frameling, open **Preferences > Streaming**, find **Actions door**, and press **Save setup file**.
- In Firebot, open its **File** menu, then **Firebot Setups**, then **Import Firebot Setup**. Pick the file and paste your key when it asks.

That gives you **!vote**, **!guess** and **!prompt**. Or use Streamer.bot. See [Firebot](help:chat-commands-firebot), [Streamer.bot](help:chat-commands-streamerbot) and [Chat commands](help:chat-commands).

**5. Show your viewers.** Add the overlay to OBS as a **Browser** source, or they can't see the votes or Quill. See [Stream overlay](help:stream-overlay).

**6. Run your first vote.** **Streaming > Votes > Start a vote** (**Ctrl+Alt+Y**), then type **!vote 1** in your own chat and watch the bars grow. See [Votes](help:votes).

## Good to know
- **Votes and guesses aren't on the Twitch links list**, because they come from chat, not from an event.
- Bot and Frameling must run on the same computer.
- Only want rewards and cheers? Do steps 1 to 3.`,
  'cover-spoilers': `Two things should never reach your viewers by surprise: **a secret** (the word in a guessing game, a prompt you have pulled) and **words a viewer typed that you have not read yet**. Frameling covers both until you press to read them.

**You tell it once what your viewers can see.** The first time you switch on [audience features](help:audience), or open a guessing game, it asks:
- **My screen or my whole window**: anything that could spoil or shock stays covered until you press. Pick this if you are not sure.
- **Only the capture window**: your viewers see the [capture window](help:stream-capture) and nothing else, so this window is private and nothing is covered.

Frameling can't tell which one you do, so it asks, and that one answer covers every screen below. Change it any time with **What can your viewers see?** in the command palette or the **Audience features** menu, or in **Preferences > Behaviour**. Until you answer, it covers.

**What is covered**
- **The word in a guessing game** shows as dots while you type it. Press the **eye** to check it: it shows for six seconds, then goes back to dots. See [Guess the drawing](help:guess).
- **A prompt you pull from the jar** arrives as a covered bar. Press **Read it** (or **Enter**, it is already selected). **Cover it** puts it back. See [The prompt jar](help:prompt-jar).
- **Words chat wants on your screen**, a Quill sign, a challenge banner, a message from your stream tool: the toast says chat sent something, with **Read it**. You read them first, then **Put it up** or **Not that one**.
- **Peek** at the word in a round only works when your viewers cannot see this window.

**What is not covered.** Counts, like the number on the **Jar** button, the **On air** pill and how many are waiting. They hold no words. Votes, which are your own question and counted bars. The capture window itself, which only draws your drawing.

**Good to know**
- This is not [Stream-safe mode](help:stream-safe). That one hides file paths, your name and keys. This one hides secrets and unread words. They are separate switches on purpose.
- A cover hides the words completely. Nothing is blurred, so nothing can be read through it, and its dots are always the same length.
- With the [stream overlay](help:stream-overlay), a prompt only goes up when you press **Send to the overlay**, after you have read it.`,
  audience: `Some people draw live. Audience features are the small, safe ways viewers or stream tools can join in, like cheering Quill on. This page is the switch, and the safety every one of them shares.

**It starts off.** Nothing from outside can reach Frameling until you switch it on: **Preferences > Streaming > Audience features**, **Streaming > Audience features**, or **Audience features** in the command palette.

**Not for you?** It all lives in the **Streaming** menu and the **Streaming** tab in Preferences. **Tuck away the streaming tools**, from the palette or that tab's switch, takes the whole family out of your menus at once and the **Streaming** menu leaves the bar with it. **Bring back the streaming tools** puts it all back.

**The On air pill.** While it is on, a red **On air** pill sits in the title bar and nothing can hide it. Press it to see what is waiting and what has happened. A little number says how many are waiting.

**OBS shares the pill.** With [Going live with OBS](help:obs-golive) on, what OBS is doing (**Live**, **Rec**, **OBS ready**, **No OBS**) sits beside **Stop**. Press it for the same card, with the OBS settings.

**Stop.** The **Stop** button beside **On air**, or **Ctrl+Alt+K**, drops everything at once: the queue is emptied, every effect stops, every way in is closed and the switch goes off. The key works from any window if your desktop allows it, and otherwise only while Frameling is the window you are in, so remember the button. Stop never touches OBS.

**Kept in check.** Every audience action is on a short list, and anything not on it is turned away. Then:
- **A cooldown for each kind.** After a Quill cheer, the next Quill action waits a little.
- **A limit on how often anything happens.** There is a pause between any two, and a most-per-minute.
- **A queue.** Too many at once wait their turn, oldest first. A full queue turns the rest away, and anything that waits too long is dropped. **Empty the queue** clears it in one click.

**How careful.** The first time you switch it on, Frameling asks if you want **Relaxed**, **Balanced** or **Strict**. Change it in **Preferences > Streaming**, where you can also choose whether it always starts off (the default).

**Interrupting your drawing.** Most actions only turn the view, move Quill or put words on the stream. Some, like dares and pen tricks, reach your drawing. A second switch, **Let the audience interrupt your drawing**, starts off. While it is off those are turned away, and your audience is told only that it is not available. When it is on, each one is a single step: one **Undo** takes it back, and the queue and limits still apply. **Stop** halts them too.

**What is kept.** Counts only: how many things happened, and how many were turned away and why. Never who sent them. Nothing about your audience goes in your drawing, a file or a report.

See also [Preferences](help:preferences) and [Finding things](help:command-palette).`,
};
