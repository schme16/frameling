# The remote door

A local door another program can knock on to drive Frameling, for testing and automation. **Off until the person switches it
on**, behind a key, on this computer only. It is a way in to what the Scripts panel already reaches, not a second engine.

Code: `src/remotedoor/` (the page's side), `src/main/remoteDoor.ts` (the server) and `src/main/remoteHandler.ts` (the rules for
a request, pure), `src/shared/remoteDoor.ts` (what both sides pass each other). It is built on the pattern of the actions door
(`src/streamdoor`, `src/main/actionsDoor.ts`), and shares its checks (`sameKey`, `hostOk`, `fromAWebPage`), but it is **not** that
door: its own switch, its own key (`frd_...`, never the actions door's `fld_...`), its own port (47231), its own file names.

## What is guaranteed

1. **Off by default, nothing listening.** The server object is not even made until the page asks for it to open, and the page asks
   only when the person presses the switch (Preferences > Plugins > Remote door, or the command **Remote door**). No port is open
   before that, not one that refuses. It is **not remembered**: every start of Frameling begins with it off. A reload of the page,
   quitting, closing the window and **Stop everything** all close it.
2. **A key**, in Preferences beside the switch (hidden until **Show**, hidden again after 15 s, never shown while Stream-safe is on,
   still copyable), carried by every request as `Authorization: Bearer <key>` (or `X-Frameling-Key`). **Make a new one** changes it
   at once. It is kept in `remote-door-key.txt` in the app's data folder, readable by this user only. The address file
   `remote-door.json` (written while it is open) never holds the key.
3. **Loopback only.** Bound to `127.0.0.1`, not `localhost`, not `0.0.0.0`. A request with an `Origin` header (a web page) is refused
   before the key is looked at, and the `Host` has to name `127.0.0.1` and the port. **Reaching it from another machine is a second
   switch with its own warning, and it is not built.** There is no such option.
4. **Visible.** While it is open a teal **Remote door** pill sits in the title bar, and glows each time a program does something.
   It opens a card: the address, **what was driven**, and **Switch off**.
5. **A log in the app.** Each change a program made or was refused, with the time. Kept in memory only while Frameling is open,
   never written to a file, never sent anywhere. It holds what a request did in plain words and never the text of a script or
   anything else a caller sent. Looking (reading the state, the list, the drawing summary) is not logged.

## What it can reach

| Request | What it does |
|---|---|
| `GET /v1` | Says hello, what it reaches, and whether something is in the way. |
| `GET /v1/state` | The frame, layer, selection, size in frames, whether the drawing has unsaved changes, how many Undo steps there are. |
| `GET /v1/document` | A summary of the open drawing: size, frame rate, length, layers with their kind and how many shapes. No pictures, no name, no file path. |
| `GET /v1/commands` | Every command it may press, and whether each can run right now. |
| `POST /v1/commands/<id>` | Presses one command. |
| `POST /v1/run` | `{ "steps": [ { "command": "edit.duplicate" }, { "set": { "frame": 3 } } ], "label": "..." }`: presses and choices, together **one step in Undo**. Up to 200 steps. |
| `POST /v1/script` | `{ "code": "...", "name": "..." }`: JavaScript in the same sandbox as the Scripts panel (`frameling.document`, `frameling.app`, `console.log`). It can read the whole drawing and change it. Its printed lines come back. |

The honest answer to "everything the app can do" is **the command registry, less the commands a script may not press** (`NOT_FOR_SCRIPTS`
in `src/plugins/appRules.ts`, the one list both use), plus what the Scripts sandbox exposes.

## What it can NOT reach

- **Files and exports**: no open, save, import, export, recover. A drawing arrives through the person, or not at all.
- **Settings and the app itself**: Preferences, shortcut sets, features, updates, restarts, reports.
- **Accounts and shows**: Twitch, live review, going live, OBS, the capture view, the stream board and overlay.
- **The audience features, entirely** (`audience.*`, votes, dares, the prompt jar, guesses). A remote caller is not a viewer.
- **Stream-safe**: `view.streamSafe` is off the list, for the door and for scripts. A program cannot turn it off.
- **Stop everything**: it can't press it, and pressing it (or the red pill, or its key) closes this door too.
- **Undo and Redo**: a run is one step, and is taken back whole if it fails. A program that undid steps would undo the person's own.
- **Plugins and other scripts**, and **the remote door's own switch, key and log** (`remote.*`).
- **The internet and the person's files**: scripts run with no network and no file access.
- **A pen.** There is no way to draw a stroke with a pointer. It presses commands and edits through the script ops; it has no
  "add a shape" op yet, so a program cannot make shapes from nothing.
- **A command that takes a number or a word** ("set the size to 30"). Commands take no settings; use `set` for the frame, layer,
  selection and colours, or an op in a script.

## Decisions

**A request that arrives at a bad moment is refused, never queued.** While a pointer button is down on the page (someone mid-stroke
or mid-drag), while a dialog, Preferences, Help or the palette is open, while a script is running, or while another request is
part way, anything that changes the drawing gets `409` with `reason: "busy"`, `detail` (`stroke`, `dialog`, `script`,
`another-request`), a plain `message` and `retryInMs`. Why: the caller knows what it was waiting for, a queue would run it later
against a drawing that has moved on, and a person's pen must never be interrupted. Reading is always answered. The pointer is
watched only while the door is open, and an "up" missed by the page cannot lock it shut (a move with no button down clears it).

**A driven run is one step in Undo, the same rule as a script.** `POST /v1/run` and `POST /v1/commands/<id>` fold every change
they make into one step named `Remote: <label>` (`store().startGroup/endGroup`). If any step fails, or the door is switched off
part way, everything the run did is taken back (`abortGroup`), with no Redo left over, and the caller is told how much was undone.
Every step is checked **before** the first is pressed, so one bad last step cannot leave the first ones done. A script is one step
the same way (the runner's own grouping). The group starts a new step: it never merges into the person's last one.

**A script from the door runs straight away.** The Scripts panel stops and shows a script that came from outside; the door does not,
because the person holding the key already said yes to this program by switching the door on, and a dialog would block the caller.
The sandbox is the same one, with no internet and no files, and a script is stopped after five seconds of silence. A running remote
script is the one **Stop the running script** ends.

**One request at a time.** A second change while one is running is refused, as above.

## The stream safety work

A remote caller is not a viewer. It never goes through the audience gate, so it inherits none of the gate's allowances ("Let the
audience interrupt your drawing" has no bearing on it), and none of the gate's refusals are lifted for it either. It cannot press
the commands that would loosen a safeguard (Stream-safe, the audience switches, the spoiler cover's question, Stop everything). The
key is hidden while Stream-safe is on. `test/remotedoor/safety.test.ts` and `scripts/e2e/remote-door.cjs` check the lot.

## A worked example

`docs/examples/remote-door.py` (standard library only) says hello, presses **Select all** and **Duplicate** as one run, runs a
script that paints the picked shapes green, and reads the drawing back:

```bash
# Preferences > Plugins > Remote door: switch on, press Copy beside the key.
FRAMELING_KEY=frd_... python3 docs/examples/remote-door.py
```

Or with curl:

```bash
curl -H "Authorization: Bearer $FRAMELING_KEY" http://127.0.0.1:47231/v1/state
curl -H "Authorization: Bearer $FRAMELING_KEY" -d '{"steps":[{"command":"select.all"},{"command":"edit.duplicate"}]}' http://127.0.0.1:47231/v1/run
```

## Testing

`test/remotedoor/` (the handler, the real server on a real port, the page's rules, undo grouping on the real store, the link, the
key on the settings screen, Stop everything), `scripts/e2e/remote-door.cjs` (the whole thing in the real app) and
`scripts/e2e/scripts-door.cjs` (the Scripts run checks, converted to drive the app through the door). See [testing.md](testing.md).

**A bug it found in the door's own wiring**: a script's sandbox is a frame inside the page, and `did-start-loading` fires for it,
so closing the door on that event shut it in the face of the first script it ran. The remote door closes on a main frame
navigation only (`did-start-navigation`, `isMainFrame`). The actions door still uses `did-start-loading`; it runs no sandbox, so it
has not met this.
