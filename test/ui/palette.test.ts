// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Command, HelpTopic } from '../../src/core/registry';
import { notNowMessage, paletteItems, rankPalette, scoreItem, STARTER_COMMANDS, STARTERS_UNTIL_RECENT } from '../../src/ui/palette';
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
