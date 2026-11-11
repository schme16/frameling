// Help for Quill's first-run hello and for units. Plain data, so the help tests can load it without the UI.
import { registerHelpTopics } from '../../core/registry';

registerHelpTopics([
  {
    id: 'first-run',
    title: "Quill's hello",
    section: 'Getting started',
    media: 'first-run.mp4',
    summary: 'The first time Frameling opens, Quill says hello and helps you set things up. Meet him again from Help.',
    keywords: ['onboarding', 'tour', 'intro', 'setup', 'first time', 'quill', 'start'],
    body: `The first time Frameling opens, Quill the hedgehog says hello. It takes about a minute.

## What happens

1. **Hello.** Quill tells you what Frameling does.
2. **What would you like to make?** Pick as many cards as you like. Quill uses them to pick a workspace, an example and some help for you.
3. **Colours.** Pick a theme for dark mode and one for light mode. You see each one straight away. (Quill's favourite is Strawberry. Pick your own anyway!)
4. **Settings.** Units, what the mouse wheel does, sounds, less motion, and whether Quill shows.
5. **Name it.** Give your first animation a name, or press **Roll** for a silly one.
6. **Start.** Learn with a short quest, open an example, or start on a blank page.

## Skipping

Press **Skip for now** on any step, or **Esc**. Anything you already picked is kept.

## Doing it again

Choose **Help > Meet Quill again**, or press **Ctrl+K** and type "Meet Quill". Everything can also be changed later in [Preferences](help:preferences).`,
  },
  {
    id: 'units',
    title: 'Units: pixels, mm, cm, inches',
    section: 'Getting started',
    summary: 'Show sizes in pixels, or in millimetres, centimetres, inches or points for print.',
    keywords: ['units', 'mm', 'cm', 'inches', 'in', 'pt', 'points', 'dpi', 'ppi', 'print', 'size', 'resolution'],
    body: `Drawings are measured in **pixels**. You can see sizes in other units instead, which helps when you're making something to print.

Pick the unit in **Preferences > General > Units** (or in Quill's hello). Pixels is the default.

## Where it shows

- The drawing size in the status bar.
- Width and height on the **Custom** card when you start a new drawing. You can type them in your unit.
- The size line in **Export**.

## DPI (dots per inch)

To turn pixels into inches Frameling needs to know how many pixels make an inch. That's the drawing's **DPI**. It is 96 unless you change it, because a drawing pixel is one screen pixel at 100% zoom, and 96 is the size an inch is on screens, on the web and in SVG files. Set a different DPI on the **Custom** card when the unit isn't pixels: for example 300 for sharp printing.

Exporting at 2x keeps the same printed size at double the DPI.`,
  },
]);
