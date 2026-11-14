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
