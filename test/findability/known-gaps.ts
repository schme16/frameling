// What the state-coverage audit found that is still unexplained today. Like the reachability list, it can only shrink:
// the test fails when a number goes up, and it also fails when a number goes down without this file being updated, so
// the win is written down. Do not raise a number to get a new feature past the audit: say why the thing is not there.

/** Left out of the command palette in every state, with no menu, key, rail button or screen control either. */
export const ABSENT_UNEXPLAINED: Record<string, string> = {
  'select.box': 'Hidden alias of the Select tool: nothing names it anywhere',
  'select.magnetic': 'Hidden alias of the magnetic lasso: nothing names it anywhere',
  'select.wand': 'Hidden alias of the magic wand: nothing names it anywhere',
};

/**
 * Panels a built-in workspace leaves out of sight without its description saying so, by workspace id. People still
 * find them in View > Panels, but nothing on the Pixel workspace itself says six panels went.
 */
export const PANELS_TUCKED_AWAY_SILENTLY: Record<string, string[]> = {
  draw: ['draw-on', 'clip-drawings', 'clip-flow'],
  animate: ['draw-on', 'clip-drawings', 'clip-flow'],
  pixel: ['symbol-props', 'draw-on', 'particles', 'clip-drawings', 'camera', 'text', 'clip-flow', 'rig', 'lipsync'],
};

export const CEILINGS = {
  /**
   * Tools that leave the tool rail when the layer you are on cannot use them (Preferences > Tools off the layer is "hide"
   * by default), counted per state. Slot twins (Select and Pixel select) are not counted, they stand in for each other.
   * The palette still lists them greyed with a reason, but the rail itself says nothing.
   */
  railToolsVanish: { blank: 10, vector: 10, 'vector-selected': 10, pixel: 8, tilemap: 32, 'symbol-open': 10, playing: 10, 'has-clips': 10 } as Record<string, number>,
  /** The same tools leave the Draw menu, which lists only the ones that work on the current layer, with no grey and no note. */
  menuCommandsVanish: { blank: 7, vector: 7, 'vector-selected': 7, pixel: 8, tilemap: 27, 'symbol-open': 7, playing: 7, 'has-clips': 7 } as Record<string, number>,
};
