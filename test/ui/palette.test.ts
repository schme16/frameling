// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Command, HelpTopic } from '../../src/core/registry';
import { keywordIsPhrase, nameIsTyped, nameShare, notNowMessage, paletteItems, rankPalette, scoreItem, STARTER_COMMANDS, STARTERS_UNTIL_RECENT } from '../../src/ui/palette';
import { editDistance, inOrder, scoreWord, wordsOf } from '../../src/ui/match';

const c = (id: string, label: string, extra: Partial<Command> = {}): Command => ({ id, label, category: 'Test', run: () => {}, ...extra });
const t = (id: string, title: string, summary = '', keywords: string[] = []): HelpTopic => ({ id, title, summary, body: summary, section: 'Basics', keywords });

const cmds = [
  c('timeline.toggleOnion', 'Onion skin', { category: 'Timeline', keywords: ['ghost', 'see through'], description: 'Show faint copies of nearby frames.' }),
  c('edit.undo', 'Undo', { category: 'Edit' }),
  c('edit.redo', 'Redo', { category: 'Edit' }),
  c('file.export', 'Export...', { category: 'File', description: 'Save a GIF, video or pictures.' }),
  c('view.toggleTheme', 'Switch dark or light', { category: 'View', keywords: ['night'] }),
  c('timeline.play', 'Play', { category: 'Timeline' }),
];
const helps = [t('onion-skin', 'Onion skin', 'See the frames around this one.'), t('exporting', 'Exporting', 'Share your animation.')];
const items = paletteItems(cmds, helps);
const top = (q: string, recent: string[] = []) => rankPalette(q, items, recent).map((h) => `${h.item.kind}:${h.item.id}`);

describe('matching helpers', () => {
  it('splits words', () => expect(wordsOf('Onion-skin, please!')).toEqual(['onion', 'skin', 'please']));
  it('counts a swap as one edit', () => expect(editDistance('opacity', 'opaicty')).toBe(1));
  it('finds letters in order', () => {
    expect(inOrder('onsk', 'onion skin')).toBe(true);
    expect(inOrder('xo', 'onion')).toBe(false);
  });
  it('scores exact above prefix above inside', () => {
    expect(scoreWord('skin', ['skin'])).toBeGreaterThan(scoreWord('ski', ['skin']));
    expect(scoreWord('ski', ['skin'])).toBeGreaterThan(scoreWord('kin', ['skin']));
    expect(scoreWord('zzz', ['skin'])).toBe(0);
  });
});

describe('ranking', () => {
  it('puts the command whose name starts with the query first, ahead of help', () => {
    expect(top('onion')[0]).toBe('command:timeline.toggleOnion');
    expect(top('onion')).toContain('help:onion-skin');
    expect(top('onion').indexOf('command:timeline.toggleOnion')).toBeLessThan(top('onion').indexOf('help:onion-skin'));
  });
  it('finds by keyword and description', () => {
    expect(top('ghost')[0]).toBe('command:timeline.toggleOnion');
    expect(top('night')[0]).toBe('command:view.toggleTheme');
    expect(top('gif')).toContain('command:file.export');
  });
  it('needs every word to match', () => {
    expect(top('onion banana')).toEqual([]);
    expect(top('dark light')).toEqual(['command:view.toggleTheme']);
  });
  it('forgives typos and missing letters', () => {
    expect(top('onoin')[0]).toBe('command:timeline.toggleOnion');
    expect(top('exprt')[0]).toBe('command:file.export');
  });
  it('is not case sensitive', () => expect(top('UNDO')[0]).toBe('command:edit.undo'));
  it('with nothing typed, recent commands come first, then every command by category', () => {
    const list = top('', ['file.export', 'edit.redo']);
    expect(list.slice(0, 2)).toEqual(['command:file.export', 'command:edit.redo']);
    expect(list).toHaveLength(cmds.length);
    expect(list.some((x) => x.startsWith('help:'))).toBe(false);
  });
  it('with nothing typed and nothing used yet, shows the starter commands first under "Try these"', () => {
    const starters = STARTER_COMMANDS.map((id) => c(id, id, { category: 'Zed' }));
    const its = paletteItems([c('add.camera', 'Add a camera', { category: 'Add' }), ...starters], []);
    const hits = rankPalette('', its, []);
    expect(hits.slice(0, STARTER_COMMANDS.length).map((h) => h.item.id)).toEqual(STARTER_COMMANDS);
    expect(hits.slice(0, STARTER_COMMANDS.length).every((h) => h.group === 'Try these')).toBe(true);
    expect(hits[STARTER_COMMANDS.length].item.id).toBe('add.camera');
  });
  it('starters give way as recent commands build up, and never repeat a recent one', () => {
    const starters = STARTER_COMMANDS.map((id) => c(id, id, { category: 'Zed' }));
    const its = paletteItems(starters, []);
    const few = rankPalette('', its, ['file.save']);
    expect(few[0]).toMatchObject({ group: 'Recent' });
    expect(few.map((h) => h.item.id).filter((id) => id === 'file.save')).toHaveLength(1);
    expect(few.some((h) => h.group === 'Try these')).toBe(true);
    const many = rankPalette('', its, STARTER_COMMANDS.slice(0, STARTERS_UNTIL_RECENT));
    expect(many.some((h) => h.group === 'Try these')).toBe(false);
  });
  it('scores zero for no match', () => expect(scoreItem('qqqq', items[0])).toBe(0));
});

describe('picking a command that cannot run', () => {
  it('says so, pointing at help when there is some', () => {
    expect(notNowMessage({ label: 'Make in-betweens (tween)', help: 'tweens' })).toBe('"Make in-betweens (tween)" can\'t be used right now. Its help page says what it needs.');
    expect(notNowMessage({ label: 'Do a thing' })).toMatch(/Try selecting something/);
  });
});

describe('doing beats reading', () => {
  it('a command with a word starting with the query outranks a help page whose title starts with it', () => {
    const its = paletteItems([c('view.themes', 'Choose themes...', { category: 'View' })], [t('themes', 'Themes', 'Pick the colours.')]);
    expect(rankPalette('theme', its, [])[0].item.id).toBe('view.themes');
  });
});

describe('filler words', () => {
  it('finds the command in a plain sentence', () => {
    expect(top('how do i make it play')[0]).toBe('command:timeline.play');
    expect(top('the undo')[0]).toBe('command:edit.undo');
  });
});

describe('plain names beat specialised ones, and a phrase somebody chose beats a lucky word', () => {
  const typed = (q: string) => wordsOf(q);
  it('counts how much of a name was typed, in order, the last word may be half typed', () => {
    expect(nameShare('Open...', typed('open'))).toBe(1);
    expect(nameShare('Open Aseprite file...', typed('open'))).toBeCloseTo(1 / 3);
    expect(nameShare('Make a reusable symbol', typed('make a symbol'))).toBe(0.75);
    expect(nameShare('Rectangle', typed('rect'))).toBe(1);
    expect(nameShare('Square grid', typed('draw a square'))).toBe(0);
    expect(nameShare('Blend mode: Burn dark (Colour burn)', typed('dark mode'))).toBe(0);
  });
  it('knows a whole name typed inside a sentence, and ignores the words in brackets', () => {
    expect(nameIsTyped('Open...', typed('open a file'))).toBe(true);
    expect(nameIsTyped('Next frame', typed('go to the next frame'))).toBe(true);
    expect(nameIsTyped('Add shadow (Drop shadow)', typed('add shadow'))).toBe(true);
    expect(nameIsTyped('Open Aseprite file...', typed('open a file'))).toBe(false);
  });
  it('knows a keyword phrase typed in any order, and wants at least two words of it', () => {
    expect(keywordIsPhrase(['rub out', 'rubber'], typed('rub out'))).toBe(true);
    expect(keywordIsPhrase(['add layer'], typed('add a new layer'))).toBe(true);
    expect(keywordIsPhrase(['rubber'], typed('rubber'))).toBe(false);
    expect(keywordIsPhrase(['dark mode'], typed('dark'))).toBe(false);
  });
  it('puts the plain command ahead of the one with extra words in its name', () => {
    const list = paletteItems([c('file.open', 'Open...', { category: 'File', keywords: ['file'] }), c('file.openAseprite', 'Open Aseprite file...', { category: 'File' }), c('file.exportProres', 'Export ProRes video...', { category: 'File' }), c('file.export', 'Export...', { category: 'File', keywords: ['video'] })], []);
    const ids = (q: string) => rankPalette(q, list, []).map((h) => h.item.id);
    expect(ids('open a file')[0]).toBe('file.open');
    expect(ids('export a video')[0]).toBe('file.export');
    expect(ids('prores')[0]).toBe('file.exportProres');
  });
  it('lets a keyword phrase lift a command above its help page', () => {
    const list = paletteItems([c('tools.fill', 'Paint bucket', { category: 'Tools', keywords: ['fill in'] })], [t('fill', 'Fill', 'Colour a shape in.')]);
    expect(rankPalette('fill it in', list, []).map((h) => h.item.id)[0]).toBe('tools.fill');
  });
  it('says draw means a tool and my means your', () => {
    const list = paletteItems([c('view.gridSquare', 'Square grid', { category: 'View' }), c('tools.rect', 'Rectangle', { category: 'Tools', keywords: ['square'] })], [t('document-name', 'Naming your drawing', '', ['rename']), t('other', 'Drawing tips', '', ['rename'])]);
    expect(rankPalette('draw a square', list, []).map((h) => h.item.id)[0]).toBe('tools.rect');
    expect(rankPalette('rename my drawing', list, []).map((h) => h.item.id)[0]).toBe('document-name');
  });
});
