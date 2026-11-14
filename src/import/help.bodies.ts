// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'import-sequence': `Pictures made somewhere else, like a scanned run of drawings, a render from another tool or a clean-up pass, come in as the frames of one animation. Frameling's own **PNG sequence** export comes back in the same way, so a round trip out and in works.

**Bring them in:** choose **File > Import > Pictures or a zip, as frames...** and pick several pictures or one zip, or choose **File > Import > Folder of pictures, as frames...**. You can also drag several pictures onto the window.

Before anything happens, a window shows what it found: how many pictures, the first and last names, their size, and what it left out. Cancel changes nothing.

**The order.** Names are sorted the way you'd expect, by the numbers in them, so frame2 comes before frame10. If numbers are missing from the run (7 to 9, say), it tells you, because the animation will jump there.

**The speed.** Pick the frames per second and how long each picture is held (2 is "on twos"). A drawing you add to keeps its own rate. **Play it backwards** reverses the order.

**What it leaves out, and says so:**
- Files in the folder or zip that aren't pictures (notes.txt, Thumbs.db).
- Pictures it can't read. It names them and carries on with the rest.

Good to know:
- PNG, JPG, WebP, BMP and GIF are read. A GIF gives its first picture only; for an animated one use [Bringing in pictures](help:pixel-import).
- If the folder holds more than one run (walk-1, walk-2 and jump-1, jump-2), you can pick one or take all of them in name order.
- Pictures of different sizes sit in the middle of a frame as big as the biggest.
- The first time you bring something in while the drawing already has something on it, Frameling asks whether to add it to this drawing or open it as a new one, then remembers. Change it any time in **Preferences > Behaviour**.
- It is one undo step, and takes up to 2,000 pictures.

To go the other way, see [Exporting](help:exporting).`,

  'import-svg': `An SVG from Illustrator, Inkscape or Figma comes in as vector shapes, not a picture, so you can animate them and export them again.

**Bring one in:** choose **File > Import > SVG or logo...**, or open it with **File > Open**, or drag it onto the window. An **.svgz** (a packed SVG) works too.

**What comes across:**
- Paths, rectangles, circles, ellipses, lines and polygons, with fills, outlines, line ends and corners.
- Linear and radial gradients.
- Groups, kept as groups that select and move together.
- Inkscape layers and Illustrator layers, kept as layers with their names. Hidden ones stay hidden.
- Moves, turns, scales and skews, built into the shapes.
- Colours written any way (names, #hex, rgb, hsl) and styles from the file's own style sheet, which is how Illustrator writes them.
- Text, as text you can still edit.

**What it can't carry, and says so:** filters (blurs and shadows), masks, clipping paths, pattern fills (they come in grey), pictures inside the SVG, arrowheads and other line markers, dashed lines (they come in solid) and animation inside the file. After the import, a message says **See what was left out** and lists each kind with how many there were. The shapes themselves still come in.

Good to know:
- It comes in the size it was drawn. Added to an open drawing, it sits in the middle, and is made smaller if it wouldn't fit.
- Text uses the font name from the file. If this computer doesn't have that font, another shows in its place.
- The first time you bring one in while the drawing already has something on it, Frameling asks whether to add it to this drawing or open it as a new one, then remembers. Change it any time in **Preferences > Behaviour**.
- A file that isn't an SVG, or is damaged, gives a plain message saying why and changes nothing.

Going the other way? See [Exporting](help:exporting).`,

  'import-layered': `A layered Photoshop (**.psd**) or OpenRaster (**.ora**) file opens with every layer on its own, so nothing is flattened. Krita, GIMP and MyPaint write .ora, and Krita and Procreate can export .psd. Frameling's own **Export Photoshop layers (PSD)** comes back in the same way.

**Open one:** choose **File > Open** and pick the file, drag it onto the window, or choose **File > Import > Layered file (Photoshop, OpenRaster)...** to add its layers to the drawing you have open.

**What comes across:**
- Every picture layer, as a pixel layer, with its name, order, opacity, blend mode and whether it is showing.
- Groups, as layer folders, with their own opacity and blend mode.
- Clipping (a layer that only shows where the one under it does), and layer masks, which are applied to the picture.
- Layers that hang over the edge of the picture are cut at the edge.

**What can't, and is said:** adjustment layers (levels, curves and the like), layer styles (shadows, glows, strokes), and blend modes Frameling doesn't have (they come in as normal). Text layers, smart objects and shape layers come in as pictures of what they show, so the words and shapes can't be edited. A message says **See what was left out** and names the layers.

Good to know:
- RGB and greyscale files, in 8 or 16 bits, are read. For CMYK, use Image > Mode > RGB Color in Photoshop first. Frameling tells you if that's the case.
- Krita's own **.kra** isn't read yet: in Krita, choose File > Export and save an .ora or .psd.
- The first time you add a file to a drawing that already has something on it, Frameling asks whether to add it or open it as a new drawing, then remembers. Change it any time in **Preferences > Behaviour**.
- A file that is damaged, or isn't what its name says, gives a plain message saying why and changes nothing.

For a pixel animation instead, see [Bringing in Aseprite files](help:aseprite-import).`,
};
