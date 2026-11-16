// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  scripts: `A **script** is a few lines of JavaScript that do something in your drawing so you don't have to: turn the picked shapes red, put a marker every 12 frames, copy a shape along a trail. You don't need to know JavaScript to start. The examples are real scripts, so change a number and run it again.

## Write one and run it

1. Open **View > Panels > Scripts** (or press **Ctrl+Shift+J**).
2. Press **New**, or choose one under **Start from an example...**.
3. Press **Run** (or **Ctrl+Enter** in the box).

What happened shows under the box. If something went wrong you get the **line** it went wrong on, and the box jumps to it.

## Put it on a key

Every script you save is a **command**. Find it in the command palette (**Ctrl+K**), or under **Edit > Scripts**. In the panel, under **Use it anywhere**, press **Set a key** and press the keys you want. It can go in any menu you like too: see [Change the menus](help:change-the-menus).

## Safe to try

- A run is **one step in Undo**, however much it did.
- If a script goes wrong halfway, **your drawing is put back how it was**.
- If one never finishes, Frameling stops it after a few seconds. **Stop** ends it any time.
- A script has no internet and can't reach your files.

## What it can use

Everything is on the \`frameling\` object. **What you can use** in the panel lists it, and every command a script can press. Click a line and it goes into your script. See [What a script can and can't do](help:scripts-reach).

## Typed it, or found it?

A script you typed runs straight away. One you pasted, opened from a file or found inside a drawing stops and shows you what it does first. See [Scripts from somewhere else](help:scripts-safety).

**Good to know:**

- Scripts are kept with Frameling, so every drawing can use them. Under **More** you can keep one **inside the drawing** instead, so it travels with the file. The first time you make one, Frameling asks which you'd like.
- Outgrown the panel? **Make it a plugin** turns the same code into a plugin, nothing rewritten. See [Making a plugin](help:making-plugins).`,
  'scripts-reach': `A script works on the drawing that is open, and does what you'd do by hand, only faster.

## What it can do

- **Read** the drawing: what is picked, where you are, every layer, shape, marker and clip.
- **Change** it with \`frameling.document.edit\`: colours, layers, markers, clips, swatches, flips, pixels. All the changes in one call land together.
- **Press Frameling's own commands** with \`frameling.app.run('edit.duplicate')\`. That is how a script reaches nearly everything the app can do: layers, timeline, selecting, arranging, effects, tiles, rig and more.
- **Choose what a command acts on** with \`frameling.app.set\`: the frame, the layer, the picked shapes, the colours.
- **Say things**: \`console.log\` prints in the panel, and \`frameling.ui.notify\` shows a message.

Not sure what is there? **What you can use** in the panel lists every command, and you can search it.

## What it can't do

- **Open, save, import or export files.** A script could overwrite or send away your work.
- **Use the internet or read your files.**
- **Restart or update Frameling, or change its settings.**
- **Undo or Redo.** A run is one step already, and a run that goes wrong is taken back whole.
- **Go live, use your accounts or start a review.**
- **Press other scripts or plugin commands.**
- **Give a command a number or some text**, like "set the brush size to 30". Commands take no settings. Choose the frame, layer, shapes and colours with \`app.set\` first, or use an edit, which does take values.
- **Hold a pen.** A script has no pointer. A plugin can add its own tool.

**Good to know:** a command that needs something first (a picked shape, say) says so instead of doing nothing, and the script stops there with your drawing put back.`,
  'scripts-safety': `A script can change your drawing and press Frameling's commands. It can't reach the internet or your files, and everything it does is one step you can undo. Even so, a script that somebody else wrote deserves a look before it runs.

## Where the line is

- **You typed it.** It runs straight away.
- **You pasted it, dropped it in, or opened it from a file.** It's marked as from somewhere else. The first time you run it, Frameling stops and shows what it does: the commands it presses, and anything odd. You choose **Run it this time**, **I have read it, trust it** or **Cancel**. Paste more in later and it's marked again.
- **It came inside a drawing.** Scripts in a file somebody sent you are **off** until you turn them on, for that drawing. Frameling asks when you open it. You can read them in the panel first. If the file changes them, you're asked again.

There's no switch that lets pasted scripts run without a look. That's on purpose.

## Where a script is kept

By default, with Frameling: only you have it. Under **More** you can keep it **inside the drawing** instead, so it travels with the file. The first time you make a script, Frameling asks which you prefer, and remembers. Change it any time in **Preferences > Behaviour**.

## If a script won't stop

Press **Stop**. A script that goes quiet for a few seconds is stopped for you, and your drawing goes back how it was.

**Good to know:** the look-first sheet reads the words in a script. It can't know what a very clever script would do, so only trust one you've read, or that comes from someone you trust.`,
};
