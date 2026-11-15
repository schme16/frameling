// The words of the live review help topic, kept apart so they load only when Help is opened.
export const bodies: Record<string, string> = {
  'live-review': `A **live review** lets up to four people watch your drawing while you work, point at things, and leave notes that come straight back to you. **They cannot change your drawing.** Nothing is on until you press Start, and it ends when you press Stop.

**Start one:**
- Press **Ctrl+Alt+L**, or choose **File > Start a live review**. A card shows a **four word code**.
- Give the code to up to four people. They choose **File > Join a live review**, type it in, and pick the name you will see.
- When somebody knocks, press **Let in** or **Not now**. You both need Frameling open at the same time.
- A **Live review** chip stays in the title bar the whole time. **Stop the review** ends it for everyone.

**What they see:** your drawing in a window of their own, with every stroke showing as you draw it. They can zoom, move around, and step through frames. Each reviewer's pointer shows on your drawing as a dot in their own colour, and yours shows on theirs.

**What they can leave:** a note, words on the picture, an arrow, a circle, or a sketch. They go **straight into your drawing** as notes and marks with the reviewer's name on, with no button to press. They go in quietly, so **your Undo and Redo are not touched**: Ctrl+Z still takes back your own last stroke, never a reviewer's note. To remove one, delete it like any note.

**Want to read first?** Untick **Add comments to my drawing as they come** on the card. Comments then wait in the card, and **Keep** or **Keep all in my drawing** writes them in as one step that **Undo** takes back.

**Streaming?** While Stream-safe or audience features are on, or OBS is really going out, a reviewer's name and words stay **covered** and wait in the card until you press **Read it**, or until you stop streaming, when they go in by themselves. Not streaming? Nothing is covered and nothing needs a press. See [Covering secrets](help:cover-spoilers).

**If the link drops,** reviewers see "Trying again", and what they wrote waits and goes when it comes back. If it does not, they can **Save my comments** as a file to send you; open it with **File > Bring in review comments**.

## Good to know
- **It is not copy proof.** A reviewer's copy holds every layer, hidden ones too. Do not review anything you would not send as a copy.
- **Your own notes and marks are not sent.** Reviewers cannot toggle layers or see the timeline or history, and their words are cleaned before they reach your drawing.
- **No account, no server.** The code is checked with a password handshake, and three wrong tries stop it letting new people in. On strict networks try [Send a copy](help:send-a-copy).
- Joined one yourself? See [A review that has ended](help:review-ended).`,
  'review-ended': `When the person you are reviewing for presses **Stop**, or sends you away, your review window tells you plainly. Nothing more will arrive, and nothing more can be sent.

**You can tell it is over three ways:**
- The title bar says **Review ended**, and so does the window in your task bar. A live one says **Live review**.
- A strip across the top says **This review has ended**, and the picture goes grey and still, with a frame around it.
- The note, words, arrow, circle and sketch tools switch off, because nothing you made now could get to them. **Look**, zoom and **Fit** still work, and you can still step through the frames.

**Save the picture:** press **Save this picture (PNG)** in the strip, or **Ctrl+S**. You are asked where it goes. It works the same in a live review: press **Save picture** in the toolbar. From the drawing window you can use **File > Save the picture from a live review** in the command palette.

**What it saves:** the frame you are looking at, as one flat PNG at the drawing's own size, made the way an export would make it. Layers the sharer has switched off and tracing pictures are left out, even though your copy holds them. Your own notes and marks are not on it. It is **not** their layered drawing: only a copy of the file itself holds that.

**Save my comments** is next to it. It keeps what you wrote as a file to send back, if some of it did not get through.

## Good to know
- The picture is the last one they sent. If you stepped to a frame of your own, that frame is saved.
- Closing the window ends it. Save first if you want the picture.
- See also [Live review](help:live-review).`,
};
