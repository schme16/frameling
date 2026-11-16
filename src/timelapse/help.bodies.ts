// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'timelapse': `A **timelapse** is your whole drawing session squeezed into a short video, so a few hours of work plays in about half a minute. Frameling can keep the pictures for it quietly while you draw.

**Record one**
1. Press **Ctrl+Alt+Shift+R**, or pick **File > Export > Record a timelapse**.
2. A red badge shows in the corner while it records, with the time and how many pictures it has. It is never on unless you started it.
3. Draw as you like. Press **Pause** on the badge for a private moment or a break, and **Carry on** when you're back.
4. Press **Stop** on the badge, or the same keys again.

**Make the video**
1. Pick **File > Export > Make a timelapse video**, or press **Ctrl+Alt+Shift+V**.
2. Choose **How long should the video be?** About 10 seconds, 20, 30, a minute, or every picture one after the other. Under it, Frameling says how long it will really be and how much faster than you drew it (the **speed-up**).
3. Choose the kind of file, then **Make the video**.

**Which file?**
- **MP4 video (H.264)** is the one to pick. It plays on phones, social sites, editors and stream clips.
- **WebM video** is good for web pages, but some editors and phones won't open it.
- **GIF** is a small moving picture for places that only take that. It is made smaller and slower, because GIFs get big fast.

**What it keeps, and where**
- It only looks at your drawing. Nothing is added to it, nothing goes in the .frameling file, and Undo is untouched.
- A small picture is kept when something changes, never more often than every few seconds, and the pictures are written to a folder on your computer as you go.
- The pictures stay until you throw them away, or start a new timelapse. They never leave your computer.

**Good to know**
- A long session can't fill your disk. Past about 1200 pictures (or 200 MB), Frameling keeps every second picture and waits a bit longer between new ones, so the whole story still fits.
- Open another drawing and the timelapse stops, so it is always about one drawing. The pictures stay for making the video.
- **Carry on** adds to the last timelapse the next time you start, if you choose it when Frameling asks. You can change that, and have timelapses start by themselves when a drawing opens, in **Preferences > Behaviour**.
- Pictures are at most 1280 pixels across. Tiny pixel art is made bigger by whole numbers so it stays sharp.

For the other video and GIF options, see [Video, GIF and APNG](help:export-video-gif-apng).
`,
};
