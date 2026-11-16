// The history behind every exact number in known-gaps.ts. One entry per number, one row each time it changed: the day,
// the number from then on, and the reason in words. The last row has to equal the number in known-gaps.ts, and a row
// that goes up needs a sentence that says why it is worth the weight. test/findability/ledger.test.ts enforces both and
// its failure message prints the row to add, so nobody has to remember the rule.
//
// To change a number: change it in known-gaps.ts, then add a row here. If it is going UP, first ask whether something
// can come out instead, because a ledger that only ever rises has stopped doing its job.
import type { History } from './ledger-logic';

const D = '2026-11-16';
const BASE = 'Baseline when the ratchet was built, taken from the number as it stood; the earlier steps are in the comments in known-gaps.ts.';

export const HISTORY: History = {
  'CEILINGS.railToolsVanish.blank': [{ on: D, n: 17, why: BASE }],
  'CEILINGS.railToolsVanish.vector': [{ on: D, n: 17, why: BASE }],
  'CEILINGS.railToolsVanish.vector-selected': [{ on: D, n: 17, why: BASE }],
  'CEILINGS.railToolsVanish.pixel': [{ on: D, n: 8, why: BASE }],
  'CEILINGS.railToolsVanish.tilemap': [{ on: D, n: 39, why: BASE }],
  'CEILINGS.railToolsVanish.symbol-open': [{ on: D, n: 17, why: BASE }],
  'CEILINGS.railToolsVanish.playing': [{ on: D, n: 17, why: BASE }],
  'CEILINGS.railToolsVanish.has-clips': [{ on: D, n: 17, why: BASE }],
  'CEILINGS.menuCommandsVanish.blank': [{ on: D, n: 9, why: BASE }],
  'CEILINGS.menuCommandsVanish.vector': [{ on: D, n: 9, why: BASE }],
  'CEILINGS.menuCommandsVanish.vector-selected': [{ on: D, n: 9, why: BASE }],
  'CEILINGS.menuCommandsVanish.pixel': [{ on: D, n: 6, why: BASE }],
  'CEILINGS.menuCommandsVanish.tilemap': [{ on: D, n: 27, why: BASE }],
  'CEILINGS.menuCommandsVanish.symbol-open': [{ on: D, n: 9, why: BASE }],
  'CEILINGS.menuCommandsVanish.playing': [{ on: D, n: 9, why: BASE }],
  'CEILINGS.menuCommandsVanish.has-clips': [{ on: D, n: 9, why: BASE }],
  'LONG_LISTS.View > Panels': [
    { on: D, n: 30, why: 'View > Panels was at the cap of 30 before Position and size and Align and space out became Properties sections of their own.' },
    { on: D, n: 32, why: 'Position and size and Align and space out each need a show-and-hide like every other panel, and the way down is a Properties submenu, which is a menu layout change for another day.' },
  ],
  'BIG_MENUS.View': [
    { on: D, n: 185, why: 'Start of 16 November: the count before that day\'s changes (see the view-menu-ledger card for each step).' },
    { on: D, n: 187, why: 'Drawing-tool snapping added two entries to View > Snapping: Snap to line ends and points, and Snap the pen, pencil and brush.' },
    { on: D, n: 188, why: 'Put the panels back, beside Dock every window back, the panels\' half of a pair the tool strip already had (this rise had no reason written at the time).' },
    { on: D, n: 189, why: 'The Scripts panel\'s show-and-hide, which sits in View > Panels with every other panel\'s.' },
    { on: D, n: 191, why: 'Position and size and Align and space out became Properties sections of their own, each with a show-and-hide in View > Panels.' },
    { on: D, n: 201, why: 'The Pixel menu went, so its ten view things (zoom to a pixel size 6, slices 2, the Preview\'s play and size 2) came to View, where looking at the canvas belongs.' },
    { on: D, n: 157, why: 'view-ledger: entries a control on screen already does left the menu and stayed in the palette (snapping ticks, tool builder rows, grid and perspective settings, Notes and Marks buttons, a panel\'s right-click menu), and Reset layout joined Put the panels back.' },
  ],
  'BIG_MENUS.Draw': [
    { on: D, n: 146, why: 'Start of 16 November: Tools (the Draw menu) before it took in the Pixel menu\'s drawing things.' },
    { on: D, n: 175, why: 'The menu bar reshape: Tools absorbed the old Pixel menu\'s drawing things, the soft paint, chalk and charcoal submenu (30), the palette submenu (12) and the pixel brush and text.' },
    { on: D, n: 146, why: 'view-ledger: the soft paint family (30 commands) got a Soft paint menu of its own, because it is one family that only works on a pixel layer, so Tools is back under its cap of 150.' },
  ],
  'STREAM_LOAD.palette': [{ on: D, n: 79, why: BASE }],
  'STREAM_LOAD.menu': [{ on: D, n: 79, why: BASE }],
  'STREAM_LOAD.switches': [{ on: D, n: 9, why: BASE }],
  'STREAM_LOAD.help': [{ on: D, n: 22, why: BASE }],
  'STREAM_LOAD_TUCKED.palette': [{ on: D, n: 13, why: BASE }],
  'STREAM_LOAD_TUCKED.menu': [{ on: D, n: 13, why: BASE }],
  'STREAM_LOAD_TUCKED.switches': [{ on: D, n: 0, why: BASE }],
  'STREAM_LOAD_TUCKED.help': [{ on: D, n: 2, why: BASE }],
  'STILL_LOAD.still.palette': [
    { on: D, n: 558, why: 'Baseline when the ratchet was built, taken from the number as it stood; the earlier steps are in the comments in known-gaps.ts.' },
    { on: D, n: 557, why: 'view-ledger: Reset layout joined Put the panels back, one command fewer in the palette on both sides, so the gap to a drawing with animation is unchanged.' },
  ],
  'STILL_LOAD.still.menu': [
    { on: D, n: 782, why: 'Baseline when the ratchet was built, taken from the number as it stood; the earlier steps are in the comments in known-gaps.ts.' },
    { on: D, n: 738, why: 'view-ledger: 44 View entries left the menus for the palette (a control on screen does each one\'s job), on both sides, so the gap to a drawing with animation is unchanged.' },
  ],
  'STILL_LOAD.still.animateMenu': [{ on: D, n: 8, why: BASE }],
  'STILL_LOAD.animated.palette': [
    { on: D, n: 602, why: 'Baseline when the ratchet was built, taken from the number as it stood; the earlier steps are in the comments in known-gaps.ts.' },
    { on: D, n: 601, why: 'view-ledger: Reset layout joined Put the panels back, one command fewer in the palette on both sides, so the gap to a still is unchanged.' },
  ],
  'STILL_LOAD.animated.menu': [
    { on: D, n: 900, why: 'Baseline when the ratchet was built, taken from the number as it stood; the earlier steps are in the comments in known-gaps.ts.' },
    { on: D, n: 856, why: 'view-ledger: 44 View entries left the menus for the palette (a control on screen does each one\'s job), on both sides, so the gap to a still is unchanged.' },
  ],
  'STILL_LOAD.animated.animateMenu': [{ on: D, n: 123, why: BASE }],
};
