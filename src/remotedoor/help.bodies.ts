// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'remote-door': `The **remote door** lets another program on this computer drive Frameling: a test that presses commands and checks the result, or a script in Python or the shell that puts a row of shapes on a page. It is a way in to what Scripts already do, not a second engine.

## Switch it on

1. Open **Preferences > Plugins** and find **Remote door** (or press **Ctrl+K** and type "remote door").
2. Turn on **Let another program drive Frameling**.
3. Press **Copy** beside the key, and give it to the program.

It is **off every time Frameling starts**, and while it is off **nothing is listening**: no port is open at all. Switching it off closes it again.

## While it is open

A teal **Remote door** pill sits at the top of the window, and glows each time a program does something. Press it to see **what was driven**, with the time, or to switch the door off. The list lives only while Frameling is open, and nothing leaves your computer.

## What a program sends

Every request carries the key: \`Authorization: Bearer <key>\`. The door answers only on **127.0.0.1**, this computer, and refuses anything that comes from a web page.

- \`GET /v1/commands\` lists what it may press.
- \`POST /v1/commands/edit.duplicate\` presses one command.
- \`POST /v1/run\` sends a list of presses and choices, as one step in Undo.
- \`POST /v1/script\` runs JavaScript in the same sandbox as the Scripts panel.
- \`GET /v1/state\` and \`GET /v1/document\` say where you are and what is in the drawing.

A worked example in Python is in \`docs/remote-door.md\`.

## When it says "not now"

A request that would change the drawing is **refused, never queued**, while you are part way through a stroke, while a dialog is open, or while a script is running. It is told why and to try again. Your pen is never interrupted, and nothing runs later against a drawing that has moved on.

## What it can't do

It reaches what a script reaches and nothing more. It can't open, save or export files, change settings, use accounts, press Undo, or touch the audience features. It can't turn off **Stream-safe**, read a covered word, or get round **Stop everything**: that closes this door too.

**Good to know:**

- A run is **one step in Undo**, and if it goes wrong your drawing is put back how it was.
- **Make a new one** next to the key changes it at once. Use it if the key was seen.
- It is not the actions door for stream tools: that one has its own key and switch. See [Scripts](help:scripts) for what a script can do.`,
};
