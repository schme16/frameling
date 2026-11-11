<!-- The brief given to every build agent. Paste or point to it when starting one. -->
# Frameling: shared brief for build agents

Frameling is a desktop 2D animation app (Electron 45, React 19, TypeScript, Vite 8, immer store) at
/mnt/109313D2109313D2/projects/frameling, branch `development`. The product scope and phase plan are on the board's Docs tab
(`pb doc evaluation`). README.md has commands; docs/ has the architecture, format and testing notes.

## Priorities (the user's words)
"Performance is a priority, but the highest priority is ease of use and how delightful it is to use." Plain words in
the UI, with the industry term second. Every feature: a command (with keys where sensible) in the command palette,
a menu entry where it fits, and a help topic (registerHelp) written super user friendly, clear and to the point,
with a screenshot or short H.264 clip in public/help/ (see how existing topics set `media`). Where a new behaviour
has two reasonable answers, use the "ask the first time, then remember" choices system (src/core/choices.ts,
`registerChoice`/`withChoice`) or a preference, rather than guessing silently.

## Where things are
src/core (format.ts doc types, doc.ts, store.ts undo via immer patches with coalesce keys, registry.ts commands/help/
panels/tools, render.ts the single renderer, choices.ts), src/tools (tool modules, edit.ts editActiveDrawing),
src/canvas, src/timeline, src/export (ExportDialog, plan, sheet, svg, gif, apng...), src/io (file format read/write),
src/templates, src/quests (gamified tutorials), src/ui (dock, palette, prefs, help, themes, mascot), test/ (vitest),
scripts/shoot.cjs (screenshots: off-screen window, `?debug` exposes window.__frameling), scripts/e2e/export.cjs
(export checks incl. real Godot: GODOT_BIN=/mnt/109313D2109313D2/godot-editors/editors/godot.linuxbsd.editor.x86_64).

## Working rules
- Work in your OWN git worktree so parallel agents don't collide:
  `cd /mnt/109313D2109313D2/projects/frameling && git worktree add ../frameling-wt/<name> -b wip/<name> development`
  then `cd ../frameling-wt/<name> && ln -s ../../frameling/node_modules node_modules`. Do all work there. Never commit
  the node_modules link, and never run `npm install` in the main checkout (tell the coordinator about new packages).
- Commit to your `wip/<name>` branch in the worktree as you reach working milestones (plain messages, NO
  Co-Authored-By or any Claude attribution lines, don't change git user config). Never push, never touch
  `development` or the main checkout, never run gh auth.
- Before your final commit: `npx tsc --noEmit` clean, `npm test` all passing (it includes the help audit and the shortcut-clash test), `npm run build` works.
  Add tests for your logic (pure functions where possible).
- Format changes: keep files backward compatible (old documents still open); bump nothing destructive. If you add
  doc fields, make them optional with defaults, and update the format read/validate code and its tests.
- Keep shared files (format.ts, menus.ts, commands registries, help topic lists) edits small and additive, since
  other agents are editing them in parallel and the parent will merge.
- Visual decisions: the user approves via A/B side-by-side looks. Where a UI/look choice is genuinely open, build the
  recommended option as the default, and also render an A/B comparison PNG (and an H.264 mp4 if motion matters) into
  brand/ab/<topic>/ with a one-line note of what A and B are. Don't block on it.
- Run every screenshot, recording, Electron check and test inside xvfb, never on the user's desktop:
  `xvfb-run -a -s "-screen 0 1600x1000x24" <command>` (add `SHOT_SHOW=1` for scripts/shoot.cjs and scripts/docs/record.cjs).
  If a harness fails under xvfb, fix the harness rather than using the live display.
- Videos must be H.264 (libx264, yuv420p, even dimensions); the user can't play AV1.
- No em dashes in user-facing text. TS comments plain and short.
- Final report (short): branch name, commits, what works, tests count, A/B files, anything not done or risky.
