# Frameling handover

Written 2026-11-12, at the end of the first build session (2026-11-11 to 12). Read this first, then
`docs/README.md` for the rest of the docs.

## Where things stand

Frameling is a desktop 2D drawing and animation app (Electron, React, TypeScript, Vite) with a web build. It's the
user's personal project, in the public repo https://github.com/schme16/frameling, checked out at
`/mnt/109313D2109313D2/projects/frameling`. All six phases of the original plan are built and merged:

| Phase | What's in |
|---|---|
| 0, 1 | Shell (dock, command palette, help, keymaps, preferences, themes), vector drawing with gap-closing fill, frame-by-frame timeline, onion skin, core exports, quests, Quill |
| 2 | Pixel art (tools, palettes, palette lock, selections), tiles and tilemaps, sprite sheets for Godot/Unity/Phaser/PixiJS/CSS/JSON, merge-mode drawing |
| 3 | Symbols, classic tweens, easing editor, motion paths, morphs with hints, camera and parallax, clip flow (state graph), Lottie and animated SVG |
| 4 | Bones, IK, mesh bending, weight painting, squash and stretch, pose library, sound, lip sync, Godot bones export |
| 5 | Blend modes, masks, folders, effects, particles, text and text animators, PSD, PDF, .ai, ProRes |
| 6 | Web build (offline), plugins (sandboxed), your own templates, Edit in Frameling for .flplay |

Since then: onboarding with Quill, 14 themes, accessibility pass, help audit (every topic has media), first-hour
review fixes, artboards (shots), the detailed timeline (Clean timeline is a preference), the Properties right side
(Rail and Tabs are preferences), a pixel-focused Pixel workspace, pen/polygon/star/gradients, grids and perspective,
light table, version history, shortcut sets, sounds (on by default), a Godot importer add-on, and pilot signing.

- **Branches:** `development` is current (about 275 commits). `main` got PR #1 merged on 2026-11-12, when all four
  CI builds (Windows, macOS, Linux, web) passed. Everything after that is on `development` only.
- **Tests:** 1796 passing, 9 skipped (the skips are the real-Godot tests, which run with `GODOT_BIN` set).
- **Installed copy:** `/mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage` (`npm run install-local`).
- **Board:** https://project-boards.shanegadsby.com, project `frameling`. CLI: `/mnt/109313D2109313D2/lutris-applications/project-boards/pb`.

## Rules (the user's, standing)

- **gh account:** `gh auth switch -u schme16` before every Frameling push, then straight back:
  `gh auth switch -u schme16 && git push origin development; gh auth switch -u Shane-Gadsby`. Leaving schme16 active
  breaks the user's work repos. For one-off API calls use `GH_TOKEN=$(gh auth token -u schme16) gh ...` instead of
  switching.
- **Commits:** only to `development`; `main` only through PRs (PRs into main run the 3-OS + web build). Never any
  Co-Authored-By or Claude/AI attribution, in commits or PRs.
- **Priorities:** ease of use and delight first, then performance. Plain words in the UI with the industry term second.
- **Docs are part of every feature:** a help topic (`registerHelp`) with a screenshot or short H.264 clip. The help
  audit in `npm test` fails if a topic has no media, a link is dead or a shortcut named in help doesn't match.
- **Decisions go on the board as looks:** A/B side by side (images or H.264 video, never AV1), recommendation built as
  the default meanwhile. Never wait on the user: post it and move to the next item. Two answers with no clear winner:
  use the "ask the first time, then remember" choices system (`src/core/choices.ts`) or a preference.
- **Install for the user** after anything they should try: `npm run install-local`.
- **Pace:** the user wants as much done as possible, up to 5 agents at once (board setting maxSubagents 5).

## How the work was run (worth repeating)

- One coordinator session, up to 5 agents, each in its own git worktree:
  `git worktree add ../frameling-wt/<name> -b wip/<name> development`, with `node_modules` symlinked from the main
  checkout. Agents commit to their branch, never push. The coordinator merges (`git merge --no-ff`), runs
  `npx tsc --noEmit && npm test`, pushes, removes the worktree and branch, and posts any looks.
- The brief every agent got is `docs/agent-brief.md`. It holds the rules above in agent form.
- **Traps that bit us:**
  - `.gitignore` used to say `node_modules/`, which doesn't match a symlink, so agents committed the link and a merge
    deleted the real `node_modules`. Fixed (`node_modules` now), but check `git ls-files node_modules` is empty after
    merges.
  - `npm install` in the main checkout removes packages an agent's worktree added but development doesn't list yet.
    Tell agents not to run it; run it yourself after merging a branch that changed `package.json`.
  - **Every screenshot, recording, Electron check and test runs in xvfb, never on the user's desktop** (user's rule,
    2026-11-12): `xvfb-run -a -s "-screen 0 1600x1000x24" <command>`, plus `SHOT_SHOW=1` for `scripts/shoot.cjs` and
    `scripts/docs/record.cjs`. Earlier runs used an off-screen window on the live display; don't. If a harness fails
    under xvfb, fix the harness. A step that opens a blocking dialog (the first-run sheet) hangs shoot.cjs: turn off
    onboarding/welcome via prefs in the first step.
  - The auto-mode permission check blocks merging PRs to `main` and writing GitHub secrets. Give the user the exact
    `!` command to run instead.
  - `pb ask-json` media must be objects `{url, kind, caption}`; plain URL strings save as blank images without error.

## Waiting on the user

- **Signing secrets** (board task `signing`). The pilot uses a self-signed Windows certificate and ad-hoc macOS signing
  (like Godot); see the README "Signing (pilot)". The certificate is at
  `/mnt/109313D2109313D2/projects/frameling-signing/` (private key, .pfx, password; never commit). Windows builds are
  unsigned until the user runs:
  ```
  ! base64 -w0 /mnt/109313D2109313D2/projects/frameling-signing/frameling-codesign.pfx | GH_TOKEN=$(gh auth token -u schme16) gh secret set WIN_CSC_LINK --repo schme16/frameling
  ! GH_TOKEN=$(gh auth token -u schme16) gh secret set WIN_CSC_KEY_PASSWORD --repo schme16/frameling < /mnt/109313D2109313D2/projects/frameling-signing/pfx-password.txt
  ```
  The macOS ad-hoc hook (`build/adhoc-sign.cjs`) and Windows signing haven't run in CI yet: the next PR to main is
  their first real test.
- **Board hand-offs pending:** `timeline-detailed` (keep detailed as default?) and `templates-new` (info only).
- **Quill's words:** `quill-dialogue` on the board, page on the Docs tab. When the user pastes changes back, run
  `npm run dialogue:apply <file>` (it checks `{placeholders}`).
- **Interactives side** (repo rules in `/mnt/109313D2109313D2/sync/www/work/apps/interactives/CLAUDE.md`):
  - The Frameling animation layer and its follow-ups are merged and pushed in interactives-player and
    interactives-editor.
  - The `/toolbox-docs` page is on branch `wip/frameling-docs` in si-manager (worktree
    `/mnt/109313D2109313D2/sync/www/work/apps/interactives/wt-frameling2-docs/si-manager`), **not pushed**: pushing
    si-manager deploys to the test server straight away, so it needs the user's go. It lists six screenshots still
    needed (`media-needed.md`) and asks in `questions.md` #35 where staff should get Frameling.
  - `q-ae-import` (After Effects import, Interactives board) was asked early on; check whether it was answered.

## The queue, in order

1. **Interactives' workspace system** (board task 18): toolbars, panels, floating windows, docking, rearranging,
   naming and grouping, saveable and shareable workspaces. The porting notes at the end of
   `docs/right-panel-research.md` map Interactives' dock model onto Frameling's (`src/ui/dock.ts`, `DockView.tsx`,
   `RightDock.tsx`, `panelInfo.ts`). Keep the right side's presentation work; add the top zone, floats and a movable
   tool rail; keep the late-registering panel list (`known`) for plugins and lazy panels.
2. **Help media in light and dark** (board task 17): capture every help picture and clip in both, the help browser
   picks by the current mode (and follows Auto), the help audit checks both exist. Do this last, after any other big
   UI change, so nothing is captured twice.

## Known gaps (from the agents' reports, not yet done)

- **Exports**
  - Unity importer script never compiled in Unity.
  - Phaser, PixiJS and CSS only checked against their schemas.
  - `.ai` never opened in Illustrator.
  - Multi-artboard exports (each, zip, atlas) not run end to end in the app.
  - Lottie canvas player blends per shape; big baked effects make big Lottie files.
  - PSD: a mask inside a folder masks the whole folder.
- **Rig**
  - Bones export to Godot leaves out effects, camera and bones in symbols.
  - Lip sync guesses are rough.
- **Artboards**
  - Shots of different sizes can't be joined (no letterboxing).
  - The timeline reads the open artboard only.
  - "Variations" for animation is mocked, not built.
- **Timeline**
  - At 1280 wide several header buttons live in a ⋯ menu.
  - Property-row keys on symbols move the whole drawing.
- **Canvas**
  - Rectangles and ellipses don't snap to perspective.
  - Onion skin hides when looking through the camera.
  - Tool sizes don't follow camera zoom.
- **Platforms**
  - Not tried on real Windows or macOS (only CI builds).
  - Safari/WebKit untested for the web build.
  - The `frameling://` handler on Windows comes from a custom NSIS script, untested.
- **Help media:** a few clips predate the latest UI changes (task 17 will recapture everything).

## Decisions already made (don't reopen)

Taken from the board; the built version is the user's pick unless noted.
- **Mascot:** Quill, a pixel-art hedgehog with pencil quills, 48 px sprite.
  - Editable source: `brand/mascot/mascot.frameling` (`npm run build:mascot`).
  - Sad goodbye when hidden; arms redrawn chunky.
  - His dialogue lives in `src/ui/mascot/lines.json`.
- **Look:** Cosy look by default, Crisp optional. 14 themes, incl. Glacier Grid/Ice Camo, Lilac Static/Lavender Hum,
  Strawberry Night/Strawberry (Quill's favourite).
- **Defaults and behaviours**
  - Default fill is the theme's highlight colour.
  - New drawings carry on until the next one (a preference).
  - Empty-frame ghost on by default.
  - Sounds on by default.
  - In-between edits make a key; MP4 with sound and no FFmpeg stays MP4.
  - Tool picks bring their colour box forward.
- **Layout**
  - Right side is Properties + labelled rail (Rail, Tabs are preferences).
  - Panel tabs shrink to icons then "+N".
  - Templates in Built-in / Yours tabs, blank starters as a size row.
  - Onboarding is a full-window sheet; its theme step leads with Auto/Dark/Light.
  - Export shows popular formats first, with a File > Export submenu.
  - Merge drawing is one on/off switch.
- **Small looks:** solid rulers, line grid, light table in own colours, pen with square points, gradient bar editor,
  heat-map weights, pointed bones, dim-outside camera frame, tween band with arrow.
- **Icons:** no AI-looking icons (no sparkles); a test enforces it.
- **Signing:** self-signed Windows + ad-hoc macOS for the pilot (user's call, 2026-11-12).

## Where to read next

- `docs/README.md`: index of the docs.
- `docs/architecture.md`, `docs/format.md`, `docs/testing.md`: how it's built, the file format, every check and
  harness.
- Feature design notes: `docs/symbols-tweens.md`, `docs/effects.md`, `docs/plugins.md`, `docs/artboards.md`,
  `docs/right-panel-research.md`, `docs/first-hour-review.md`.
- The original evaluation and phase plan: board Docs tab, `evaluation`.
