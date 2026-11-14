// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'reference-picture': `A **reference picture** sits behind your drawing so you can trace it or copy from it: a photo of a pose, a model sheet, a mood board. It lives on its own layer, you can move, size, turn and fade it, and **no export ever includes it**.

**Bring one in:**
- Choose **File > Import > Reference picture...** and pick a JPG or PNG.
- Or drop one picture on the window. The first time, Frameling asks whether it is a reference or pixel art, then remembers.
- Or copy a picture (a screenshot works) and press **Ctrl+Alt+V**.

**Place it.** Right after it arrives, a small bar opens. Drag the picture to move it, a corner to size it, the round knob above it to turn it (hold **Shift** to snap). The bar has the exact numbers, **Fit** (all of it, in the middle), **Fill** (covers the page) and **Own size**. Press **Done** when it sits right. Open it again any time with **Ctrl+Alt+R**.

**Fade, hide, lock.** It is an ordinary layer, so the eye hides it, the padlock keeps it from being nudged, and the opacity slider fades it. A new one starts at 60%, so your lines stand out against it. **Show or hide the reference pictures** (under **Frames and motion > Reference picture**) switches every one at once.

**It stays sharp.** The picture keeps its own size and is drawn from that every time, so zooming in shows its detail, not a blur.

**A picture for each frame.** One picture shows on every frame to begin with. For a few traced frames, go to a frame, pick the reference layer and choose **Frames and motion > Reference picture > Use another picture from this frame on...**. That picture shows from there until you set the next one. **Take away the picture set on this frame** goes back.

**Good to know:**
- Only the part over the page shows. Slide it about to get the bit you want in view.
- It needs a JPG or PNG. A phone photo comes the right way up.
- It is saved inside your file, but only while a layer still shows it.

To trace over a video instead, see [Open a video to trace over](help:reference-video). To trace one of your own frames, see [Light table](help:light-table). To keep other layers out of exports, see [Reference layers](help:reference-layers).`,

  'reference-video': `Trace over footage: a person walking, a real bounce, a screen recording. Pick a video and its frames come in as pictures to draw over.

**Open one:** choose **File > Import > Video, to trace over...** and pick an MP4, WebM or MOV.

**What you choose** (a window shows it before anything happens):
- **From** and **to**: the stretch you want, in seconds. A scrub bar shows the picture at each end.
- **Pictures a second**: the video may run at 30, but you rarely need that many to trace. Fewer pictures is lighter and quicker.
- **As:** a **reference layer** (smooth pictures behind your drawing, never exported), or **pixel frames** (the pictures become frames you can paint on).
- **Size** (pixel frames, and for how sharp the reference is kept).

The window says how many pictures that makes and about how much room they take. It warns when that is a lot, and tells you what it left out: a video with no picture track, a codec this computer can't read.

**Where they land.** A reference layer gets a picture for each frame, in order, from the frame you are on, fitted to your page. If the video is longer than your animation, Frameling asks once whether to make the animation as long, then remembers. As pixel frames they come in like [pictures as frames](help:import-sequence), as one undo step.

**Good to know:**
- MP4 (H.264), WebM and MOV open on most computers. If a video won't, convert it to MP4 first.
- Sound isn't brought in. Use [Sound](help:sound) for that.
- You can move, size, fade and hide the reference layer like any [reference picture](help:reference-picture).`,
};
