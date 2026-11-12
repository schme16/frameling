// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pen-tablet': `Plug your tablet in, pick the **Brush** (**B**) and draw. Most pens need nothing more.

## What your pen can do

- **Pressure.** Press harder for a thicker line. The Brush does this on vector layers. Pencil, Eraser, Spray and the pixel tools can too: switch it on in the tool's options (the **Pen** switches show once Frameling has seen your pen).
- **Light touch, fainter line.** Brush and Pencil can fade the whole line when you press lightly.
- **Leaning.** Lay the pen over for a bigger mark, like shading with the side of a pencil. Switch on **Leaning changes size**.
- **Eraser end.** Flip the pen over to erase. It goes back to your tool after.
- **Pen buttons.** The button nearest the tip picks a colour while held. The other one moves the page. You can change both.
- **Hovering.** You see a ring the size of your brush, with a faint inner ring for the smallest mark a light touch makes.
- **Stabilizer.** Every drawing tool has a slider. **Pull string** hangs the brush on a rope behind your pen. **Average** smooths your last few moves. It steadies a mouse too, and each tool remembers its own amount.

## Pen and tablet preferences

Open **Preferences, Pen and tablet**. You can try your pen on a pad (it says whether Frameling hears a pen or a mouse), pick a **Soft**, **Normal** or **Firm** pressure feel or drag the dots on the graph, set the lightest press that counts, and choose what the buttons do. One table shows what every tool does with pressure, leaning and the stabilizer.

Frameling keeps one set of settings for any pen, and one for your mouse and fingers. Browsers don't say which tablet is plugged in, so there is nothing to pick.

## Fingers and palms

While your pen is near the screen, a resting hand is ignored. Otherwise two fingers drag the page and pinch to zoom, and one finger draws (or moves the page, if you choose that).

## If it is not working

**Every line is the same thickness, or the pad says you are using a mouse.** The tablet is sending mouse movements, not pen ones.

- **Windows:** open the Wacom Tablet Properties or the Huion driver and turn on **Windows Ink**, then restart Frameling.
- **Mac:** install the maker's driver. It then just works.
- **Linux:** current systems handle most Wacom and Huion tablets on their own. If pressure is missing, check the tablet in another drawing program.

**Faint marks while hovering?** Raise **Lightest press that counts**. **Wobbly lines?** Try some **Stabilizer**.

**Still stuck?** [Quill can check your pen with you](help:pen-check) and save a report file for whoever is helping.

See also: [Brush](help:tool-brush), [Eraser](help:tool-eraser).`,
};
