// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'brush-parts': `A **brush** is a bundle of settings you pick in one click: a **tip** (what the line is made of), for chalk and charcoal a **stick** (what you draw with), and the size, smoothing and pointy ends. **Paper** is the sheet's, unless the brush keeps its own.

**The four, in one line each:**
- **Brush:** the whole bundle, like Sketch pencil or Ink. Picking one replaces the tip, the stick and the rest.
- **Tip:** smooth, a pen nib, bristles, chalk, charcoal, watercolour or stamps. Picking one gives the brush that tip with its usual settings.
- **Stick:** only for the **Chalk** and **Charcoal** tips, and only while **Catch on paper** is on. It decides how the line catches on the paper.
- **Paper:** the sheet's grain, from **Smooth** to **Rough**. Every tool that catches on paper uses the same one, unless a brush keeps its own.

**Parts of this brush:** under the **Brush** picker, **Tip** and **Stick** each say **as it comes** or **changed**, and so does **Paper** for a brush that keeps its own. **Changed** has its own small arrow that puts that one part back, and **Back to how it came** puts all of it back. The palette (**Ctrl+K**) has the same. The **Pixel brush** has a **Tip** and **Chalk and charcoal** a **Stick** in the same box.

**A brush follows you from layer to layer.** Pick Ink on a vector layer, move to a pixel layer and the same brush is picked, drawn as pixels. Each kind of layer keeps its own changes: change the size on a vector layer, hop to a pixel layer and back, and it is still changed, still with its **Back to how it came**. What the other kind can't draw is said under the picker, greyed, and kept.

**Why two parts change at once:** picking a **Chalk** tip also gives the brush the **Chalk** stick, so both say **changed**. Pick the stick you want afterwards and only the tip stays marked.

**See what changed:** the preview shows a tag with what changed, like **Tip: Chalk**, and the row you used lights up for a moment.

**Good to know:**
- The marks survive closing Frameling, as long as the brush was a saved one.
- Size is part of the brush, so moving it also shows **Back to how it came**.

Next: [Saved brushes](help:brush-presets), [Brush tips](help:brush-tips), [Paper](help:paper).`,

  'brush-presets': `A **saved brush** is the brush you like, kept under a name. Ink for outlines, a soft marker for shading, a thin pencil for sketching: one click to swap, instead of moving four sliders back and forth.

**Pick one:** choose the **Brush** tool (**B**). The **Brush** picker, under the preview, drops down every brush with a stroke across it. Click one and the size, smoothing, pressure and pointy ends all change at once. A hundred come with Frameling, and they never change, so you can't spoil them.

**One brush, on every layer:** the brush you pick stays picked when you go from a pixel layer to a vector layer and back. It draws vectors on one and pixels on the other, and the picker lists the same brushes on both. A brush made for one kind is drawn as close as the other can, and a line under the picker says what is kept but not drawn ("Dual tip is kept, but vectors don't draw it"), with those controls greyed. Go back and the brush is exactly as it was. When a swap would look very different, Frameling asks once and remembers.

**Save your own:**
1. Set the brush how you like it.
2. Press **Save as...**, under **Size** (or **Ctrl+K** and type "save this brush").
3. Give it a name, and a group if you want one, and press **Enter**.

It is kept as the kind of brush you were on, and the other kind is worked out from it. Pick one of yours to **Rename** it or **Delete** it (there is an **Undo**).

**Changed it afterwards?** The **Tip** and **Stick** under **Parts of this brush** say **changed**. Press **Back to how it came** to go back, or **Update** to keep the change. See [A brush, its tip, its stick and its paper](help:brush-parts). To keep every change by itself, set **Changing a saved brush** in **Preferences, Behaviour**.

**Share them:** **Share your brushes**, under **Save as...**, saves a file or copies text to send a friend, and adds ones you were sent.

**Good to know:**
- A saved brush holds the size, smoothing, pressure, pointy ends and the [tip](help:brush-tips). The colour, the mirror and your pen curves stay as they are.
- **Show what this layer cannot draw of the brush**, in **Ctrl+K**, opens the greyed controls. **Alt+Down** and **Alt+Up** step through the brushes.

help:brush-picker help:brush-tips help:tool-options help:remembered-settings help:pen-tablet help:brush-import`,
  'brush-picker': `The **brush picker** is the button under the preview, at the top of the Brush options. Click it and every brush drops down with a stroke across it, so you pick by what a brush *draws*, not only by its name. It works the same with forty brushes as with four hundred.

**The same list on every layer:** a pixel layer and a vector layer show the same brushes, each stroke drawn the way that kind of layer draws it. A brush made for the other kind is still there, drawn as close as this kind can (hover a row to see which). Pairs show once. See [Saved brushes](help:brush-presets).

**Open it:** click the button, press **Alt+P**, or press **Ctrl+K** and type "brush picker". Pick a brush and it closes. **Esc** or a click away closes it without picking.

**What you see:** **Size** and **Smoothing** at the top, so you can nudge a brush while you look. Each row has the brush's **real tip** with its size under it, a long **stroke** and its **name**. The brush you are using is highlighted and follows the sliders. **Row size** at the bottom makes the rows taller or smaller.

**Find one:**
- **Search.** Type a word and the list becomes the matches, each with its group. Every word has to match, in the name or the group.
- **Groups.** **My brushes** is yours, then the groups that come with Frameling, then a brush pack or your own. Press a group's name to open or fold it. The button beside the search box folds or opens them all.
- **Favourites and Recent.** Press the star on a row to keep a brush in Favourites at the top. Recent is the last few you used.

**Make a group:** press **Save as...** and type a group name under the name. To move a brush of yours, pick it and press **Rename**. Leave the group empty and it goes in **My brushes**.

**Two columns:** the button beside the search box switches between one wide column and two denser ones. Drag the small corner at the bottom left to make the list bigger.

**From the keyboard:** **Up** and **Down** move through the rows, **Enter** picks (on a group's name, it opens or folds it), **Ctrl+D** stars a brush and **Esc** closes the list.

help:brush-presets help:brush-tips help:tool-options`,
  'brush-tips': `A **tip** is what a brush line is made of. **Plain** is the smooth line you know. The others give your drawing a hand-made feel: dusty chalk, rough charcoal, a watercolour wash with a darker edge, or a shape repeated along the line. Chalk and charcoal catch on paper like the real thing, and stay lines you can reshape.

**Pick one:** choose the **Brush** tool (**B**). The **Tip** button, under the Brush picker, shows every tip as a plain stroke on its own, including four you [build yourself](help:brush-own). Click one and draw. **Alt+Shift+Down** and **Alt+Shift+Up** step through them.

**Chalk and Charcoal:** a line that catches on paper. The **Stick** picker, under **Tip**, picks vine or compressed charcoal, chalk, pastel, crayon or a pencil. **Catch on paper** switches the paper on and **Grain size** sets how coarse it is. Press lightly for specks, firmly to fill in. Picking one of these tips gives the brush its usual stick, so both say **changed**: see [A brush, its tip, its stick and its paper](help:brush-parts).

**Watercolour:** a see-through wash that is darker and bolder at the edge, where paint gathers. **Edge** sets how strong that is.

**Stamp:** repeats a shape along the line, like a leaf, star or paw print. **Spacing** is how far apart, **Size variety** and **Wander** make it look placed by hand, and **Turn** decides whether stamps follow the line, stay upright or spin.

**Matte finish:** any tip. Dries paler and chalkier, with a faint velvety grain, like gouache, and still covers what is under it.

**A brush from your own drawing:**
1. Select what you drew (the **Select** tool, **V**). On a pixel layer, select some pixels instead.
2. Press **Brush from selection** (**Ctrl+Alt+B**).
3. Draw. On a drawing layer your shape is stamped along the line, in your colour. On a pixel layer you get a picture brush, up to 32 by 32 pixels.

A pixel brush with more than one colour asks once whether to keep its own colours or paint in yours (change it in **Preferences, Behaviour**). **Back to the usual brush** puts a one pixel square back.

**Saved brushes remember the tip,** shape of your own included. See [saved brushes](help:brush-presets).

**When you export:** PNG, GIF, video, sprite sheets and Photoshop show the paper as drawn. PDF, Illustrator and Lottie make a picture of the layer. SVG writes tiny shapes instead, which look a little different and make the file bigger.

**Good to know:**
- Tips are for drawing layers. On a pixel layer the Brush uses the [Pixel brush](help:pixel-brush)'s.
- On a merge layer a line joins what it touches and comes out as plain shapes.
- A shape you made into a brush is a silhouette: it takes the colour you have picked.
- Tips can't be changed on a line once it is drawn: undo, pick another, draw it again.

help:brush-presets help:brush-own help:tool-brush help:exporting`,
  'brush-own': `**Brushes you build yourself.** Pick a tip, or turn a drawing of your own into a brush, and a line becomes a calligraphy stroke, a ribbon, a chain or a dry paintbrush. Every one comes out as plain shapes, so it stays sharp at any size and exports anywhere.

**Pen nib** (calligraphy): an oval or flat pen point, thick one way and thin the other. **Roundness** makes it a blade or a round pen, **Angle** tilts it, and **Angle stays** says whether it keeps that angle on the page or turns with the line.

**Bristles:** lots of thin lines side by side. **Bristles** is how many, **Stiffness** whether they stay in line or wander, and **Dry gaps** how often one runs out of paint. **Bristle thickness** fattens them into solid paint (or thins them to clear tines, like a rake), and **Light and dark streaks** runs some lighter and some darker than your colour. Together they make **Oil paint**.

**Along the line:** your own drawing, bent down the whole line. **Ribbon**, **Thread** and **Leafy vine** are ready made in the brush picker to try.
1. Draw it and select it (the **Select** tool, **V**).
2. Choose **Make a brush that goes along the line, from the selection** in the palette (**Ctrl+Alt+Shift+B**), or **Use the selection as the drawing** in the brush options.
3. Draw. On a long line it can **Stretch** (a ribbon, a flame) or **Repeat** (beads, a border). Frameling asks once and remembers.

**Edged:** separate drawings for the **Sides**, the **Start**, the **End**, and the **Inside** and **Outside corner**. Make the sides first: select that part and choose **Edged brush: sides from the selection**. Then select each other part and use its button in the brush options. A corner drawing shows up where your line turns about a right angle, and the outside one is used when the line turns away from the top of your drawing. Leave a part out and the sides are used there. **Chain** and **Battlements** are ready made in the brush picker.

**Turn it into plain shapes:** a line keeps its brush. **Turn brush lines into plain shapes** fixes the selected lines as ordinary shapes you can edit point by point.

**Good to know:**
- Each line keeps its own copy of the brush, so a drawing opens fine on a computer that never had your brush. Save it with **Save as** to keep it in your own list.
- A drawing you made into a brush is a silhouette: it takes the colour you have picked.
- Each part of an edged brush is scaled so its height matches the line's width, so draw them the same height.
- Brush packs made for Illustrator can't be read yet. If you have the artwork as an SVG, import it, select it and make a brush from it.
- A line drawn with a brush can't be changed afterwards. Undo, change the brush and draw it again.

help:brush-tips help:brush-presets help:brush-picker help:exporting`,
  'brush-import': `Brushes made in **Photoshop** (**.abr**), **GIMP** (**.gbr**, **.gih**, **.vbr**), **Krita** (**.kpp**, **.bundle**) and **Procreate** (**.brush**, **.brushset**) come into your own brushes, so you can use the free packs people share. Frameling shows you what is in the file first, and says what did not come across.

**Bring some in:**
1. **Tools > Saved brushes > Add brushes from a file...** (or search the palette for **Add brushes**).
2. Pick the file. A window lists every brush in it with a little picture of its tip.
3. Untick any you don't want, name the group they go in, and press **Add**.

They land in your [brush picker](help:brush-picker) under the set's name.

**On every layer:** the picker lists the same brushes on a vector layer. There an imported brush is drawn as a vector brush, as close as vectors can (a picture tip becomes a stamp), and what vectors can't draw, like a dual tip or wet paint, is said in one line under the picker, greyed and kept. Go back to a pixel layer and nothing was lost.

**Which came in whole:** each brush says **Came in whole**, **Came in, slightly changed** or **Came in, without some settings**, and lists what changed. **Only the whole ones** ticks just those that lost nothing.

**What comes across:** the tip (a round or square shape, or a picture shrunk to fit 32 by 32 with its soft shading kept), size, hardness, angle, roundness, spacing, scatter, jitter, and pen controls (tilt, speed, direction, twist) for size, flow, opacity and angle. A texture becomes one of the [papers](help:pixel-brush-texture).

**What doesn't:** bristle and airbrush tips (they come as round), colour dynamics, wet edges, noise, build-up, brush groups, and from Krita smudging and every engine that isn't the pixel brush. From Procreate: glaze, blend modes, and its own tips and papers, which aren't in the file, so the tip comes as a plain round one. Each is named in the window.

**Good to know:**
- A Photoshop set, a Krita **.bundle** or a Procreate **.brushset** is one file with many brushes. A GIMP file, a Krita **.kpp** or a Procreate **.brush** is one brush.
- A lone Krita **.kpp** with a picture tip can't come in, because the picture isn't inside it. Make a bundle in Krita's **Manage Resources** window instead.
- A damaged file, or one that isn't a brush file, is refused with a reason.

help:brush-presets help:brush-picker help:pixel-brush-dynamics`,
};
