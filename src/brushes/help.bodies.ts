// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'brush-presets': `A **saved brush** is the brush you like, kept under a name. Ink for outlines, a soft marker for shading, a thin pencil for sketching: one click to swap, instead of moving four sliders back and forth.

**Pick one:** choose the **Brush** tool (**B**). The **Brush** picker, under the preview, shows the brush you are using. Click it and your saved brushes drop down, each with a stroke across it. Click one and the size, smoothing, pressure and pointy ends all change at once. With lots of brushes, see **The brush picker**.

**Ready to use:** over sixty brushes come with Frameling, in eleven groups: **Pencils**, **Pens**, **Markers**, **Paint**, **Chalk and charcoal**, **Watercolour**, **Stamps and texture**, **Calligraphy**, **Bristles**, **Along the line** and **Edged**. They never change, so you can't spoil them, and they export as plain vector shapes.

**Soft edges:** airbrush, highlighter, soft brush and smudge are [pixel tools](help:soft-paint), since a vector line can't fade.

**Save your own:**
1. Set the brush how you like it.
2. Press **Save as...**, under **Size** (or **Ctrl+K** and type "save this brush").
3. Give it a name, and a group if you want one, and press **Enter**.

**Changed it afterwards?** A small dot on the brush's name says you've moved a slider since you picked it. Press **Update** to keep the change in that brush, or **Revert** to go back to how it was saved. Your brush in the options always shows what you are drawing with, whatever the saved one says.

**Rather it saved every change by itself?** Open **Preferences, Behaviour** and set **Changing a saved brush** to **Yes, save every change**.

**Rename, move or delete:** pick one of yours, then press **Rename** (you can change its group there too) or **Delete**. Delete has an **Undo** on the message that appears.

**From the keyboard:** **Alt+Down** moves to the next brush and **Alt+Up** to the one before, and **Alt+P** opens the picker. In the command palette, every brush has a command called **Brush: Ink** and so on, which also switches to the Brush tool for you.

**Share them:** open **Share your brushes**, under **Save as...**. **Save as a file** and **Copy as text** make something you can send a friend (or a plugin). **Add from a file...** and **Paste from text** add ones you were sent, under new names if yours clash. The starters aren't included, because everyone has them. Your saved brushes also go in the settings backup in **Preferences, General**.

**Good to know:**
- A saved brush holds the size, smoothing, pressure, pointy ends, end caps and the [tip](help:brush-tips) (chalk, stamps, a shape you made and so on). The colour, the mirror and your pen curves stay as they are.
- Saving under a name you already used replaces that brush.
- You can keep up to 1000 of your own, in groups if you like (type a group name when you save).
- Pixel brushes live in this picker too: see the [Pixel brush](help:pixel-brush).

help:brush-picker help:brush-tips help:tool-options help:remembered-settings help:pen-tablet help:brush-import`,
  'brush-picker': `The **brush picker** is the button under the preview, at the top of the Brush options. Click it and every brush you have drops down with a stroke across it, so you pick by what a brush *draws*, not only by its name. It works the same with forty brushes as with four hundred.

**Open it:** click the button, press **Alt+P**, or press **Ctrl+K** and type "brush picker". Pick a brush and it closes. **Esc** or a click away closes it without picking.

**What you see:** **Size** and **Smoothing** at the top, so you can nudge a brush while you look. Each row has a small picture of the brush's **real tip** (chalk shows its grain, watercolour its wash, a stamp its shapes) with the size under it, a long **stroke** and its **name**. The brush you are using is highlighted and its stroke follows the sliders. Strokes are drawn in a colour that stands out against the panel, in every theme. **Row size** at the bottom makes the rows taller or smaller.

**Search, groups and favourites** are always here, because Frameling comes with over sixty brushes.

- **Search.** Type a word and the list becomes the matches, each with its group. Every word has to match, in the name or the group. Typing always goes to the search box, so just start typing.
- **Groups.** **My brushes** is yours. Below it are the groups that come with Frameling, then a brush pack or your own groups. Press a group's name to open or fold it. Only open groups are drawn, which keeps a big library quick. A small dot says your brush is inside. The button beside the search box folds or opens every group.
- **Favourites and Recent.** Press the star on a row to keep a brush in Favourites at the top. Recent is the last few brushes you used.

**Make a group:** press **Save as...** and type a group name under the name. To move a brush of yours, pick it and press **Rename**. Leave the group empty and it goes in **My brushes**, which is where brushes saved before groups existed are.

**Two columns:** the button beside the search box switches between one wide column and two denser ones. Frameling remembers, and you can also set it in **Preferences, Behaviour**, under **How the brush picker lists brushes**.

**Bigger list:** drag the small corner at the bottom left of the panel. It stays that size next time.

**From the keyboard:**
- **Up** and **Down** move through the rows, **Page Up** and **Page Down** jump.
- **Enter** picks the highlighted brush (on a group's name, it opens or folds it). **Right** and **Left** open and fold a group.
- **Ctrl+D** stars or un-stars the highlighted brush. Or run **Add the brush to Favourites** from **Ctrl+K**.
- **Esc** closes it and puts you back on the button.

You can keep up to 1000 brushes of your own. Brushes from a friend or a brush pack keep their group when you add them.

help:brush-presets help:brush-tips help:tool-options`,
  'brush-tips': `A **tip** is what a brush line is made of. **Plain** is the smooth line you know. The others give your drawing a hand-made feel: dusty chalk, rough charcoal, a watercolour wash with a darker edge, or a shape repeated along the line. The chalk and charcoal tips catch on paper like the real thing, and stay lines you can reshape.

**Pick one:** choose the **Brush** tool (**B**). The **Tip** button, right under the Brush picker, shows the tip you use. Click it to see every tip as a real stroke: Plain, Chalk, Charcoal, Watercolour, each stamp shape, and four you [build yourself](help:brush-own). Click one and draw. **Alt+Shift+Down** and **Alt+Shift+Up** step through them.

**Chalk and Charcoal:** a line that catches on paper. **Catch on paper** picks the stick (vine or compressed charcoal, chalk, pastel, crayon, pencil) and **Grain size** how coarse the paper is. Press lightly for specks, firmly to fill in. The paper sits on the page, so two lines over each other meet the same bumps. Each line carries a **Paper tooth** [effect](help:effects) you can change afterwards. Off gives the older grain of tiny shapes.

**Watercolour:** a see-through wash that is darker and bolder at the edge, where paint gathers. **Edge** sets how strong that is. Go over it again for a deeper colour.

**Stamp:** repeats a shape along the line: a leaf, dash, dot, star, diamond, heart or paw print. **Spacing** is how far apart, **Size variety** and **Wander** make it look placed by hand, and **Turn** decides whether stamps follow the line, stay upright or spin. **Pointy start** and **Pointy end** shrink the stamps at the ends.

**A brush from your own drawing:**
1. Select what you drew (the **Select** tool, **V**). On a pixel layer, select some pixels instead.
2. Press **Brush from selection** in the brush options (or **Ctrl+Alt+B**).
3. Draw. On a drawing layer your shape is stamped along the line, in your colour. On a pixel layer you get a picture brush, up to 32 by 32 pixels.

A pixel brush with more than one colour asks once whether to keep its own colours or paint in yours (change it in **Preferences, Behaviour**). **Back to the usual brush** puts the square or round one back.

**Saved brushes remember the tip,** shape of your own included. See [saved brushes](help:brush-presets).

**When you export:** PNG, GIF, video, sprite sheets and Photoshop show the paper as drawn. PDF, Illustrator and Lottie make a picture of the layer. SVG writes tiny shapes instead, which look a little different and make the file bigger.

**Good to know:**
- Tips are for drawing layers. On a pixel layer the brush paints pixels.
- On a merge layer a line joins what it touches and comes out as plain shapes.
- A shape you made into a brush is a silhouette: it takes the colour you have picked.
- Tips can't be changed on a line once it is drawn. Undo, pick another tip, and draw it again.

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
  'brush-import': `Brushes made in **Photoshop** (**.abr**), **GIMP** (**.gbr**, **.gih**, **.vbr**) and **Krita** (**.kpp**, **.bundle**) come into your own brushes, so you can use the free packs people share. Frameling shows you what is in the file first, brush by brush, and says plainly what did not come across.

**Bring some in:**
1. **Tools > Saved brushes > Add brushes from a file...** (or search the command palette for **Add brushes**).
2. Pick the file. A window lists every brush in it with a little picture of its tip.
3. Untick any you don't want, name the group they go in, and press **Add**.

They land in your [brush picker](help:brush-picker) beside the ones that come ready, under the set's name, and they are kept with your other saved brushes.

**Which came in whole:** each brush says **Came in whole**, **Came in, slightly changed** or **Came in, without some settings**, and lists what was left out or changed underneath. **Only the whole ones** ticks just the brushes that lost nothing, handy for a big set.

**What comes across:**
- The tip: a round or square shape, or a picture. A picture tip is shrunk to fit 32 by 32 pixels, with its soft shading kept (so a charcoal or sponge tip still has its texture).
- Size, hardness, angle, roundness and spacing.
- Photoshop's pen controls (fade, tilt, direction, pen rotation) for size, flow and angle, and its jitter, scatter, minimum diameter, flow and opacity. Krita's pen controls, for size, opacity, flow and rotation, with the bend of each curve (a long curve is thinned to its nearest 8 points, and says so).
- A texture becomes one of the [papers](help:pixel-brush-texture), and a dual brush with a textured tip becomes a field of dots, both with a note saying so.

**What doesn't:** bristle and airbrush tips (they come as round), colour dynamics, wet edges, noise, build-up, brush groups, roundness jitter, count, a pipe of several pictures (GIMP and Krita pick between them as you paint; Frameling takes the first), stylus wheel, and, from Krita, smudging, airbrush mode, masking brushes, and every brush engine that isn't the pixel brush. Each one is named in the window when a brush had it.

**Good to know:**
- A Photoshop set or a Krita **.bundle** is one file with many brushes. A GIMP file or a Krita **.kpp** is one brush.
- A lone Krita **.kpp** that paints with a picture tip can't come in, because the picture isn't inside it. Make a bundle in Krita's **Manage Resources** window (it carries the pictures) and add that instead.
- A file that is damaged or isn't a brush file is refused with a reason, and nothing is added.
- Procreate, Clip Studio Paint and Affinity brushes can't be read yet.
- Open the brush in the [Pixel brush](help:pixel-brush) options afterwards to change anything, then **Save as...** to keep your version.

help:brush-presets help:brush-picker help:pixel-brush-dynamics`,
};
