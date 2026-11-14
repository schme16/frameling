# Colour and the drawing engine

Two things the browser engine used to guess, and now doesn't: which colours the screen has, and whether the card or
software draws. For a drawing app the first is the worse one, because the picture looks right while it is wrong.

## The colour profile is pinned to sRGB

`src/main/gpuFlags.ts` sets `--force-color-profile=srgb` before the engine starts. Every harness in `scripts/` sets the
same switch (through `scripts/lib/gpu.cjs`), and a test keeps the two the same.

What it means: an sRGB number goes to the screen unchanged. The colour you mix is the colour the canvas holds, the colour
a PNG export writes and the colour a screenshot or a pixel test reads back, on every machine.

**The cost, for anyone on a wide-gamut screen.** Left alone, macOS, Windows and some Wayland setups tell the engine
about the screen's profile, and the engine converts sRGB into it, so a red stays the same red. Pinned, nothing is
converted, so on a screen wider than sRGB every colour (and the interface too) looks more vivid than the same file does
in a program that does convert. Nothing in an exported file changes. Measured with the engine told the screen is
Display P3 and sRGB not pinned (`scripts/e2e/colour.cjs --simulate-p3`):

| drawn (sRGB) | what reaches the screen unpinned | pinned |
|---|---|---|
| 255, 0, 0 | 234, 51, 35 | 255, 0, 0 |
| 0, 255, 0 | 117, 251, 76 | 0, 255, 0 |
| 0, 0, 255 | 0, 0, 245 | 0, 0, 255 |
| 18, 120, 200 | 55, 118, 194 | 18, 120, 200 |

The canvas, the PNG and the pixel tests read the same numbers either way. A screenshot picks up a rounding error of a
level or two when the screen is wide, because it is read back through the screen's colour space. The screen is the
only thing that moves, which is why the pin is a choice and not a bug fix: pinned, the numbers are honest and the
screen is vivid; unpinned, the screen is accurate and the numbers depend on the machine.

Both of this machine's screens (LG, profiles in `~/.local/share/icc`) are wide: their primaries cover about 127% of
sRGB's area, about 94% of Display P3's. On X11 the engine does not read the profile (checked by putting the real profile
on the virtual X server's root window: no conversion), so on this machine under X11 the pin changes nothing today. It
matters on Wayland, macOS and Windows.

**Turning it off.** `FRAMELING_COLOUR=screen` (or `FRAMELING_COLOUR_PROFILE=screen`) in the environment leaves colour
to the engine, for someone who would rather the screen be accurate. There is no Preferences switch yet.

## The two engine modes for harnesses

`scripts/lib/gpu.cjs`. A harness calls `gpu.use(mode)` before the app is ready and `await gpu.confirmOrExit()` after
(with its window if it has one: the real app quits when its last window closes, so a throwaway probe window is no use
there). `confirm` asks the page what is really drawing (WebGL's renderer name, the engine's feature status, whether the
screen looks wide) and prints one line:

```
[gpu] card: ANGLE (NVIDIA, Vulkan 1.4.351 (NVIDIA NVIDIA GeForce RTX 4080 SUPER (0x00002702)), NVIDIA) | compositing enabled, canvas enabled, raster enabled, vulkan enabled_on | sRGB (pinned) | x11
```

| Mode | For | Flags | Fails when |
|---|---|---|---|
| `software` | pixel comparisons that must be the same everywhere | SwiftShader, which ships inside Electron | a real card turns up |
| `software` with `{ noGpu: true }` | captures and checks that never had a GPU (shots, help media, most e2e); also anything with an off-screen window, which paints nothing with SwiftShader on | no GPU process at all, no WebGL | the GPU is on |
| `software` with `{ webgpu: true }` | Phaser and PixiJS WebGPU checks | leaves ANGLE alone (with the SwiftShader switch the GPU process drops the WebGPU device), so the renderer is Mesa's llvmpipe | a real card turns up |
| `card` | anything that claims to measure speed (`perf/run.cjs`, `sweep.cjs`, `penup.cjs`, `startup.cjs`) | the same flags as the Linux AppImage launcher (a test compares the two lists) | the engine fell back to software, the window is composited in software, 2D canvas is not on the card, or there is no WebGL |

`GPU_MODE=card` or `GPU_MODE=software` in the environment overrides what a harness asked for, to run the same check
both ways. `PERF_SOFTWARE_GL=1` still asks the perf scripts for software. Perf results files now carry the line above
(`env.gpuRun` in `run.cjs`, `gpu` in `sweep.cjs`); older results did not say, and `onioncam-*.json` shows
`disabled_software`: it was a software run.

`xvfb-run -a npx electron scripts/lib/gpu-check.cjs card` (or `software`) prints the line and exits 0 or 1, for seeing
what a machine does.

### The silent fall back, shown

Asking for the card with `--disable-gpu`, or with no Vulkan driver (`VK_DRIVER_FILES=/nonexistent`), does not stop the
engine: it carries on in Mesa's llvmpipe, and `gpu_compositing` still reads `enabled`. Only the renderer name gives it
away, which is why a `card` run checks the name and fails on `swiftshader`, `llvmpipe`, `lavapipe`, `softpipe` and
the like.

`app.getGPUInfo()` is no use for naming the card here: on this machine its first device, marked active, is the AMD
integrated chip, while the picture was drawn by the NVIDIA card. Use the renderer name WebGL gives.

### Under xvfb

Vulkan draws without an X server and only presenting needs one, so a `card` run under xvfb still draws on the real
card (nvidia-smi lists the harness's own GPU process, 10 to 289 MiB, during a run) and the window stays on the virtual
screen. The one thing xvfb cannot show is presenting to a real monitor: see below.

## The proof: scripts/e2e/colour.cjs

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/colour.cjs --out software.json
GPU_MODE=card xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/colour.cjs --out card.json --ref software.json
```

- Eight flat colours are drawn and read back from the renderer, the editor's canvas, a real PNG export (and its
  chunks: no colour profile is written), a screenshot and the X server's framebuffer. All must equal what was drawn,
  exactly.
- A busy picture (curves, strokes, soft shapes, every blend mode including the three WebGL ones, blur, shadow) is
  rendered on each layer alone and as a whole, and the card is compared with software. Away from edges they agree to
  within 1 level. On edges the two rasterisers anti-alias differently: no edge pixel is more than 64 levels apart
  (measured: 5 on straight edges, up to 62 on a thin dark curved stroke) and at most 8% are more than 8 apart.
- A second screen at another scale: the pixel ratio is changed under the window (2, 1.5, 1) and the canvas has to follow
  and keep its colours.
- `--simulate-p3` is the deliberate fault: sRGB unpinned and a wide screen. It passes only if the screen moved and the
  renderer, canvas and PNG did not.
- `COLOUR_CPU=1` runs the same on the no-GPU path.

`scripts/e2e/pixelblend-gpu.cjs` also holds the GPU blend path to within 1 level of the CPU path in software. On the
card (`GPU_MODE=card`) it fails: Divide and Subtract come out up to 4 levels off on a few dozen soft-edge pixels of
7680. That looks like the card's texture and rounding, not colour; not looked into further.

## The framebuffer path

What was checked, and what was not.

- **Window composited on the card, canvas kept there.** With the fuller set (`--ignore-gpu-blocklist`,
  `Vulkan,DefaultANGLEVulkan`, `--enable-zero-copy`, `--canvas-oop-rasterization`) the engine reports compositing,
  2D canvas and rasterisation enabled and Vulkan on, and WebGL's renderer is the NVIDIA card. Colours and the busy
  picture match software as above, so zero-copy and out-of-process canvas drawing do not stripe or shift anything in
  what could be read back.
- **What that check missed, and it matters.** It read pixels back out of an offscreen canvas. It never looked at the
  window. On the user's NVIDIA driver that same set opened a file with every layer in it and drew **nothing at all**
  on the canvas. The lesson for any graphics check here: reading a canvas back is not proof that anything reached the
  screen.
- **Which flag did it**, found one at a time on that card (RTX 4080 SUPER, Zorin, X11), each run opening the same
  file and judged by eye:

  | | |
  |---|---|
  | `--disable-gpu` (software) | draws |
  | `--ignore-gpu-blocklist` alone | draws |
  | `+ --enable-features=Vulkan,DefaultANGLEVulkan` | **blank canvas** |
  | `+ --enable-zero-copy` | draws |
  | `+ --canvas-oop-rasterization` | draws |

  So Vulkan through ANGLE is the one. The launcher never adds it, not even for `FRAMELING_GPU=full`, and
  `FRAMELING_GPU=vulkan` is the only way to get it, for anyone measuring it on another card. `FRAMELING_GPU=full`
  now means zero copy and out-of-process canvas drawing, the two that work. They are not the default until a second
  card says so.
- **The silent fall back** (above) is the real risk with hardware drawing on: on a driver the engine can't use, the
  AppImage still opens, in llvmpipe, and looks fine. The launcher's `FRAMELING_GPU=off` is the honest way to ask for
  software. Preferences should show the renderer name (task `gpu-prefs-page`).
- **A second screen at a different scale (fixed).** When a window moves between screens at different scales and keeps
  its size, no resize event comes, so the canvas kept its old number of pixels and was shown stretched. Measured
  before: at pixel ratio 2 the canvas still held 684 x 444 pixels for 684 x 444 on screen; after: 1368 x 888.
  `src/canvas/pixelRatio.ts` listens for the ratio changing, and each frame checks it as well, because the engine's
  media-query events did not arrive reliably when the page was idle.
- **Not checkable here, so not claimed.** Swap and tearing under X11 and under Wayland need a real monitor: there is no
  Wayland compositor on this machine, and xvfb never presents. The launcher has `FRAMELING_OZONE=x11|wayland|auto` for
  trying both. The pen overlay asks for a low-latency canvas (`desynchronized: true`); as far as
  Chromium's own notes say, that is honoured only where the canvas can go straight to the compositor (not on Linux), so it
  should be ignored there. Not measured.
  X11 has one scale for all screens, so a second screen at a different scale is a Wayland, macOS and Windows case.
