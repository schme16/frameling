// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'first-run': `The first time Frameling opens, Quill the hedgehog says hello. It takes about a minute.

## What happens

1. **Hello.** Quill tells you what Frameling does.
2. **What would you like to make?** Pick as many cards as you like. Quill uses them to pick a workspace, an example and some help for you.
3. **Colours.** Pick a theme for dark mode and one for light mode. You see each one straight away. (Quill's favourite is Strawberry. Pick your own anyway!)
4. **A few settings.** Cosy or crisp, sounds, and whether Quill shows. Units, the mouse wheel and the rest wait in [Preferences](help:preferences) until you want them, and less motion follows your computer's own setting.
5. **All set.** Name your first animation (or press **Roll** for a silly one), then learn with a short quest, open an example, or start on a blank page.

## Tucking away what you didn't pick

Some parts of Frameling are for particular kinds of making: puppets and bones, lip sync, particles, tiles, a camera. On the last page, **Tuck away what you didn't pick** puts away the ones your picks don't need, so the menus and panels start small. It says which, and it's on unless you switch it off. Pick **Just playing**, or nothing, and nothing is put away.

**To get them back:** press **Bring them back** on the message that follows, or open **Preferences > Features** and press **Turn everything back on** (or switch one on). See [Turning parts on and off](help:features).

## Skipping

Press **Skip for now** on any step, or **Esc**. Anything you already picked is kept.

## Doing it again

Choose **Help > Meet Quill again**, or press **Ctrl+K** and type "Meet Quill". Everything can also be changed later in [Preferences](help:preferences).`,
  units: `Drawings are measured in **pixels**. You can see sizes in other units instead, which helps when you're making something to print.

Pick the unit in **Preferences > General > Units**. Pixels is the default.

## Where it shows

- The drawing size in the status bar.
- Width and height on the **Custom** card when you start a new drawing. You can type them in your unit.
- The size line in **Export**.

## DPI (dots per inch)

To turn pixels into inches Frameling needs to know how many pixels make an inch. That's the drawing's **DPI**. It is 96 unless you change it, because a drawing pixel is one screen pixel at 100% zoom, and 96 is the size an inch is on screens, on the web and in SVG files. Set a different DPI on the **Custom** card when the unit isn't pixels: for example 300 for sharp printing.

Exporting at 2x keeps the same printed size at double the DPI.`,
};
