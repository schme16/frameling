// @vitest-environment jsdom
// The phrase table: plain sentences a real person would type into the command palette, each paired with what they
// were looking for. Every one must find it in the top three results, exactly as the palette would show them, and
// FIRST unless the row is written down in known-ranked-behind.ts: a right answer with wrong ones above it still
// makes a person read past them, and a test that accepts that lets the palette get worse while staying green.
//
// This is the only test that measures findability from a person's own words. The other audits prove a command
// exists; this one proves somebody can get to it without knowing what Frameling calls it.
//
// Add a row every time anybody can't find something, including you. When one misses, fix it with a single-word
// keyword on the command (or a filler word in src/ui/palette.ts) rather than a multi-word one: "upside down" once
// failed where "upside" and "invert" both worked.
//
// A `wants` entry is a command id ("tools.eraser"), a help topic ("help:undo") or a setting ("setting:<row id>").
// Any one of them counts as right.
import { beforeAll, describe, expect, it } from 'vitest';
import { allCommands, getHelp, loadHelpBodies } from '../../src/core/registry';
import { isStaleCommand, syncDynamicCommands } from '../../src/ui/dynamic';
import { audience } from '../../src/audience';
import { paletteItems, rankPalette, settingRows, withSettings, type PaletteItem } from '../../src/ui/palette';
import { RANKED_BEHIND, EVERYDAY_WORDS, CROWDED_WORDS, STREAM_WORDS } from './known-ranked-behind';
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
  P('text on a path', 'text.onPath'),
  P('curved text', 'text.onPath'),
  P('bend text', 'text.onPath'),
  P('put words round a circle', 'text.onPath', 'help:text-on-path'),
  P('name round a badge', 'text.onPath'),
  P('words along a wave', 'text.onPath', 'help:text-on-path'),
  P('straighten text', 'text.offPath'),
  P('rub out', 'tools.eraser'),
  P('rubber', 'tools.eraser'),
  P('draw with a pencil', 'tools.pencil'),
  P('draw a straight line', 'tools.line'),
  P('draw a circle', 'tools.ellipse'),
  P('draw a square', 'tools.rect'),
  P('shape builder', 'tools.shape-builder'),
  P('make a crescent', 'tools.shape-builder', 'shapes.cut'),
  P('delete the overlap', 'tools.shape-builder', 'shapes.overlap'),
  P('join overlapping shapes', 'tools.shape-builder', 'shapes.join'),
  P('add some text', 'tools.text'),
  P('fill it in', 'tools.fill'),
  P('pick a colour', 'tools.eyedropper'),
  P('move the page around', 'tools.hand'),
  P('make a shadow', 'effects.add.shadow'),
  P('blur', 'effects.add.blur'),
  // Repeating a shape
  P('repeat a shape', 'help:repeat', 'repeat.grid', 'repeat.ring', 'repeat.mirror'),
  P('make a pattern', 'help:repeat', 'repeat.grid', 'repeat.ring'),
  P('rows and columns of copies', 'repeat.grid'),
  P('circular pattern', 'repeat.ring'),
  P('put copies round a circle', 'repeat.ring'),
  P('petals round a middle', 'repeat.ring'),
  P('mirror a shape', 'repeat.mirror'),
  P('make it symmetrical', 'repeat.mirror', 'pixel.mirror'),
  P('stop repeating', 'repeat.off'),
  P('edit one of the copies', 'repeat.expand'),
  // Playing and timing
  P('make it play', 'timeline.play'),
  P('make it loop', 'timeline.toggleLoop'),
  P('add a frame', 'timeline.insertFrame'),
  // Animation is something a drawing asks for, and Frameling opens to a still picture: all of these have to find the door.
  P('i want to animate', 'animation.add'),
  P('add animation', 'animation.add'),
  P('turn on animation', 'animation.add'),
  P('timeline', 'animation.add', 'view.panel.timeline'),
  P('show the timeline', 'animation.add', 'view.panel.timeline'),
  P('make a flipbook', 'animation.add'),
  P('frames', 'animation.add'),
  P('can i set the fps', 'animation.add', 'document.settings'),
  P('see the frames before', 'timeline.toggleOnion'),
  P('bounce', 'motion.bounce'),
  P('make a character move', 'rig.addBones', 'help:rig'),
  P('add a puppet skeleton', 'rig.addBones'),
  P('make it snow', 'particles.add.snow'),
  // Moving things about
  P('turn it upside down', 'select.flipV', 'pixel.flipV', 'pixel.rotate180'),
  P('flip it upside down', 'select.flipV', 'pixel.flipV'),
  P('select everything', 'select.all'),
  P('copy and paste', 'edit.copy', 'edit.paste', 'help:copy-paste'),
  P('undo that', 'edit.undo'),
  P('go back a step', 'edit.undo'),
  P('make a symbol', 'symbols.make'),
  // Layers
  P('add a new layer', 'layers.addVector', 'layers.addPixel'),
  P('hide a layer', 'layers.toggleVisible'),
  P('trace over a picture', 'layers.toggleReference', 'view.lightTable', 'file.importPicture', 'file.importReference', 'reference.place', 'reference.paste'),
  // Files and sharing
  P('save my work', 'file.save'),
  P('open a file', 'file.open'),
  P('start a new drawing', 'file.new'),
  P('save a gif', 'file.export'),
  P('export a video', 'file.export'),
  P('import a picture', 'file.importPicture', 'file.openPicture', 'file.importReference'),
  P('add sound', 'audio.import'),
  P('rename my drawing', 'help:document-name'),
  // Looking around
  P('zoom in', 'view.zoomIn'),
  P('fit to screen', 'view.fit'),
  P('show the grid', 'view.pixelGrid', 'view.gridSquare'),
  P('turn on dark mode', 'view.toggleTheme', 'view.themes', 'help:themes'),
  P('reset the layout', 'view.panelsReset'),
  // Things that left a menu for the palette (src/ui/paletteFirst.ts) have to be found by the words people use for them.
  P('snap to the grid', 'view.snap.grid'),
  P('isometric grid', 'view.gridIso'),
  P('one point perspective', 'view.perspective1'),
  P('next note', 'notes.next'),
  P('draw an arrow', 'marks.arrow'),
  P('rename this panel', 'view.renamePanel'),
  P('make the tool buttons bigger', 'view.toolSize.large', 'view.toolbarBuilder'),
  P('lost my panel', 'view.allPanels', 'help:panels'),
  P('change the keyboard shortcuts', 'help.shortcuts', 'help:keyboard-shortcuts'),
  // Second batch
  P('draw with a brush', 'tools.brush'),
  P('cut this out', 'edit.cut'),
  P('delete this', 'edit.delete'),
  P('lock a layer', 'layers.toggleLocked'),
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
  // Streaming and sharing: the family that arrived in one day, asked the way a person would say it
  P('go live', 'audience.walk', 'stream.obsLink', 'help:obs-golive'),
  P('walk me through setting up my stream', 'audience.walk'),
  P('set up my stream step by step', 'audience.walk'),
  P('hide my file name', 'view.streamSafe', 'help:stream-safe'),
  P('record a timelapse', 'timelapse.record'),
  P('show only my drawing', 'capture.toggle', 'help:stream-capture'),
  P('stop trolls', 'audience.kill'),
  P('ask my audience', 'votes.start', 'help:votes'),
  P('let chat vote', 'votes.start', 'help:votes'),
  P('send to a friend', 'file.sendCopy', 'help:send-a-copy'),
  // One row per streaming feature, said the way somebody who has never seen the feature would say it
  P('let viewers dare me', 'dares.list', 'help:dares'),
  P('pull a random prompt', 'promptjar.pull', 'help:prompt-jar'),
  P('connect twitch', 'twitch.connect', 'help:twitch'),
  P('make my pen shaky', 'penmods.try.shaky', 'penmods.list', 'help:pen-modifiers'),
  P('obs overlay', 'streamoverlay.settings', 'help:stream-overlay'),
  P('use a stream deck', 'streamdoor.settings', 'help:actions-door'),
  P('make quill cheer', 'quillreacts.cheer', 'help:quill-reacts'),
  // The way out for somebody who does not stream: one command that tucks the whole family away, and one that brings it back.
  P('hide stream features', 'features.streamingOff'),
  P('i never stream', 'features.streamingOff'),
  P('bring back the stream tools', 'features.streamingOn'),
  // The streamer's own words keep working while audience features are off, as they start
  P('test the overlay', 'streamoverlay.test'),
  P('overlay settings', 'streamoverlay.settings'),
  P('obs settings', 'stream.obsSettings'),
  P('stream settings', 'streamoverlay.settings', 'streamdoor.settings', 'stream.obsSettings'),
  P('try a dare', 'dares.list', ...allCommands().filter((c) => c.id.startsWith('dares.try.')).map((c) => c.id)),
  P('put the dares back', 'dares.stop'),
  P('stop the audience', 'audience.kill'),
  // The one answer behind every cover: what the viewers can see, so secret words and chat's unread words stay covered
  P('what can my viewers see', 'audience.view', 'help:cover-spoilers'),
  P('hide the secret word from chat', 'audience.view', 'help:cover-spoilers'),
  P('stop rude prompts showing on stream', 'audience.view', 'help:cover-spoilers'),
  // "play" is not in the command's name, so it is a keyword: the palette needs every word
  P('play a guessing game', 'guess.start', 'help:guess'),
  P('put it on top of everything', 'arrange.front'),
  P('stop streaming', 'features.streamingOff', 'audience.kill', 'help:audience'),
  // Ordinary words find ordinary things first: these used to put three stream settings ahead of Preferences
  P('preferences', 'view.preferences'),
  P('test my pen', 'pen.check', 'help:pen-check'),
  // These were known misses until the palette learned to prefer a plain name over a specialised one.
  P('pan', 'tools.hand'),
  P('light mode', 'view.toggleTheme'),
  P('colour it in', 'tools.fill'),
  P('flip it', 'select.flipH', 'select.flipV'),
  P('turn off stream stuff', 'features.streamingOff'),
  // Scripts lives in the bottom drawer; a long one wants a window of its own.
  P('write some code', 'scripts.open', 'scripts.new', 'help:scripts'),
  P('scripts in a bigger window', 'scripts.window', 'scripts.open'),
];

/**
 * Sentences that miss today, kept where everybody can see them. Each one is asserted to still miss, so the day somebody
 * fixes it the test says so and the row moves up into PHRASES. The number can only go down.
 */
export const KNOWN_MISSES: Phrase[] = [
  // The fill and stroke colour commands name "fill" and "colour" in their labels, which beats the paint bucket's synonyms.
  P('fill with colour', 'tools.fill'),
];

let items: PaletteItem[] = [];
const ranked = (say: string, n: number): string[] =>
  withSettings(rankPalette(say, items, []), say)
    .slice(0, n)
    .map((h) => (h.item.kind === 'command' ? h.item.id : `${h.item.kind}:${h.item.id}`));
const top = (say: string): string[] => ranked(say, 3);
/** Where the first right answer sits, 1 for the top, or 0 when it is not in the first ten. */
const rankOf = (p: Phrase): number => ranked(p.say, 10).findIndex((id) => p.wants.includes(id)) + 1;

beforeAll(async () => {
  await loadHelpBodies();
  // Tool and panel commands are made on demand; the real app has made them by the time anyone searches.
  syncDynamicCommands();
  items = paletteItems().filter((i) => !(i.kind === 'command' && isStaleCommand(i.id)));
});

// The words anybody types. While audience features are off (they start off) none of these may be led by the streaming
// family: it used to put three stream settings ahead of Preferences for "settings", and eight dares in the top ten for "test".
const ORDINARY = ['settings', 'test', 'stop', 'preferences', 'check', 'reset', 'show', 'hide', 'clear', 'new', 'play', 'options', 'list', 'copy'];
const streamy = (id: string): boolean => /^(audience|streamdoor|streamoverlay|twitch|promptjar|votes|guess|quillreacts|dares|penmods|stream\.obs)/.test(id);

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

  it('puts the right answer FIRST, unless the row is written down as ranked behind wrong ones', () => {
    const behind = PHRASES.map((p) => ({ p, rank: rankOf(p) })).filter((x) => x.rank !== 1);
    const unwritten = behind.filter((x) => !(x.p.say in RANKED_BEHIND)).map((x) => `"${x.p.say}" is ${x.rank || 'past 10th'}: ${ranked(x.p.say, Math.max(x.rank, 3)).join(' | ')}`);
    expect(unwritten, 'wrong answers outrank the right one: fix the keywords, or write the row into known-ranked-behind.ts').toEqual([]);
  });

  it('the ranked-behind list is exact: a row that moved up, or slipped down, says so here', () => {
    const now = (say: string) => rankOf(PHRASES.find((p) => p.say === say)!);
    const stale = Object.entries(RANKED_BEHIND).filter(([say]) => !PHRASES.some((p) => p.say === say)).map(([say]) => say);
    expect(stale, 'not in the phrase table any more: delete the line').toEqual([]);
    const moved = Object.entries(RANKED_BEHIND).filter(([say, e]) => now(say) !== e.rank).map(([say, e]) => `"${say}" is ${now(say) || 'past 10th'} now, the list says ${e.rank}: ${now(say) > e.rank || now(say) === 0 ? 'it got worse' : 'it got better, update the line (delete it at 1)'}`);
    expect(moved).toEqual([]);
  });

  it('keeps the known misses honest: each still misses, so a fixed one moves up into the table', () => {
    const fixed = KNOWN_MISSES.filter((p) => top(p.say).some((id) => p.wants.includes(id))).map((p) => p.say);
    expect(fixed).toEqual([]);
  });

  it('does not let the streaming family lead ordinary words while audience features are off', () => {
    expect(audience.isOn()).toBe(false);
    const led = ORDINARY.filter((w) => top(w).some(streamy)).map((w) => `${w}: ${top(w).join(', ')}`);
    expect(led).toEqual([]);
  });

  it('puts Preferences ahead of every stream setting for "settings", and no stream command above it', () => {
    const ids = withSettings(rankPalette('settings', items, []), 'settings')
      .slice(0, 12)
      .map((h) => (h.item.kind === 'command' ? h.item.id : ''));
    const at = ids.indexOf('view.preferences');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(ids.slice(0, at).filter(streamy)).toEqual([]);
  });

  it('lets the family lead again once audience features are on, because then a streamer is probably after it', () => {
    audience.setOn(true);
    try {
      expect(top('test')).toContain('streamoverlay.test');
      expect(top('settings').some(streamy)).toBe(true);
    } finally {
      audience.setOn(false);
    }
  });
});

describe('crowding: a plain word is not answered by a feature you are not using', () => {
  // The words a person says before they know what anything is called. For each one that is not the stream family's own
  // word (stream, obs, vote, twitch...), at most one of the top five may be a stream command. Otherwise "settings",
  // "test" and "address" show the actions door, the overlay and OBS to somebody who only wants to draw. The family is
  // the Audience category, the OBS commands (stream.*) and Stream capture (capture.*).
  const inFamily = (id: string): boolean => {
    const c = allCommands().find((x) => x.id === id);
    return !!c && (c.category === 'Audience' || /^(stream|capture)\./.test(c.id));
  };
  const crowd = (word: string): string[] => (STREAM_WORDS.includes(word) ? [] : ranked(word, 5).filter(inFamily));

  it('there are enough words to mean something', () => expect(EVERYDAY_WORDS.length).toBeGreaterThanOrEqual(25));

  it('no plain word lets more than one stream command into its top five, except the known ones', () => {
    const over = EVERYDAY_WORDS.filter((w) => crowd(w).length > 1 && !(w in CROWDED_WORDS)).map((w) => `${w}: ${crowd(w).join(', ')}`);
    expect(over, 'a plain word is showing somebody stream features they did not ask for: fix the keywords').toEqual([]);
  });

  it('the crowded-word list is exact: a word that is clear now is deleted, and one that got worse is caught', () => {
    const stale = Object.keys(CROWDED_WORDS).filter((w) => crowd(w).length <= 1);
    expect(stale, 'no longer crowded: delete the line').toEqual([]);
    const moved = Object.entries(CROWDED_WORDS).filter(([w, n]) => crowd(w).length !== n.count).map(([w, n]) => `${w}: ${crowd(w).length} now, the list says ${n.count}`);
    expect(moved).toEqual([]);
  });
});
