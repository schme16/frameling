// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Command, HelpTopic } from '../../src/core/registry';
import { paletteItems, rankPalette, scoreItem } from '../../src/ui/palette';
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
  it('scores zero for no match', () => expect(scoreItem('qqqq', items[0])).toBe(0));
});
