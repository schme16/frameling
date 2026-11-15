// The words of the live review help topic, kept apart so they load only when Help is opened.
export const bodies: Record<string, string> = {
  'live-review': `A **live review** lets up to four people watch your drawing while you work, point at things, and leave notes that come straight back to you. **They cannot change your drawing.** Nothing is on until you press Start, and it ends when you press Stop.

**Start one:**
- Press **Ctrl+Alt+L**, or choose **File > Start a live review**. A card shows a **four word code**.
- Give the code to up to four people. They choose **File > Join a live review**, type it in, and pick the name you will see.
- When somebody knocks, press **Let in** or **Not now**. You both need Frameling open at the same time.
- A **Live review** chip stays in the title bar the whole time, so you always know. **Stop the review** ends it for everyone.

**What they see:** your drawing in a window of their own, with every stroke showing as you draw it. They can zoom, move around, and step through frames. It says **Free** when they have left your frame, with a button to come back.

**Pointers go both ways.** Each reviewer's pointer shows on your drawing as a dot in their own colour, and yours shows on theirs. Dots fade after a pause.

**What they can leave:** a note, words on the picture, an arrow, a circle, or a sketch. These land in an **inbox on the card**, not in your drawing, so your Undo is never touched. Press **Keep** on one, or **Keep all in my drawing**, and they become notes and marks with the reviewer's name on. That is one step, and **Undo** takes it back. If frames have moved since somebody wrote a note, the card says so.

**When it ends,** Frameling asks once what to do with comments you have not kept (change it in **Preferences > Behaviour**).

**If the link drops,** reviewers see "Trying again". What they wrote meanwhile waits and goes when it comes back. If it does not, they can **Save my comments** as a file to send you another way. Open it with **File > Bring in review comments**.

**Streaming?** While Stream-safe or audience features are on, or OBS is really going out, a reviewer's name and words stay **covered** (a count, and a nameless dot) until you press **Read it**. Frameling asks once what your viewers can see, the same question as for a secret word. See [Covering secrets](help:cover-spoilers).

## Good to know
- **It is not copy proof.** A reviewer's copy holds every layer, hidden ones too. Do not review anything you would not send as a copy.
- **Your own notes and marks are not sent.** They are often "fix this" to yourself.
- Reviewers cannot toggle layers or see the timeline or history. Their words are cleaned, and stay in memory on your side until you keep them.
- **No account, no server.** The code is checked with a password handshake, and three wrong tries stop it letting new people in. Two people on strict networks may not connect: try [Send a copy](help:send-a-copy).`,
  'review-link': `A **review link** is your live review's code, wrapped up so one click does the joining. It looks like \`frameling://review?code=...\`. You send it instead of reading four words down a call.

**Send one:**
- Start a [live review](help:live-review). On the card, press **Copy the link**, or choose **File > Copy the live review link**.
- The first time, Frameling asks what to copy: **just the link**, or **a message with the link and the four words**. Chat apps often won't make a \`frameling://\` link clickable, so the message is the safer one. Change it any time in **Preferences > Behaviour**.
- Paste it into your chat, email or note.

**When somebody opens it:**
1. Frameling starts, or comes forward if it is already open.
2. It asks **Join a live review?** with their name to use. **Nothing has connected yet.** They press **Join**, or **Not now**.
3. You see them knock on your card, and you press **Let in**. The link never skips that.

**If the link won't click:** they can paste it into **File > Join a live review**, where the code box takes a link as well as the four words.

**Good to know:**
- Joining opens a window of its own, so whatever they were drawing stays exactly as it was, unsaved or not.
- A link carries the code and nothing else. It can't open files, change anything or pick the name they use.
- A link is a code. Anybody who sees it can try to join, so send it only to the people you mean, and remember you still choose who comes in. While you stream, the code in their question is covered until they press **Show**, and **Copy the link** never puts the link on screen.
- Frameling sets itself up to open these links each time it starts (the installer does too on Windows, and a Mac app has it built in). If a link does nothing, run Frameling once, then try again.
`,
};
