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
  menuCommandsVanish: { blank: 7, vector: 7, 'vector-selected': 7, pixel: 6, tilemap: 23, 'symbol-open': 7, playing: 7, 'has-clips': 7 } as Record<string, number>,
};

/**
 * Commands of an optional feature that no document situation and no feature state (test/findability/app.ts) ever turns
 * on, so the audit has never seen them work. Like the other lists here it can only shrink: add a state that makes the
 * command work and delete its line. Do not add a line to get a new command past the audit.
 */
export const NEVER_SEEN_WORKING: Record<string, string> = {
  // These need something the store does not hold: a tile or bone picked in a panel, a clip picked in the Clips panel.
  // Each needs a state that builds the thing (a tileset with a tile in it, a skeleton with a bone picked) and says so.
  ...group('Needs a tile picked in the Tileset panel, which lives in the panel and not the store', [
    'tiles.edit', 'tiles.done', 'tiles.duplicate', 'tiles.delete', 'tiles.flipX', 'tiles.flipY', 'tiles.rotate', 'tiles.nextTile', 'tiles.prevTile',
    'tiles.solid', 'tiles.drawBox', 'tiles.drawShape', 'tiles.clearShapes', 'tiles.oneWay', 'tiles.showShapes', 'tiles.addValue', 'tiles.addTerrain',
    'tiles.makeEdgeTiles', 'tiles.guessEdges', 'tiles.autoEdges', 'tiles.export',
  ]),
  ...group('Needs a skeleton with a bone picked, and a layer attached to it', [
    'rig.autoAttach', 'rig.bendLayer', 'rig.paintWeights', 'rig.smoothWeights', 'rig.normaliseWeights', 'rig.detachLayer', 'rig.savePose', 'rig.mirrorPose',
    'rig.swapSides', 'rig.resetPose', 'rig.togglePin', 'rig.deleteBone', 'rig.deleteBranch', 'rig.addChildBone', 'rig.renameBone', 'rig.pickParent', 'rig.pickChild',
  ]),
  'flow.fromAny': 'Needs a clip picked in the Clips panel, which lives in the panel and not the store',
  'particles.shuffle': 'Needs a particle emitter selected on the canvas',
  'text.pixelSmaller': 'Needs pixel text sized above its smallest',
};

function group(why: string, ids: string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, why]));
}

// ---------------------------------------------------------------- crowding and depth (crowding.test.ts)

/**
 * A command whose shallowest way in through the menus is more than MAX_MENU_STEPS clicks deep. Each is still on the
 * palette and its own panel, but a person looking in the menus has to open three lists to get to it. Like the lists
 * above it can only shrink: flatten the menu, move the entry up, or give it a button, then delete the line.
 */
export const DEEP_IN_MENUS: Record<string, string> = {
  // Empty since the stream family got its own Streaming menu: its dares, pen modifiers and Quill reactions are three clicks from the bar.
};

/**
 * Menus and submenus with more than MAX_LIST_ENTRIES entries, with how many they have at most in any situation. A
 * person reads a list top to bottom; past about thirty it no longer fits a 900 pixel window and the bottom is out of
 * sight. Exact, and only meant to go down: a longer list fails, and a shorter one fails until the line is updated.
 */
export const LONG_LISTS: Record<string, number> = {
  // Empty: Draw is 24, Animate 23 and Draw > Tools 27 at their longest. The rare things went into submenus, and Skeleton,
  // Artboards, Effects and Tiles went to a menu of their own (Extras).
};

/** Lists that are as long as the person's own things, which is content and not design. */
export const LISTS_OF_YOUR_THINGS = ['Draw > Saved brushes'];

/**
 * Everything under one top-level menu, submenus and all: how much a person has to read to know what is in it. Menus
 * over MAX_MENU_COMMANDS are listed with their count (their own saved brushes taken out). Exact, only meant to go down.
 */
export const BIG_MENUS: Record<string, number> = {
  // 169 before the Streaming menu was taken off the bar for somebody who does not stream. Stream-safe, going live with
  // OBS and the capture view help anybody who shares a screen, so they came back to View > Sharing your screen rather
  // than leaving with the rest. That is 16 more commands under View, and it is the price of that choice, not drift.
  View: 185,
  // Draw (199) and Animate (172) are under the cap since Skeleton, Artboards, Effects and Tiles got their own menu.
};

/**
 * What a person who does not stream has to wade through: the stream family (the Audience category, the OBS commands
 * and Stream capture) in each place it shows up, with every stream feature on (which is how Frameling starts). Exact.
 * Raising a number needs a reason written here. STREAM_LOAD_TUCKED, below, is the same count after "I do not stream".
 */
export const STREAM_LOAD = {
  /** Commands in the palette. 73: Save the Firebot setup file (streamdoor.firebotSetup). One command, because searching "firebot" or "import" has to find the thing that turns the three chat commands into one import and a key paste. It sits in the Actions door submenu beside Copy the key, which it needs. */
  /** Plus one since: How to get your viewers taking part (audience.start), the one page that walks from a Twitch channel to viewers voting. Somebody asking "how do I get my viewers to vote" finds it by that, in the palette, the Streaming menu and the top of the Streaming tab. */
  palette: 74,
  /** Commands in the menus (View holds all of them). 74, the same one command as the palette: the first entry of the Streaming menu. */
  menu: 74,
  /** Switches in Preferences > Features. */
  switches: 9,
  /** Help topics. 18 now: the chat commands guide is three topics (the route, Firebot, Streamer.bot), because the Streamer.bot one carries a whole C# script and a single topic would pass the 500 word limit. They are what lets viewers vote and guess at all (see the board doc bot-setup), so they are the one reason this went up. */
  /** 19: Getting your viewers taking part (viewers-take-part), the one page that walks the whole route, from a Twitch channel to a first vote. It goes with the gate commands, so it leaves when the streaming tools are tucked away. */
  help: 19,
};

/**
 * The same count for somebody who answered "I do not stream" (the first-run hello's Streaming it live card, or Quill's
 * one-time offer): the nine streaming features and the audience gate are tucked away. What is left is core, for anybody
 * who shares their screen: Stream-safe, the OBS link and the capture view. Exact, and it can only go down.
 */
export const STREAM_LOAD_TUCKED = { palette: 13, menu: 13, switches: 0, help: 2 };
