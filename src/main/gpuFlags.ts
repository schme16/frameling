// What Frameling tells the browser engine about colour, before the engine starts. Kept out of main.ts so a test can read it.
//
// The colour profile is pinned to sRGB. Left alone, the engine uses whatever the screen claims (macOS and Windows read
// the screen's profile, Wayland compositors can hand one over), so the same drawing is shown through a different
// conversion on a wide-gamut screen than on an ordinary one. Pinned, an sRGB number goes to the screen unchanged: what
// you mix is what the canvas holds, what a PNG export writes and what a screenshot reads back, on every machine.
//
// The cost, which is a choice and not a bug: on a wide-gamut screen (Display P3 and wider) colours are no longer
// converted for it, so they look more vivid than the same file does in a program that does convert. Nothing in the
// exported file changes. FRAMELING_COLOUR=screen (or FRAMELING_COLOUR_PROFILE=screen) turns the pin off and lets the
// engine manage colour for the screen, for someone who prefers the screen to be accurate over the numbers matching.

export type EngineSwitch = readonly [name: string, value?: string];

/** The switches to set before the app is ready. `env` is the process environment. */
export function colourSwitches(env: Record<string, string | undefined> = process.env): EngineSwitch[] {
  const choice = (env.FRAMELING_COLOUR ?? env.FRAMELING_COLOUR_PROFILE ?? '').trim().toLowerCase();
  if (choice === 'screen' || choice === 'display' || choice === 'off') return [];
  return [['force-color-profile', 'srgb']];
}

// Hardware drawing on Linux. The engine keeps a list of drivers it does not trust, and a driver it has never heard of
// is on it, so a Linux machine can end up drawing the window and the canvas in software with a perfectly good card.
// Frameling is a drawing app, so it says yes to the card: --ignore-gpu-blocklist, and nothing more by default.
// This is set here, in the main process, because the engine reads it after it starts, so it needs no launcher: it holds
// for the AppImage, a .deb, a dev run and anything else that starts this file. (The launcher used to pass it.)
//
// FRAMELING_GPU=full also keeps canvas pixels on the card (--enable-zero-copy, --canvas-oop-rasterization). Each drew
// correctly on its own on the user's real screen (RTX 4080 SUPER, X11), and both together draw correctly in the window
// check (scripts/e2e/gpu-canvas.cjs, composited pixels, on that card). What nobody has seen is the pair on a real screen,
// and a virtual screen cannot show it: it has no card to present on, and presenting is where the Vulkan blank canvas
// happened. So they stay opt-in until FRAMELING_GPU=full has been run on a real screen, not until a second card turns up.
// FRAMELING_GPU=vulkan asks for Vulkan through ANGLE. On the user's real screen that left the canvas empty (the file opens,
// every layer is there, nothing is drawn). Under a virtual screen the same card draws correctly through it, with every
// combination of --use-vulkan, --use-angle=vulkan and VulkanFromANGLE tried: so the drawing is not what fails, the step
// after it is (the card's pixels reaching a real X server), which a virtual screen cannot show. Nothing reaches for it
// unless it is asked for by name; it is safe for measuring in a virtual screen and unproven on a real one.
// Which card (not which API) is a separate matter: see gpuPick.ts and FRAMELING_CARD.
// Windows and macOS are left to the engine: their lists are about real driver faults and nothing there is known to be wrong.
export const HARDWARE_SWITCH: EngineSwitch = ['ignore-gpu-blocklist'];
export const FULL_SWITCHES: EngineSwitch[] = [['enable-zero-copy'], ['canvas-oop-rasterization']];
export const VULKAN_FEATURES = 'Vulkan,DefaultANGLEVulkan';

/** The hardware switches for this machine. `off` is true when hardware drawing is switched off (see gpuFile.ts). Features come back separately, to be merged. */
export function hardwareSwitches(
  env: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
  off = false,
): { switches: EngineSwitch[]; features: string[] } {
  if (off || platform !== 'linux') return { switches: [], features: [] };
  const mode = (env.FRAMELING_GPU ?? '').trim().toLowerCase();
  if (mode === 'off') return { switches: [], features: [] };
  const switches: EngineSwitch[] = [HARDWARE_SWITCH];
  if (mode === 'full') switches.push(...FULL_SWITCHES);
  return { switches, features: mode === 'vulkan' ? [VULKAN_FEATURES] : [] };
}

/** Adds to --enable-features without losing what is already there (appending the switch again replaces its value). */
export function mergeFeatures(current: string, add: readonly string[]): string {
  const have = current.split(',').map((s) => s.trim()).filter(Boolean);
  for (const f of add.flatMap((a) => a.split(','))) if (f && !have.includes(f)) have.push(f);
  return have.join(',');
}

/** One plain line for the log when the engine's graphics process is lost, so a fall back to software is said and not silent. */
export function gpuLostLine(reason: string, exitCode: number): string {
  return `[gpu] the graphics process stopped (${reason}, code ${exitCode}). The engine goes on in software if it cannot restart it; Preferences > Performance says what is drawing, and FRAMELING_GPU=off starts without the card.`;
}

/**
 * The line to log when the card was asked for and the engine's own verdicts say software is drawing the window or the
 * canvas, or null when all is as asked. `features` is app.getGPUFeatureStatus().
 */
export function softwareFallbackLine(asked: boolean, features: Record<string, string>): string | null {
  if (!asked) return null;
  const on = (k: string) => String(features[k] ?? '').startsWith('enabled');
  if (on('gpu_compositing') && on('2d_canvas')) return null;
  return `[gpu] hardware drawing was asked for but the engine is drawing in software (compositing ${features.gpu_compositing}, canvas ${features['2d_canvas']}). Frameling still works; Preferences > Performance says why, and FRAMELING_GPU=off starts without the card on purpose.`;
}
