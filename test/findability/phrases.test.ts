// @vitest-environment jsdom
// The phrase table: plain sentences a real person would type into the command palette, each paired with what they
// were looking for. Every one must find it in the top three results, exactly as the palette would show them.
//
// This is the only test that measures findability from a person's own words. The other audits prove a command
// exists; this one proves somebody can get to it without knowing what Frameling calls it.
//
// Add a row every time anybody can't find something, including you. When one misses, fix it with a single-word
// keyword on the command (or a filler word in src/ui/palette.ts) rather than a multi-word one: "upside down" once
// failed where "upside" and "invert" both worked.
//
// A `wants` entry is a command id ("tools.eraser"), a help topic ("help:undo") or a setting ("setting:<row id>").
// Any one of them in the top three passes.
import { beforeAll, describe, expect, it } from 'vitest';
import { allCommands, getHelp, loadHelpBodies } from '../../src/core/registry';
import { isStaleCommand, syncDynamicCommands } from '../../src/ui/dynamic';
import { paletteItems, rankPalette, settingRows, withSettings, type PaletteItem } from '../../src/ui/palette';
import '../../src/renderer/features';

interface Phrase {
  /** What the person types. */
  say: string;
  /** What they were looking for: any of these in the top three passes. */
  wants: string[];
}

const P = (say: string, ...wants: string[]): Phrase => ({ say, wants });

export const PHRASES: Phrase[] = [
  // Drawing
  P('rub out', 'tools.eraser'),
  P('rubber', 'tools.eraser'),
  P('draw with a pencil', 'tools.pencil'),
  P('draw a straight line', 'tools.line'),
  P('draw a circle', 'tools.ellipse'),
  P('draw a square', 'tools.rect'),
  P('add some text', 'tools.text'),
  P('fill it in', 'tools.fill'),
  P('colour it in', 'tools.fill'),
  P('pick a colour', 'tools.eyedropper'),
  P('move the page around', 'tools.hand'),
  P('make a shadow', 'effects.add.shadow'),
  P('blur', 'effects.add.blur'),
  // Playing and timing
  P('make it play', 'timeline.play'),
  P('make it loop', 'timeline.toggleLoop'),
  P('add a frame', 'timeline.insertFrame'),
  P('see the frames before', 'timeline.toggleOnion'),
  P('bounce', 'motion.bounce'),
  P('make a character move', 'rig.addBones', 'help:rig'),
  P('add a puppet skeleton', 'rig.addBones'),
  P('make it snow', 'particles.add.snow'),
  // Moving things about
  P('turn it upside down', 'select.flipV', 'pixel.flipV', 'pixel.rotate180'),
  P('flip it upside down', 'select.flipV', 'pixel.flipV'),
  P('flip it', 'select.flipH', 'select.flipV'),
  P('select everything', 'select.all'),
  P('copy and paste', 'edit.copy', 'edit.paste', 'help:copy-paste'),
  P('undo that', 'edit.undo'),
  P('go back a step', 'edit.undo'),
  P('make a symbol', 'symbols.make'),
  // Layers
  P('add a new layer', 'layers.addVector', 'layers.addPixel'),
  P('hide a layer', 'layers.toggleVisible'),
  P('trace over a picture', 'layers.toggleReference', 'view.lightTable', 'file.importPicture'),
  // Files and sharing
  P('save my work', 'file.save'),
  P('open a file', 'file.open'),
  P('start a new drawing', 'file.new'),
  P('save a gif', 'file.export'),
  P('export a video', 'file.export'),
  P('import a picture', 'file.importPicture'),
  P('add sound', 'audio.import'),
  P('rename my drawing', 'help:document-name'),
  // Looking around
  P('zoom in', 'view.zoomIn'),
  P('fit to screen', 'view.fit'),
  P('show the grid', 'view.pixelGrid', 'view.gridSquare'),
  P('turn on dark mode', 'view.toggleTheme', 'view.themes', 'help:themes'),
  P('reset the layout', 'view.resetLayout'),
  P('lost my panel', 'view.allPanels', 'help:panels'),
  P('change the keyboard shortcuts', 'help.shortcuts', 'help:keyboard-shortcuts'),
  // Second batch
  P('draw with a brush', 'tools.brush'),
  P('cut this out', 'edit.cut'),
  P('delete this', 'edit.delete'),
  P('lock a layer', 'layers.toggleLocked'),
  P('put it on top of everything', 'arrange.front'),
  P('make a copy of this', 'edit.copy', 'edit.duplicate', 'layers.duplicate'),
  P('go to the next frame', 'timeline.nextFrame'),
  P('open an example', 'file.openExample'),
  P('get help', 'help.contents'),
  P('learn how to use it', 'quests.open', 'help.contents', 'help:quests'),
  P('import a gif', 'file.importPicture'),
  P('add confetti', 'particles.add.confetti'),
  P('colour picker', 'tools.eyedropper'),
  P('redo', 'edit.redo'),
  P('settings', 'view.preferences', 'view.searchSettings'),
  P('recover my work', 'file.recover'),
  P('change the size of my canvas', 'document.settings'),
  P('set the frame rate', 'document.settings'),
  P('start some pixel art', 'pixel.new'),
];

/**
 * Sentences that miss today, kept where everybody can see them. Each one is asserted to still miss, so the day somebody
 * fixes it the test says so and the row moves up into PHRASES. The number can only go down.
 */
export const KNOWN_MISSES: Phrase[] = [
  // The fill and stroke colour commands name "fill" and "colour" in their labels, which beats the paint bucket's synonyms.
  P('fill with colour', 'tools.fill'),
  // "Panels" starts with "pan", and a name that starts with the word outranks an exact synonym (the hand tool's "pan").
  P('pan', 'tools.hand'),
  // The twenty blend modes ("Soft light", "Hard light") are named with "light" and "mode" and outrank the theme switch.
  P('light mode', 'view.toggleTheme'),
];

let items: PaletteItem[] = [];
const top = (say: string): string[] =>
  withSettings(rankPalette(say, items, []), say)
    .slice(0, 3)
    .map((h) => (h.item.kind === 'command' ? h.item.id : `${h.item.kind}:${h.item.id}`));

beforeAll(async () => {
  await loadHelpBodies();
  // Tool and panel commands are made on demand; the real app has made them by the time anyone searches.
  syncDynamicCommands();
  items = paletteItems().filter((i) => !(i.kind === 'command' && isStaleCommand(i.id)));
});

describe('the phrase table', () => {
  it('has enough rows to mean something', () => expect(PHRASES.length).toBeGreaterThanOrEqual(25));

  it('only asks for things that exist, so a rename cannot turn a row into a quiet pass', () => {
    const ids = new Set(allCommands().map((c) => c.id));
    const settings = new Set(settingRows().map((r) => `setting:${r.id}`));
    const gone: string[] = [];
    for (const p of PHRASES) {
      const found = p.wants.some((w) => (w.startsWith('help:') ? !!getHelp(w.slice(5)) : w.startsWith('setting:') ? settings.has(w) : ids.has(w)));
      if (!found) gone.push(`${p.say} -> ${p.wants.join(' | ')}`);
    }
    expect(gone).toEqual([]);
  });

  it('uses no dashes in what people type', () => {
    for (const p of PHRASES) expect(p.say, p.say).not.toMatch(/—|–/);
  });

  it('finds what each sentence means in the top three', () => {
    const missed = PHRASES.filter((p) => !top(p.say).some((id) => p.wants.includes(id))).map((p) => `"${p.say}" wanted ${p.wants.join(' or ')}, got ${top(p.say).join(', ') || 'nothing'}`);
    expect(missed).toEqual([]);
  });

  it('keeps the known misses honest: each still misses, so a fixed one moves up into the table', () => {
    const fixed = KNOWN_MISSES.filter((p) => top(p.say).some((id) => p.wants.includes(id))).map((p) => p.say);
    expect(fixed).toEqual([]);
  });
});
