// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'canvas-notes': `A **note** is a little message you leave on the canvas, for yourself or whoever opens the file next: "the elbow pops here", "ask about the colour", "this frame is the key one". Notes are saved in your \`.frameling\` file, and **no export ever includes them**: not a PNG, a sprite sheet, an SVG, a GIF, a video, Lottie, Godot or a PDF.

**Leave one:**
- Pick the **Notes** tool (**Shift+Y**) and click where you want it, then type. A note that never gets any words is never kept.
- Or choose **View > Notes > Add a note in the middle of the view**.
- The first time, Frameling asks whether a new note belongs to **this frame**, **the page** or **this layer**, then remembers. Change it any time in the tool's options, or in **Preferences > Behaviour**.

**Read, move, answer.** Each note is a small marker. Click it to open it, drag it to move it. Its card shows who left it and when (put your name in the Notes panel and it goes on every note you write), a box to **answer**, a tick for **Done**, and a menu to change where it belongs. **Esc** closes the card.

**Where a note belongs.** A frame note shows only on its frame, and the timeline puts a dot on that frame so you can find it. A layer note shows on the frames where that layer has a drawing. A page note shows everywhere.

**Work through a pass.** The **Notes** panel (**View > Panels**) lists every note in the file. Click one to go to its frame and layer; tick it off when it's dealt with. **Next note** and **Previous note** step through them. **Hide notes that are done** clears the ticked ones from the canvas, and **Remove the notes that are done** takes them out of the file (Undo brings them back).

**Show or hide them all** with **Ctrl+Alt+N**. The switch is remembered.

**Good to know:**
- Notes belong to the artboard they were left on.
- While you are editing inside a symbol, notes stay out of the way.
- A note's marker is a button, so you can open it with any tool.
- An older Frameling opens a file with notes and simply doesn't show them; nothing else is lost.

To keep a whole layer out of exports instead, see [Reference layers](help:reference-layers). To trace over a picture, see [A picture behind your drawing](help:reference-picture).`,
};
