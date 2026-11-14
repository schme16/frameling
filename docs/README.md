# Frameling docs

Start with `architecture.md`. Tasks, questions, looks and known gaps are on the project board (project `frameling`).

| Doc | What it is |
|---|---|
| [agent-brief.md](agent-brief.md) | The shared brief given to every build agent. |
| [architecture.md](architecture.md) | How the pieces fit: main process, bridge, store, registries, renderer, canvas, dock, timeline, exports, io, plugins and the rest, with file paths. |
| [format.md](format.md) | The `.frameling` document format, every type and field, how files are checked and repaired, compatibility rules, the `.flplay` package and the plugin manifest. |
| [testing.md](testing.md) | Every test and check harness, with exact commands: vitest, the help audit, the Electron harnesses (run under xvfb), perf, screenshots and help clips, CI. |
| [mascots.md](mascots.md) | What a mascot is, the clip contract every mascot must keep, how to add one, and how the choice works. |
| [colour-and-gpu.md](colour-and-gpu.md) | Why the colour profile is pinned to sRGB and what that costs on a wide screen, the harnesses' two engine modes (software, the real card), the silent fall back, and what was and wasn't checked in the framebuffer path. |
| [plugins.md](plugins.md) | The plugin API, the sandbox and the threat model. |
| [effects.md](effects.md) | Blend modes, effects, clipping, masks, folders, particles, text and the layered exports: design and how they're built. |
| [symbols-tweens.md](symbols-tweens.md) | Symbols, classic and shape tweens, camera and clip flow: design and how they're built. |
| [artboards.md](artboards.md) | Several named canvases in one document: format, behaviour and export. |
| [right-panel-research.md](right-panel-research.md) | Research behind the right side's Properties, rail and tabs. |
| [first-hour-review.md](first-hour-review.md) | A new person's first hour in the built app, what went wrong and what changed. |

Elsewhere: `README.md` (front page and commands), `scripts/perf/README.md` (performance measurements),
`plugins/examples/` (two example plugins).
