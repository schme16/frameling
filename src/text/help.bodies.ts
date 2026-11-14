// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pixel-text': `Pixel text is writing for pixel art: a real pixel font, every letter lined up on your pixel grid, in your Paint colour, with no smoothing. So it never goes blurry, and on a palette-locked layer it only ever uses your palette.

## Type something

1. Click a **pixel layer** in the timeline.
2. Pick the **Text** tool (**T**) and click where the words should start. The little bar is your caret.
3. Type. **Enter** starts a new line.
4. Press **Esc** (or **Ctrl+Enter**) to finish. The letters are painted into the layer as one undo step.

Until you finish, the words float and you can still fix them: use the arrow keys, select with the mouse or **Shift** and the arrows, and click inside the words to move the caret. Hold **Alt** and press the arrow keys to nudge them one pixel.

## Fonts and looks

The Text tool's options change what the next words look like.

- **Font**: **Classic** is 5 pixels wide and 7 tall with capitals and small letters. **Tiny** is 3 by 5, capitals only, for the smallest labels.
- **Size**: whole numbers only (1 to 8 times bigger), so each font pixel stays one square block. **Ctrl+Up** and **Ctrl+Down** change it while you type.
- **Bold**, **letter spacing** (tracking), **line spacing** (leading) and **line up** (left, middle, right of the pixel you clicked).

Colour is the Paint colour, and it can change while you type. Accented letters are drawn without their accent (é as e), and letters the font doesn't have show as a question mark.

## Good to know

- Once finished, the words are plain pixels. They can't be retyped, but you can undo, erase, select and move them like any pixels. To change them, undo and type again.
- Words that run off the edge of the picture are cut off at the edge.
- Mirror drawing is ignored for text, so it never comes out doubled.
- What a click away from the words does (just finish, or finish and start new words there) is in **Preferences > Behaviour**, under **Clicking away from pixel text**.

Text on a vector layer is different: it stays editable, see [Text](help:text). For colours and the palette lock, see [the palette](help:palette).`,
  text: `## Type something

1. Pick the **Text** tool (**T**) on a vector layer. (On a pixel layer it types crisp pixel letters instead: see [Pixel text](help:pixel-text).)
2. Click on the stage where the words should start, and type. **Enter** starts a new line.
3. Press **Esc** (or click somewhere else) when you're done.

To change the words later, **double-click** the text, or click it with the Text tool.

## Fonts and looks

Select the text and open the **Text** panel. Change the font, weight, size, colour, line up (left, middle or right), line spacing (leading) and letter spacing (tracking). The Text tool's options set what new text starts with.

**Nunito** and **Inter** come with Frameling, so they look the same on every computer and in every export. In the desktop app you can also pick fonts installed on your computer. A file that uses one shows it with a stand-in font on a computer that doesn't have it, so **convert it to shapes** before sending the file to someone else.

Text is a shape like any other: move it, stretch it, turn it and flip it with the **Select** tool.

## Convert to shapes

**Tools and layers > Tidy and convert shapes > Convert text to shapes** (Ctrl+Shift+O) turns the text into ordinary filled shapes (outlines). Now you can reshape the letters, merge them with drawings, or fill them with the paint bucket. They can't be typed into afterwards, so keep a copy if you might change the words.

Want the letters to move one by one? See [Text animations](help:text-animators).`,
  'text-animators': `Text animations move the pieces of a text one after another, so a title can type itself on, letters can drop in with a bounce, or a word can wave.

## Add one

1. Select the text.
2. In the **Text** panel, under **Animate the letters**, click **Fade**, **Slide**, **Grow**, **Spin**, **Typewriter** or **Wave**.
3. Press play.

| Animation | Also called | What happens |
|---|---|---|
| **Fade** | Opacity | Each piece fades in. |
| **Slide** | Position | Each piece slides into place from a little way off. |
| **Grow** | Scale | Each piece grows from small (try the Overshoot feel). |
| **Spin** | Rotation | Each piece turns into place. |
| **Typewriter** | Type on | Letters appear one at a time. |
| **Wave** | Wave | Pieces bob up and down, round and round. |

## Tune it

- **One at a time**: letters, words or lines.
- **Comes**: **In** settles into the plain text; **Out** changes away from it (for an exit).
- **Order**: first to last, last to first, from the middle, or shuffled.
- **Starts on frame**: counted from the text's key on the timeline.
- **Frames each** and **Frames between** (stagger): how long each piece takes, and how long until the next one starts.
- **Feel** (easing): the same choices as in-betweens, such as Overshoot and Bouncy.

Add more than one and they add together: a Fade and a Slide make letters drift in as they appear. The eye button turns one off for a moment.

Animations are worked out from the frame, so scrubbing and every export show exactly the same thing.`,
  'text-swap-fonts': `Opened a drawing and the words look wrong? The font it asks for may not be on this computer, so Frameling shows a stand-in. **Swap fonts** lists every font the drawing uses and lets you change them.

## Open it

**Edit > Swap fonts**, or press **Ctrl+K** and type "swap fonts".

## What you see

Each font is one row:

- Its name, and a red note when it is **not on this computer**.
- How many texts use it, and which boards and layers they are on, so you know what you are about to change.
- A **Swap to** list of the fonts you can use here, and a sample of your words in the font you pick.

At the top, **Only the missing fonts** leaves the fonts you have alone. **Every font** lets any row change. Below the list, **Or use one font for all of these** gives every row the same one.

## Swap

1. Pick a replacement on each row you want to change.
2. Check **Now** and **After** under the list.
3. Click **Swap fonts**.

All of it is one undo step: one **Ctrl+Z** puts every font back. Size, weight, colour and animations stay as they are.

Nunito and Inter come with Frameling, so they look the same on every computer. The fonts on this computer are only here for you; see [Text](help:text) for what that means when you share a file.`,
};
