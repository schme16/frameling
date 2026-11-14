// The words of the help topic in record-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'record-motion': `The fastest way to make something move with feeling: drag it across the canvas, and Frameling keeps what you did as keys. Your pace and your wobbles are in there, so a quick flick looks quick and a slow drift looks slow.

**Record one**
1. Go to the frame where the move should start.
2. Select what should move (V). Nothing selected moves the whole drawing on this frame.
3. Pick **Frames and motion > In-betweens and easing > Record a move**, or press **Alt+R**.
4. Press on the canvas and drag. The timeline plays while you hold the button, and the drawing follows your hand.
5. Let go. Your drag becomes keys, in one step you can undo.

**Tidy it with Detail**
A hand makes far too many points to be keys, so Frameling keeps only the ones that matter: where you turned, paused or changed speed. A bar at the bottom of the canvas has the slider.
- **Low** gives a handful of smooth keys, easy to edit.
- **High** follows your hand closely, up to a key on every frame, just as you moved.
- Slide it and the keys change right away. The dots on the canvas show where each key landed.

**Keep it as keys, or as one path**
- **Keys** (the usual) gives keys with in-betweens. A slow start or a gentle stop is kept as an [easing](help:easing) instead of extra keys.
- **One path** gives two keys and one smooth line between them, with your timing kept as a single easing curve. It's neat for a swoop that doesn't stop on the way. If you paused partway, use **Keys**. See [Paths to follow](help:motion-paths).

**Try again**
Press **Record again** on the bar (or **Record the move again** in the palette) to take it back and have another go. Recording from a key that already moves records over it.

**Good to know**
- A recording can be 30 seconds long at most.
- Sound doesn't play while you record. Press Play afterwards to check it against the music.
- If the move runs over drawings later on the layer, Frameling asks once whether it should take their place or push them along. You can change the answer in Preferences.
- Pixel art is turned into a symbol first, like the [one-click motions](help:one-click-motions).
- Everything it makes is ordinary [keys and in-betweens](help:tweens), so you can change any of them afterwards.`,
};
