// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  performance: `Frameling feels slow, or the picture glitches? **Preferences > Performance** says how it is drawing and gives you the settings to try. Open it from **Edit, Performance...**, or search for "slow" or "GPU" in Preferences.

## What Frameling found

A short answer first: **Your card is doing the drawing**, or **Frameling is drawing in software, which is slower**, with what to try underneath. Then the facts a bug report asks for:

- **Card in use** and its **driver**.
- **Drawing path**: how Frameling talks to the card (Vulkan, OpenGL, Direct3D or Metal), or Software when it isn't using one.
- **Card memory**, when your system says. Many don't, and Frameling says so rather than guessing.
- **Memory held**: what Frameling's own parts take, and how much of that is kept drawings.

From a terminal, Frameling prints the same answer in one line as it starts. **Copy for a bug report** puts all of it on your clipboard. **Check again** asks once more.

These are what the system reports, not a speed test.

## What you can change

- **Hardware drawing.** Lets the card do the drawing (the *GPU*, or *hardware acceleration*). Turn it off if the picture flickers or the window won't open. It needs a restart: the page says so before you press anything, then offers **Restart now**, which opens Frameling again on the same drawing, unsaved changes and all (see [Restarting Frameling](help:restart)).
- **Drawings kept ready.** Memory for keeping each layer's picture ready, so stepping, scrubbing and playing over drawings you have already seen doesn't redraw them. Bigger keeps more of a long or layered animation ready and costs that much memory. Small is 80 MB, Usual is 160 MB.
- **Scrubbing the timeline.** **Quick** leaves the onion skins, ghosts and light table out while you drag along the timeline and puts them back when you let go.
- **Playback frame rate limit.** The most frames a second playback shows. On a computer that can't keep up, a lower limit gives each frame more time, so playback drops frames and stays in time instead of running slow. Your animation's own frame rate isn't touched.
- **Undo steps** are in [General](help:look-and-feel). Each step keeps a copy of what changed, so a long history is memory too.
- **Put these back to how they were** undoes all of the above.

## If Frameling won't open

Hardware drawing is the one setting that can stop the window opening, so it has a way back from outside the app. Make an empty file called **gpu-off** in Frameling's folder (the page shows the exact place), or start Frameling with **FRAMELING_GPU=off**. Either way it opens in software, and you can turn the card back on in Preferences.

- Linux: \`~/.config/Frameling/gpu-off\`
- Windows: \`%APPDATA%\\Frameling\\gpu-off\`
- Mac: \`~/Library/Application Support/Frameling/gpu-off\`

**Good to know:**
- On the web version your browser decides how to draw, so the card and hardware drawing aren't shown. The other three settings still work.
- Quick scrubbing and the playback limit only change what you see on screen. Exports are never affected.

help:preferences help:look-and-feel help:timeline-playing`,
};
