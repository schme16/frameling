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
  // One more since the pixel brush (Alt+Shift+N), which like soft paint and charcoal works on pixel layers only: its dabs are pixels, and a vector shape cannot hold sharp pixels or a pixel picture tip. It could not share a slot with the Brush tool, which stays on the rail on a pixel layer too. The mode line over the rail names it, and picking it flips to a pixel layer.
  // One more since chalk and charcoal, which like the soft paint tools works on pixel layers only (paper tooth is pixels, not a vector shape).
  // Five more since soft paint: the Soft brush, Airbrush, Highlighter, Soft eraser and Smudge work on pixel layers only (a vector shape cannot fade at its edge). The mode line over the rail names them, and picking one flips to a pixel layer.
  railToolsVanish: { blank: 17, vector: 17, 'vector-selected': 17, pixel: 8, tilemap: 39, 'symbol-open': 17, playing: 17, 'has-clips': 17 } as Record<string, number>,
  /** The same tools leave the Draw menu, which lists only the ones that work on the current layer, with no grey and no note. */
  // Two more in every state but the pixel one since the Pixel menu went: it listed Shade and Dither all the time, and now they are only in the Tools menu's tool list, which shows the tools that work on the layer you are on, the same as the Wand and Slice. They are still on the pixel rail, and in the palette greyed with a reason on a vector layer. Tilemap goes 23 to 27 because on a tilemap layer the Pencil, Shade, Dither and Gradient all leave, where the Pixel menu showed them.
  menuCommandsVanish: { blank: 9, vector: 9, 'vector-selected': 9, pixel: 6, tilemap: 27, 'symbol-open': 9, playing: 9, 'has-clips': 9 } as Record<string, number>,
};

/**
 * Commands of an optional feature that no document situation and no feature state (test/findability/app.ts) ever turns
 * on, so the audit has never seen them work. Like the other lists here it can only shrink: add a state that makes the
 * command work and delete its line. Do not add a line to get a new command past the audit.
 */
export const NEVER_SEEN_WORKING: Record<string, string> = {
  // Empty: the tiles, rig, flow, particles and pixel text commands that were here are each on in a feature state now
  // (tile-picked, tile-open, rig-bent-layer, clip-picked, particles-selected, pixel-text-big in app.ts), and
  // test/findability/commands-run.test.ts runs every one of them there and checks something happened.
};

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
  // View > Panels is 32: it was at the cap of 30, and Position and size and Align and space out came out of Symbol and motion
  // to be Properties sections of their own, each with its own show-and-hide here like every other panel. The way down is for
  // the Panels list to fold the Properties sections into a submenu; that is a change to the menu layout, not to these two.
  'View > Panels': 32,
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
  // Two more for the pen, pencil and brush snapping: Snap to line ends and points, and Snap the pen, pencil and brush.
  // One more for Put the panels back, which sits beside Dock every window back under View > Panel windows and tools.
  // It is the panels' half of a pair the tool strip already had, so it is the price of matching them, not drift.
  // One more for the Scripts panel's show-and-hide, which sits in View > Panels with every other panel's. The scripts themselves are in Edit > Scripts, not here.
  // Two more for the show-and-hide of Position and size and of Align and space out, now sections of Properties of their own (see LONG_LISTS).
  // Ten more for the pixel view things that were in the Pixel menu, which is gone: the Zoom to a pixel size submenu (6), the Slices submenu (2, its panel is already in View > Panels) and the Preview's play and size controls (2, in More view tools). They are about looking at the canvas, so View is where they belong, and it is the price of removing a whole menu.
  View: 201,
  // The bar was split into Tools (id Draw), Layers (Layers and artboards), Animation, Rigging (id Extras) and Effects. Counts before -> after: Draw 146 -> 175, Layers (new) 65, Animate 120 -> 121, Extras 101 -> 51, Effects (new) 22, Pixel 88 -> gone. In all, 335 under the old Draw, Pixel and Extras became 313 under Tools, Layers, Rigging and Effects (a command that was in two of them is now counted once).
  // Draw is over the cap because it took in the Pixel menu's drawing things: the soft paint, chalk and charcoal submenu (30 commands), the palette submenu (12), and the pixel brush, gradient and text settings. The layer commands left it for Layers, which is why it is not higher. The soft paint family is the next thing to move out if Tools needs to shrink.
  Draw: 175,
};

/**
 * What a person who does not stream has to wade through: the stream family (the Audience category, the OBS commands
 * and Stream capture) in each place it shows up, with every stream feature on (which is how Frameling starts). Exact.
 * Raising a number needs a reason written here. STREAM_LOAD_TUCKED, below, is the same count after "I do not stream".
 */
export const STREAM_LOAD = {
  /** Commands in the palette. 73: Save the Firebot setup file (streamdoor.firebotSetup). One command, because searching "firebot" or "import" has to find the thing that turns the three chat commands into one import and a key paste. It sits in the Actions door submenu beside Copy the key, which it needs. */
  /** 74: Copy a test command for the actions door (streamdoor.copyTest), the one line that proves the address and key before anything is set up, so step 2 of the chat commands guide is one click instead of a hand-built curl. Searching "test", "curl" or "does it work" has to find it, and it sits beside Copy the address and Copy the key in the Actions door menu. */
  /** 75: How to get your viewers taking part (audience.start), the one page that walks from a Twitch channel to viewers voting. Somebody asking "how do I get my viewers to vote" finds it by that, in the palette, the Streaming menu and the top of the Streaming tab. */
  /** 76: What can your viewers see? (audience.view), the one answer that decides whether secret words, pulled prompts and unread chat words are covered. It has to be findable by a streamer who wants to change it, in the palette and in the Audience features menu, and it goes with the gate commands so it leaves when the streaming tools are tucked away. */
  /** 77: Stream control (streamboard.toggle), the window of buttons for a second screen. It is the one way to open the board, so it has to be in the palette and the Streaming menu, found by "stream control", "second screen" and "buttons". There is no second command: moving the buttons and putting them back are buttons inside the window. */
  /** 78: Try: Quill welcomes somebody new (quillreacts.welcome), the one way to see a welcome without waiting for somebody to follow. One command, not four: each press shows the next kind (a follower, a subscriber, a cheer, a raid), and Try it on a Twitch link shows any one. Searching "welcome", "greet" or "new follower" has to find it. */
  /** 79: Walk me through going live (audience.walk), the Go live quest. The route page is for reading and the quest is for doing it with the buttons rung and each part checked, and somebody who asks "how do I set up my stream" or "go live" has to find it in the palette, in the Streaming menu beside the route page, and on the Streaming tab. It goes with the gate commands so it leaves when the streaming tools are tucked away. */
  palette: 79,
  /** Commands in the menus (View holds all of them). 75, the same three commands as the palette: the two in the Actions door submenu and the first entry of the Streaming menu. */
  /** 76: the same command, in the Audience features menu next to the switch it belongs with. */
  /** 77: Stream control, in the Streaming menu with the audience switch and the card it sits beside. */
  /** 78: Try: Quill welcomes somebody new, in Try Quill reacting to chat beside the other Try commands. */
  /** 79: Walk me through going live, in the Streaming menu under How to get your viewers taking part. */
  menu: 79,
  /** Switches in Preferences > Features. */
  switches: 9,
  /** Help topics. 18 now: the chat commands guide is three topics (the route, Firebot, Streamer.bot), because the Streamer.bot one carries a whole C# script and a single topic would pass the 500 word limit. They are what lets viewers vote and guess at all (see the board doc bot-setup), so they are the one reason this went up. */
  /** 19: Getting your viewers taking part (viewers-take-part), the one page that walks the whole route, from a Twitch channel to a first vote. It goes with the gate commands, so it leaves when the streaming tools are tucked away. */
  /** 20: Covering secrets and unread words (cover-spoilers), the page that says what is covered, why, and how to tell Frameling what your viewers can see. It is the help of the new command and of the question. */
  /** 21: Stream control (stream-control), the page that says what the buttons are, how to move them, what stays covered and why. It is the help of the new command and goes with it when the streaming tools are tucked away. */
  /** 22: Quill welcomes new followers, subscribers, cheers and raids (quill-welcomes): what he does for each, why he asks before saying a name, what a crowd does, and that nothing is kept. It is the help of the command and of the "Names in welcomes" question, and it is where the privacy line about names lives. */
  help: 22,
};

/**
 * The same count for somebody who answered "I do not stream" (the first-run hello's Streaming it live card, or Quill's
 * one-time offer): the nine streaming features and the audience gate are tucked away. What is left is core, for anybody
 * who shares their screen: Stream-safe, the OBS link and the capture view. Exact, and it can only go down.
 */
export const STREAM_LOAD_TUCKED = { palette: 13, menu: 13, switches: 0, help: 2 };

/**
 * What a drawing with no animation (which is what Frameling opens to) has on offer, beside the same drawing with
 * animation on. The tucked-away part is the animation commands: they leave the menus on a still, stay in the command
 * search, and the one door in is Add animation. Exact, and only meant to go down. Raising a number needs a reason here.
 */
export const STILL_LOAD = {
  /** Palette: commands that work right now. Menu: commands in any menu. animateMenu: commands in the Animate menu. */
  still: { palette: 555, menu: 780, animateMenu: 8 },
  animated: { palette: 599, menu: 898, animateMenu: 123 },
};
