// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'curves-levels': `**Curves** and **Levels** change how light or dark a picture is, in a way a brightness slider can't. They are what you reach for when a picture looks flat, murky or washed out. They work on **pixel layers**, and they change the layer's pixels for real, in one undo step. (**Colour adjust** in the [Effects](help:effects) menu is the gentler cousin: an effect you can switch off again.)

**Open them:** **Effects > Levels** or **Effects > Curves** (or **Ctrl+Shift+L** and **Ctrl+Shift+U**). They open one dialog with two tabs, a small live copy of your picture, and **Apply** at the bottom. **Compare with the original** flips back and forth. A selection keeps the change inside it.

**The grey shape** behind both graphs is the **histogram**: how many pixels there are of each brightness, dark on the left to light on the right. A flat picture is a hump in the middle with empty space either side.

**Levels, the quick fix:**
- **Darkest** (black point): anything this dark or darker becomes black. Drag the black handle in to where the shape starts.
- **Lightest** (white point): anything this light or lighter becomes white. Drag the white handle in to where the shape ends.
- **Midtones** (gamma): the grey handle brightens or darkens the middle without touching the ends. Above 1 is brighter.
- **Stretch to fit (auto)** does the first two for you.

**Curves, the fine tool:** brightness going in is along the bottom, brightness coming out is up the side. A straight diagonal changes nothing.
- **Click the line** to add a point, then **drag** it. Up lightens that part, down darkens it.
- **Double-click** a point to take it away. With a point focused, the arrow keys nudge it and Delete removes it.
- **The ready made ones** (Lighter, Darker, More contrast, Less contrast, Flip it) are good places to start. **More contrast** is the S shape that rescues most flat pictures.

**One colour at a time:** pick **Red**, **Green** or **Blue** above the graph to change that colour alone. Pull the red down on a picture that looks too warm. **All colours** moves them together. Levels come first, then the curve.

**Stretch the tones to fit (auto levels)** in the palette does the Levels auto step in one go, with no dialog.

**Good to know:**
- It works on the frame you are on. See-through pixels stay see-through.
- A layer with a [locked palette](help:palette-lock) stays on its palette: every pixel snaps back to the nearest palette colour afterwards.
- For a whole layer you want to keep adjustable, or animate, use [Colour adjust](help:effects) instead.`,
};
