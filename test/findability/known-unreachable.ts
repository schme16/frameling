// Commands a person can only reach by typing their name into the command palette, or by a key they would have to know
// about already. They are the findability debt: the number can only go down.
//
// Each line says why it is still here. To pay one off, give the command a way in (a menu entry, a button in its panel,
// a spot in a tool bar) and delete its line; the test fails if a line is left behind after the command became reachable.
// Do not add a line to get a new command past the audit: give the new command a way in instead.

/** Reached from nowhere a person can see, or the palette alone. */
export const PALETTE_ONLY: Record<string, string> = {
  // The Effects panel has a blend picker, so the capability is there; these twenty commands are only an alias for it.
  ...Object.fromEntries(
    [
      'normal', 'multiply', 'screen', 'add', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten', 'color-dodge',
      'color-burn', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'linear-dodge', 'subtract', 'divide', 'luminosity',
    ].map((m) => [`effects.blend.${m}`, 'Blend mode: the Effects panel has a picker for it, nothing else points at the command']),
  ),
  // Hidden aliases of the Select tool family: left out of the palette on purpose, and not on a key.
  'select.box': 'Hidden alias for the Select tool, no key, no menu',
  'select.magnetic': 'Hidden alias for the magnetic lasso, no key, no menu',
  'select.wand': 'Hidden alias for the magic wand, no key, no menu',
  // Keyboard sets: picked in Preferences > Keys by name, so the commands that switch set are an alias for that list.
  'keys.set.frameling': 'Keyboard set: chosen in Preferences > Keys, nothing else points at the command',
  'keys.set.flash': 'Keyboard set: chosen in Preferences > Keys, nothing else points at the command',
  'keys.set.pixel': 'Keyboard set: chosen in Preferences > Keys, nothing else points at the command',
  // Diagnostics: reached from the pen check page itself and from Help, not from a menu.
  'pen.check': 'Pen check: opened from Help and the tablet page, no menu entry of its own',
  'perf.copyReport': 'Copies the performance report: only meaningful on the diagnostics page',
  // Quest controls: the quest bar has its own buttons, so these are aliases for them.
  'quests.resume': 'Resume a quest: the quest bar has the button, nothing else points at the command',
  'quests.cardHome': 'Back to the quest card: the quest bar has the button',
  'quests.stop': 'Stop a quest: the quest bar has the button',
};

/** On a key, and at most in the palette. A key is a way in, but only for somebody who already knows it. */
export const KEYS_AND_PALETTE_ONLY: Record<string, string> = {
  'colors.toggleWell': 'X switches the fill and stroke box; no button or menu entry names it',
  'select.lasso': 'Hidden alias for the lasso, only on its key',
};
