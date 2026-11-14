// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'brush-presets': `A **saved brush** is the brush you like, kept under a name. Ink for outlines, a soft marker for shading, a thin pencil for sketching: one click to swap, instead of moving four sliders back and forth.

**Pick one:** choose the **Brush** tool (**B**). The **brush picker** at the top of its options shows the brush you are using. Click it and your saved brushes drop down, each with a stroke across it. Click one and the size, smoothing, pressure and pointy ends all change at once. With lots of brushes, see **The brush picker**.

**Ready to use:** **Ink**, **Marker**, **Pencil** and **Tapered brush** come with Frameling. They never change, so you can't spoil them.

**Save your own:**
1. Set the brush how you like it.
2. Press **Save as...** (or **Ctrl+K** and type "save this brush").
3. Give it a name, and a group if you want one, and press **Enter**.

**Changed it afterwards?** A small dot on the brush's name says you've moved a slider since you picked it. Press **Update** to keep the change in that brush, or **Revert** to go back to how it was saved. Your brush in the options always shows what you are drawing with, whatever the saved one says.

**Rather it saved every change by itself?** Open **Preferences, Behaviour** and set **Changing a saved brush** to **Yes, save every change**.

**Rename, move or delete:** pick one of yours, then press **Rename** (you can change its group there too) or **Delete**. Delete has an **Undo** on the message that appears.

**From the keyboard:** **Alt+Down** moves to the next brush and **Alt+Up** to the one before, and **Alt+P** opens the picker. In the command palette, every brush has a command called **Brush: Ink** and so on, which also switches to the Brush tool for you.

**Share them:** open **Share your brushes** under the row. **Save as a file** and **Copy as text** make something you can send a friend (or a plugin). **Add from a file...** and **Paste from text** add ones you were sent, under new names if yours clash. The starters aren't included, because everyone has them. Your saved brushes also go in the settings backup in **Preferences, General**.

**Good to know:**
- A saved brush holds the size, smoothing, pressure, pointy ends and end caps. The colour, the mirror and your pen curves stay as they are.
- Saving under a name you already used replaces that brush.
- You can keep up to 1000 of your own, in groups if you like (type a group name when you save).
- Pixel layers use the pixel brush, which has its own size and shape.

help:brush-picker help:tool-options help:remembered-settings help:pen-tablet`,
  'brush-picker': `The **brush picker** is the button at the top of the Brush options. Click it and every brush you have drops down with a stroke across it, so you pick by what a brush *draws*, not only by its name. It works the same with four brushes as with four hundred.

**Open it:** click the button, press **Alt+P**, or press **Ctrl+K** and type "brush picker". Pick a brush and it closes. **Esc** or a click away closes it without picking.

**What you see:** **Size** and **Smoothing** at the top, so you can nudge a brush while you look. Each row has the brush's **tip and size**, a long **stroke** and its **name**. The brush you are using is highlighted and its stroke follows the sliders. **Row size** at the bottom makes the rows taller or smaller.

**Eight brushes or fewer?** Then it is just the rows. With more, three things appear:

- **Search.** Type a word and the list becomes the matches, each with its group. Every word has to match, in the name or the group. Typing always goes to the search box, so just start typing.
- **Groups.** **My brushes** is yours, **Starters** come with Frameling, and a brush pack or your own groups sit below. Press a group's name to open or fold it. Only open groups are drawn, which keeps a big library quick. A small dot says your brush is inside. The button beside the search box folds or opens every group.
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

help:brush-presets help:tool-options`,
};
