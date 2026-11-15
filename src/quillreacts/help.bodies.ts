// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'quill-reacts': `When you draw live, chat can give Quill a little fuss. A viewer redeems a reward and, with [Twitch connected](help:twitch-links), Quill reacts on your screen. For a typed command, or from a Stream Deck, your stream tool (Streamer.bot, Firebot) pokes the [actions door](help:actions-door) instead. He is already your friend, so it is just him being himself.

**What chat can do.** Each one has an action name your stream tool calls:
- **Cheer** (\`quill.cheer\`): he cheers, and says chat is cheering for you.
- **Hop** (\`quill.hop\`): boing.
- **Snack** (\`quill.snack\`): he munches.
- **Cuddle** (\`quill.nuzzle\`): he nuzzles.
- **Wave** (\`quill.wave\`): he says hi to chat.
- **Sign** (\`quill.sign\`): he holds up a sign with a few words from chat. More on that below.

**See them yourself first.** **Try Quill reacting to chat** in the **Audience features** menu (or each one in the command palette, starting with **Try:**) plays it on your screen. It works with audience features off, and sends nothing anywhere.

**Signs are your call.** Words from chat are words from a stranger, so a sign never just appears. Quill asks you first, with the words in the question: **Hold it up** or **Not that one**. Say nothing for 15 seconds and the answer is no. Before you ever see them, the words are cut to 60 characters and boiled down to plain text: no web addresses, no @names, no emoji or symbols, no odd characters, nothing stretched out. If you would rather chat never put words on your screen, set **Signs from chat** to **Never take signs** in **Preferences > Streaming**.

Heads up: the question shows the words in the Frameling window. If you are sharing that window, viewers can see it while you decide.

**One Quill, one at a time.** There is only one of him. After a reaction, the next one waits a few seconds, and a new one takes the place of the one still showing, so chat cannot make him flail. Signs wait 30 seconds between them. A stricter setting in **Preferences > Streaming** makes every wait longer.

**It changes nothing.** Quill reacting never touches your drawing. It does not make him closer or add to a streak, and nothing is counted or saved: no words, no names, no who-asked. His rule stays that nothing ever makes him worse off.

**Quill talks on your screen only.** He cannot write into your chat, and it only signs in to Twitch if you press **Connect Twitch**, and then only to listen. It never signs in to YouTube or anything else.

**Stopping it.** It is all part of audience features, so **Stop** (or **Ctrl+Alt+K**) ends it, and a sign that is waiting for your answer is dropped. With **Show Quill** off in Preferences, the words still show but he does not.

See also [Audience features](help:audience) and [The actions door](help:actions-door).`,
};
