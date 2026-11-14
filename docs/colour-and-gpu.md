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
| `card` | anything that claims to measure speed (`perf/run.cjs`, `sweep.cjs`, `penup.cjs`, `startup.cjs`) | the same flags the app sets on Linux, in its main process (`src/main/gpuFlags.ts`; a test compares the two lists) | the engine fell back to software, the window is composited in software, 2D canvas is not on the card, or there is no WebGL |

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

`scripts/e2e/pixelblend-gpu.cjs` holds the GPU blend path (Linear dodge, Subtract, Divide) to the CPU path in software,
and the card run (`GPU_MODE=card`) is the same check. The limit is 1 level on any pixel and at most 1 pixel in 100000
differing at all.

That was not always true. The old check let see-through shapes differ by 8 levels, which hid a real difference: 22005 of
2.5 million pixels (0.9%) differed, up to 4 levels on Divide, in software as well as on the card. Two causes, both
rounding. (1) An exact tie, like half opacity over a solid colour (0.5 x 200 + 0.5 x 255 = 227.5), came out 227 on the
CPU path and 228 in the shader, by luck of the last bit of the arithmetic. (2) The canvas gives back straight colour
from its stored premultiplied bytes by its own rounding, and on an exact tie (255 x 1 / 170 = 1.5) it rounds either way
depending on the pair and the kind of canvas, while the shader rounded by float noise; a one level slip there is
magnified by Divide at soft edges and by a second blend layer stacked on the first. Neither path was simply right.
Now both share one rule (`src/effects/pixelBlend.ts`): the CPU path recovers the stored bytes from what the canvas gave
it, both un-premultiply half up in whole numbers, and both round results half up with a 0.001 nudge so a tie lands the
same side in 32-bit and 64-bit arithmetic. What cannot be removed: a value that sits within float noise of a rounding
edge can still round differently in the two number formats. In software that is 5 pixels in 2.5 million, one level each.
The card has not been run (no card from the agent's sandbox); its own float quirks may add a few more, which is what
the 1e-5 headroom is for.

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
  screen. `scripts/e2e/gpu-canvas.cjs` now looks at the window (below).
- **Which flag did it**, found one at a time on that card (RTX 4080 SUPER, Zorin, X11), each run opening the same
  file and judged by eye:

  | | |
  |---|---|
  | `--disable-gpu` (software) | draws |
  | `--ignore-gpu-blocklist` alone | draws |
  | `+ --enable-features=Vulkan,DefaultANGLEVulkan` | **blank canvas** |
  | `+ --enable-zero-copy` | draws |
  | `+ --canvas-oop-rasterization` | draws |

  So Vulkan through ANGLE is the one. The app never adds it, not even for `FRAMELING_GPU=full`, and
  `FRAMELING_GPU=vulkan` is the only way to get it. `FRAMELING_GPU=full` now means zero copy and out-of-process canvas
  drawing, the two that drew on their own. They are not the default (see "Why the canvas went blank" for what would
  change that).

## Why the canvas went blank, and what a virtual screen can and cannot show

Looked at again with the real card (RTX 4080 SUPER, driver 615, Vulkan 1.4.351), inside xvfb, with the real app and a
picture of the composited window (`scripts/e2e/gpu-canvas.cjs`, the canvas area compared with the software drawing of the
same file, two starter drawings: a vector one and a pixel one). **Every one of these draws correctly**, each with the app's
graphics process on the NVIDIA card in `nvidia-smi` while it ran:

| way of asking | page's renderer |
|---|---|
| as shipped, with the card asked for (`FRAMELING_CARD=discrete`) | NVIDIA GeForce RTX 4080 SUPER, OpenGL |
| `FRAMELING_GPU=full` (zero copy and out-of-process canvas together) | the same |
| `FRAMELING_GPU=vulkan` (`Vulkan,DefaultANGLEVulkan`, no `--use-vulkan`) | the same card, Vulkan |
| the same plus `--use-vulkan` | Vulkan |
| plus `--use-angle=vulkan --use-vulkan` | Vulkan |
| plus `--enable-features=VulkanFromANGLE --use-vulkan` | Vulkan |
| Vulkan with zero copy and out-of-process canvas | Vulkan |

So the lead "the tried set had no `--use-vulkan`" is not it: with and without, Vulkan draws here. What does not reproduce
is the blank canvas itself. The difference between this run and the user's is the screen. A virtual screen has no card to
present on, so the engine composes and presents in software; on the real X11 screen the card's pixels have to reach a real
X server (the engine's compositor and the Vulkan drawing share memory with each other and with the server), and that is the
step nothing here exercises. Vulkan's *drawing* is fine on this card, the blank is in the *presenting*, and only a real
screen can show it. Not proven by any run: this is the reading that fits every piece of evidence, not a measurement.

What this settles:

- `gpu-real-runs` can measure the real card through Vulkan or OpenGL in xvfb, since drawing is correct in both. The comment
  that Vulkan "draws nothing" is true of the user's real screen only, and says so now.
- Nothing may ship because a virtual screen passes. `gpu-canvas.cjs` is the floor (a flag that blanks the canvas in the
  window fails it, and the check proves it can tell with a control that hides the canvas), not the ceiling.
- Zero copy and out-of-process canvas stay opt-in. They drew on the real screen one at a time, and together they draw in the
  window check, but the pair has not been seen on a real screen, and a virtual one cannot show presenting. What would move
  them to the default: `FRAMELING_GPU=full` run on a real screen for a while (the user's own machine is enough), then a
  second maker's card in the same check. The caution was "wait for a second card"; it is now "wait for the real screen".
- ANGLE on Vulkan stays off by default for the same reason, stronger: it is the one that was seen to blank.

### The likely cause, from the user's own Chrome (not yet proven on a real screen)

The user's desktop Chrome runs Vulkan fine on this same machine and screen. Its command line is
`--use-vulkan --enable-features=Vulkan --ignore-gpu-blocklist --ozone-platform=x11`, and its `chrome://gpu` says Skia
Backend `GaneshVulkan`, GL implementation `(gl=egl-angle,angle=opengl)`, renderer `ANGLE (NVIDIA Corporation, NVIDIA
GeForce RTX 4080 SUPER/PCIe/SSE2, OpenGL 4.5.0 NVIDIA 615.71.09)`. So Chrome puts **Skia on Vulkan and leaves ANGLE on
OpenGL**. The set that blanked Frameling was `Vulkan,DefaultANGLEVulkan`, and `DefaultANGLEVulkan` is the part that moves
ANGLE onto Vulkan. The reading: ANGLE-on-Vulkan presenting to a real X server is what blanks; Skia-on-Vulkan is fine.
That is `FRAMELING_GPU=skia` (`--use-vulkan` plus `--enable-features=Vulkan`, never `DefaultANGLEVulkan`).

Tested here, inside xvfb, with the real app and the window check: it draws correctly (vector and pixel drawings), with the
app's graphics process on the NVIDIA card, on its own, with `FRAMELING_GPU=full`'s switches added, and even with the card
not asked for (Skia on Vulkan on the NVIDIA card while WebGL is on llvmpipe, canvas still correct). Not proven: that it
presents correctly on the real screen, which is the whole question and which xvfb cannot answer. It stays opt-in
(`FRAMELING_GPU=skia`) until the user has run the steps on their own display (see the steps card).

## Which card (gpu-detect)

Reported, then fixed:

- **The report named the wrong card.** The engine's `active` flag pointed at the onboard AMD card (which on this machine is
  not even usable: the kernel has it on `vfio-pci`, set aside for a virtual machine) while the page was drawing on the
  NVIDIA card. The Performance page said "AMD card (device 0x164e)". The engine here also fills no `deviceString` and no GL
  strings. Now the card in use is read from what a page's own WebGL says (`liveRenderer`, `src/gpu/identify.ts`), the name
  comes from that, then the engine's string if it is a real name (a generic "NVIDIA Device (0x2702)" never wins), then the
  system's PCI list (`pci.ids`), and the hex code is the last resort. Software (llvmpipe, SwiftShader) reads as software even
  when the engine's own verdicts say "enabled".
- **Not `ba023c83`.** Moving the flags from the launcher to the main process changes nothing: the same renderer comes out
  with the switches on the command line or set with `appendSwitch`. The regression window is `2d9d209a` (Vulkan taken out
  of the default). On this machine ANGLE on Vulkan picks the discrete card by itself; the OpenGL path that replaced it
  follows the X server, which under xvfb lands on llvmpipe (Mesa), and on a computer with two cards can land on either.
  Nothing asked for a card on either path.
- **Asking for the discrete card** (`src/main/gpuPick.ts`, `FRAMELING_CARD`). The card makers' own switches, because OpenGL
  chooses by system, not by the engine: NVIDIA's driver `__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia
  __VK_LAYER_NV_optimus=NVIDIA_only` (measured under xvfb: `__GLX_VENDOR_LIBRARY_NAME=nvidia` alone takes OpenGL from
  llvmpipe to the RTX 4080; `DRI_PRIME` and the EGL vendor file do nothing there), and for Mesa cards
  `DRI_PRIME=pci-<address>` (untested here: no Mesa discrete card). They are set only when there are two cards that can draw
  and exactly one is discrete (NVIDIA, or AMD with 3 GB or more of its own memory), the driver's library is installed, and
  nothing in the environment already chose. `FRAMELING_CARD=system` leaves it to the system, `FRAMELING_CARD=discrete` asks
  even with one working card (that is how a virtual screen gets the card). The environment has to be there when the engine
  starts: setting it in the running main process does not reach the graphics process (measured), so Frameling sets it and
  starts itself again once (`FRAMELING_STEERED=1` stops a second time; the relaunch uses the same plan as Restart, so an
  AppImage opens by its own file). If it cannot restart itself it does not ask. A run from source is not restarted unless
  the card is asked for by name, since a restart takes the terminal away.
- Why the card makers' switches and not Vulkan: Vulkan picks the discrete card by itself but is the path that blanked the
  canvas on a real screen. The switches keep the proven OpenGL path and only choose the card.
- The Performance page says when a faster card is there and not drawing, and the copied report has `Asked for:`, `Page renderer:`
  and which cards are discrete or set aside.

## The window check (scripts/e2e/gpu-canvas.cjs)

Opens a starter drawing in the real app for each way of asking for the card, takes a picture of the composited window,
and judges the canvas area (`scripts/lib/canvas-judge.cjs`): one flat colour is "empty", and a canvas that does not match
the software drawing of the same file fails. Every run names the adapter the page really got, and the shipped runs must
have the app's process on the NVIDIA card in `nvidia-smi` taken during the run. A hidden-canvas control must be caught, or
the check fails itself. A test (`test/gpu/canvas-judge.test.ts`) holds the judge, and holds the list of shipped runs to
"never a Vulkan switch". Limit, stated plainly: it runs in a virtual screen, so it cannot see a blank that only happens when
a real X server is presenting.
- **The silent fall back** (above) is the real risk with hardware drawing on: on a driver the engine can't use, the
  AppImage still opens, in llvmpipe, and looks fine. `FRAMELING_GPU=off` is the honest way to ask for
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

## The start line and the certificate line

- On start the main process prints one line in the Performance page's words (`startLine` in `src/gpu/describe.ts`, from
  the same report as the page), for example `Frameling: drawing on your graphics card (NVIDIA ...), through OpenGL.` or
  `Frameling: drawing in software, which is slower (no graphics card could be used).` The copied drawing report has it as `On start:`.
- The engine's `nss_util.cc ... After loading Root Certs, loaded==false: NSS error code: -8018` line is harmless (no NSS
  certificate database on the desktop). It is native code writing to stderr, so the Linux launcher filters that exact
  line and nothing else (`quiet()` in `build/linux/launcher.sh`; the pattern is `NSS_NOISE_PATTERN` in `src/main/stderrNoise.ts`, and a
  test keeps the two the same). `npm run dev` does not go through the launcher, so it still shows the line.
## The AppImage uses the card (appimage-gpu-flags)

On Linux the engine blocks drivers it does not know, and measured here under xvfb the plain app with nothing added has
every verdict `disabled_software` (compositing, 2D canvas, rasterization, WebGL). With `--ignore-gpu-blocklist` all of
them are `enabled`. The flag used to come from the launcher (`build/linux/launcher.sh`). It now comes from the app's
main process, `hardwareSwitches` in `src/main/gpuFlags.ts`, because the engine reads that switch after it starts and
so it needs no launcher: it holds for the AppImage, a `.deb`, `npm start` and anything else that runs the app.
`FRAMELING_GPU=off` (or the `gpu-off` file) leaves it out, `=full` and `=vulkan` are as above, and Windows and macOS are
left to the engine. The proof is `scripts/e2e/appimage-gpu.cjs` (docs/testing.md).
