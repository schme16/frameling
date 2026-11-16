# Scripts

A script is a few lines of JavaScript with a name, kept so it can be run again, put on a key and found in the command palette.
It is the front door onto the plugin engine, not a second engine: same sandbox, same checked messages, same watchdog, same
`frameling` object. Read [plugins.md](plugins.md) for those; this page is what is different.

The code is in `src/scripts/`: `model.ts` (pure rules), `state.ts` (what exists, where it is kept, one command each),
`runner.ts` (running one), `control.ts` (the look-first sheet, new scripts, scripts inside a drawing), `ScriptsPanel.tsx`
(the panel), `examples.ts`, `reference.ts` (what the panel lists), `choices.ts`, `help.ts`, `debug.ts`.

## One run

`startRun` (runner.ts) is a plugin in disguise. It wraps the script in a command of its own,

```js
frameling.commands.register({ id: 'run', label: 'Name' }, async () => {<the script, on the same line>
});
```

so `await` works at the top and a script's own line numbers are the file's. It starts a fresh sandbox (`startSandbox`, no
network), builds a `PluginRuntime` with a made-up manifest (`document.read`, `document.edit`, `app`; version 2) and presses
the command. Everything the script says goes through the runtime's checks, as a plugin's does.

- **One run is one Undo step.** `Store.startGroup()` before, then `endGroup(mark, 'Script: Name')` folds every step made since
  into one (forty edits, fifty commands, one Undo). Nothing the group does merges into the step before it.
- **A run that does not finish changes nothing.** An error, Stop, the watchdog: `abortGroup(mark)` undoes every step made since
  the mark, leaves no Redo behind, and keeps the Redo the person had. Only the drawing is put back; the frame, layer and
  selection a script chose stay.
- **Calls it did not wait for** (a forgotten `await`) are counted: the run is not over until the host has finished them, so they
  land in the same step. If one fails, the run fails.
- **One at a time.** A second run says the first is still going.
- **The line.** The prelude reads it from the error's stack (`frameling-plugin:<id>:LINE:COL`, the name the code is loaded under).
  A syntax error carries no line, so the prelude hands the same code to a throwaway worker, which stops at the mistake and says where.
- **Printing.** `console.log`, `info`, `warn` and `error` are forwarded to the panel (a hundred lines a second at most).
- **A script adds nothing.** Commands, exports and panels it registers are ignored.

## The watchdog

Scripts use the plugin watchdog (`watchdog.ts`) with a shorter leash: `WATCHDOG.scriptStuckMs` (5 s) without an answer to the
heartbeat, running or not (a plugin's command gets 60 s). `frameling.progress(done, total)` buys more time, as for a plugin. A
script stuck in `while (true) {}` is stopped, its sandbox taken away (which ends its worker), the drawing put back, and the app
goes on. **Stop** in the panel does the same at once: `runtime.stop()` closes the transport, which removes the frame.

## What a script can reach

The honest route to "everything the app can do" is the command registry. A script with the `app` power (every script has it)
can:

- `frameling.app.commands()`: every command it may press, with whether each can run now;
- `frameling.app.run(id)`: press one and wait; a command that cannot run right now says why (the same sentence the menus show);
- `frameling.app.set({ frame, layerId, selection, color, fillColor })`: choose what commands act on.

**Commands take no arguments.** The registry's `run()` has none: a command acts on the state (the selection, the layer, the
frame, the colours). So "set the brush size to 30" is not a command a script can press; what it can do is choose the frame,
layer, shapes and colours first and press the command, or use an `edit` op, which does take values.

### What is not reachable, and why

`NOT_FOR_SCRIPTS` in `src/plugins/appRules.ts` is the list, by id or prefix. A script may not press:

| Not reachable | Why |
|---|---|
| `file.*` (open, save, import, export) | Could overwrite or send away work; they open file pickers and dialogs. |
| `app.*`, `help.*`, `update.*`, `beta.*`, `settings.*`, `keys.*`, `features.*`, `quests.*`, `perf.*`, `view.preferences`, `view.commandPalette` | Restart, update, report, open the app's own windows or change how it behaves for everything, not this drawing. |
| `edit.undo`, `edit.redo`, `history.*` | A run is one step in Undo and is taken back whole if it fails. A script that undid steps would undo the person's own. |
| `pixel.new` | Starts a new drawing in the place of this one. |
| `audience.*`, `stream*`, `twitch.*`, `votes.*`, `guess.*`, `promptjar.*`, `dares.*`, `review.*`, `popout.*`, `capture.*`, `timelapse.*` | Go live, use accounts, send to other people, or open other windows. |
| `plugins.*`, `plugin.*`, `script.*`, `scripts.*` | A script that starts a script could never be stopped sensibly, and a plugin's commands were allowed by someone else's yes. |

Not reachable for other reasons: the pointer (a script cannot draw a stroke; a plugin can add a tool), the internet and files
(none in the sandbox), and anything that is a dialog the person must answer. The `edit` ops are the 12 in `ops.ts`; what they
do not cover (adding shapes, deleting layers, moving shapes) is reached by a command.

## Who may run what

| Where the script came from | What happens |
|---|---|
| You typed it in the panel | Runs straight away. |
| Pasted into the editor (`paste`, or `drop`, of a line or more), opened from a `.js` file, or moved out of a drawing into the app | Marked **from somewhere else** (`reviewed: false`). The first run stops on a sheet that names what it presses and anything odd; **Run it this time**, **I have read it, trust it**, or **Cancel**. Trusting clears the mark; pasting more in sets it again. |
| Inside a drawing you opened | Off. Listed in the panel, no command made, nothing runs, until the person says so for that drawing. |

There is deliberately **no preference that lets pasted scripts run without the look**. The sandbox (no network, no files, checked
messages, undo, watchdog) is what makes a wrong answer survivable; the sheet is the pause before it. The sheet reads the words in
the script (`lookAt` in model.ts); it cannot know what a very clever script would do, and says so in the help.

### Where a script lives

Two reasonable answers, so asked once and remembered (`scripts.home`, Preferences > Behaviour): **with Frameling** (the default; in
`localStorage` as `frameling.scripts.v1`; every drawing can use it) or **inside the drawing** (`doc.ext.scripts`, `{ v: 1, items:
[{ id, name, code, updated }] }`; it goes wherever the file goes). `ext` is the existing room for a feature's own data: older
Frameling versions keep it untouched, and a drawing with no scripts has no `ext.scripts`. Writing it is `updateQuiet`, so it is
not an Undo step.

A script that comes inside a drawing runs when somebody else opens that file, so it has its own answer (`scripts.inFiles`,
`mustAsk`: always a sheet that stops): **Leave them off** (this time), **Turn them on for this drawing** (this time), **Leave them
off, and don't ask again** (the only answer that is remembered). "Yes" is remembered by the drawing's id and a fingerprint of exactly
these scripts (`frameling.scripts.drawings.v1`), so reopening the same file is not a question again and a file whose scripts were
changed is. A file's `reviewed` mark is never believed.

## Becoming a plugin

**Make it a plugin** (panel > More) builds a package from `scriptAsPlugin` and hands it to `installFrom`, which asks about its
powers like any plugin. The `main.js` is the same wrapped code, so nothing is rewritten; the manifest asks for `document.read`,
`document.edit` and `app` (version 2). Everything a script uses is on the `frameling` object a plugin has. What a plugin adds: a
manifest, its own id, panels, tools, exports, events, optionally the internet.

## Tests

`test/scripts/` (see testing.md) and `scripts/e2e/scripts.cjs` in the real app.
