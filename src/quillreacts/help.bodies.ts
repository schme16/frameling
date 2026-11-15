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

**Signs are your call.** Words from chat are words from a stranger, so a sign never just appears. Quill asks you first. The words stay covered until you press **Read it**, then it is **Hold it up** or **Not that one**. Say nothing for 15 seconds and the answer is no. Before you ever see them, the words are cut to 60 characters and boiled down to plain text: no web addresses, no @names, no emoji or symbols, no odd characters, nothing stretched out. If you would rather chat never put words on your screen, set **Signs from chat** to **Never take signs** in **Preferences > Streaming**.

Heads up: the question shows the words in the Frameling window. If you are sharing that window, viewers can see it while you decide.

**One Quill, one at a time.** There is only one of him. After a reaction, the next one waits a few seconds, and a new one takes the place of the one still showing, so chat cannot make him flail. Signs wait 30 seconds between them. A stricter setting in **Preferences > Streaming** makes every wait longer.

**It changes nothing.** Quill reacting never touches your drawing. It does not make him closer or add to a streak, and nothing is counted or saved: no words, no names, no who-asked. His rule stays that nothing ever makes him worse off.

**Quill talks on your screen only.** He cannot write into your chat, and it only signs in to Twitch if you press **Connect Twitch**, and then only to listen. It never signs in to YouTube or anything else.

**Stopping it.** It is all part of audience features, so **Stop** (or **Ctrl+Alt+K**) ends it, and a sign that is waiting for your answer is dropped. With **Show Quill** off in Preferences, the words still show but he does not.

See also [Quill welcomes new people](help:quill-welcomes), [Audience features](help:audience) and [The actions door](help:actions-door).`,
  'quill-welcomes': `When somebody follows, subscribes, cheers or raids your channel, Quill can say hello. It shows on your screen and on the [stream overlay](help:stream-overlay), so your viewers see it too. He never writes in chat.

**What he does.**
- **Follow:** he waves.
- **Subscribe:** he nuzzles, and thanks them again if they came back.
- **Cheer:** he cheers and says how many bits.
- **Raid:** a wave that turns into a cheer, and he stays longer, because it is the biggest hello.

**Turn it on.** With [Twitch connected](help:twitch-links), point a follow, sub, cheer or raid at **Quill welcomes** in Preferences > Streaming > **Twitch** (or say yes to the starter links when you first connect). Nothing welcomes anybody until you do, and audience features have to be on. To see each one first, use **Try:** in the **Audience features** menu. It uses a made-up name.

**Names.** By default Quill just says the name, with no question. It is cleaned first: emoji, web addresses and invisible or look-alike characters go; letters in any language stay. A name that cleans down to nothing is welcomed without one.

Good to know: a name is a stranger's words, and some are rude. Cleaning cannot tell a crude name from a kind one, so a crude display name can reach your screen and the overlay before you have read it. To change that, set **Names in welcomes** in **Preferences > Streaming**:
- **Ask me first:** the name stays covered until you press **Read it**, then it is **Say it** or **Leave the name out**. Say nothing for 15 seconds and he welcomes them without it. Only a yes puts the name anywhere a viewer can see. The question shows the name in the Frameling window, so if you share that window, viewers can see it while you decide.
- **Never use names:** nobody is named, and Frameling does not even read the name from Twitch.

**A crowd.** A raid is one welcome. Followers who arrive while he is busy are welcomed together ("and 12 more"), with the first name and no more than four said. Nobody is dropped, and cheers come out as one total. Under **Ask me first**, only the first name is asked about.

**Nothing is kept.** No names, no counts, no list of who came. To avoid greeting one person twice, Quill holds up to 40 names in memory, and under **Ask me first** the names you left out are held the same way. They are gone when you close Frameling.

**Stopping it.** **Stop** (or **Ctrl+Alt+K**) ends the welcome on screen and drops everyone waiting.

See also [Quill reacts](help:quill-reacts), [Connect Twitch](help:twitch-links) and [Audience features](help:audience).`,
};
