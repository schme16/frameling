// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/registry';
import { addBinding, allConflicts, buildKeymap, comboFromEvent, comboLabel, comboParts, conflictsFor, effectiveKeys, matchEvent, normaliseCombo, parseCombo, removeBinding, resetBindings, setBindings } from '../../src/ui/keys';
import { getPrefs, resetPrefs } from '../../src/ui/prefs';

const cmd = (id: string, keys?: string[]): Command => ({ id, label: id, category: 'Test', keys, run: () => {} });
const ev = (key: string, o: Partial<KeyboardEvent> = {}) => ({ key, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

beforeEach(() => resetPrefs());

describe('parsing and normalising', () => {
  it('reads combos in any spelling', () => {
    expect(normaliseCombo('ctrl+z')).toBe('Mod+z');
    expect(normaliseCombo('Mod+Shift+Z')).toBe('Mod+Shift+z');
    expect(normaliseCombo('Shift+Mod+z')).toBe('Mod+Shift+z');
    expect(normaliseCombo('Alt+Left')).toBe('Alt+ArrowLeft');
    expect(normaliseCombo('space')).toBe('Space');
    expect(normaliseCombo('f1')).toBe('F1');
    expect(normaliseCombo('esc')).toBe('Escape');
  });
  it('handles the plus key and symbols', () => {
    expect(normaliseCombo('Mod++')).toBe('Mod++');
    expect(normaliseCombo('Mod+=')).toBe('Mod+=');
    expect(normaliseCombo('Mod+,')).toBe('Mod+,');
    // Shift is implied by the symbol, so it drops out.
    expect(normaliseCombo('Shift+?')).toBe('?');
  });
  it('rejects rubbish', () => {
    expect(parseCombo('')).toBeNull();
    expect(parseCombo('Banana+z')).toBeNull();
    expect(normaliseCombo('Hyper+x')).toBe('');
  });
});

describe('matching events', () => {
  it('Mod is Ctrl off a Mac, and Cmd on one', () => {
    expect(matchEvent(ev('z', { ctrlKey: true }), 'Mod+Z', false)).toBe(true);
    expect(matchEvent(ev('z', { metaKey: true }), 'Mod+Z', false)).toBe(false);
    expect(matchEvent(ev('z', { metaKey: true }), 'Mod+Z', true)).toBe(true);
    expect(matchEvent(ev('z', { ctrlKey: true }), 'Mod+Z', true)).toBe(false);
  });
  it('Shift and Alt have to agree', () => {
    expect(matchEvent(ev('Z', { ctrlKey: true, shiftKey: true }), 'Mod+Shift+Z', false)).toBe(true);
    expect(matchEvent(ev('z', { ctrlKey: true }), 'Mod+Shift+Z', false)).toBe(false);
    expect(matchEvent(ev('Z', { ctrlKey: true, shiftKey: true }), 'Mod+Z', false)).toBe(false);
    expect(matchEvent(ev('ArrowLeft', { altKey: true }), 'Alt+ArrowLeft', false)).toBe(true);
  });
  it('a plain tool key does not fire with Ctrl held, and caps lock does not matter', () => {
    expect(matchEvent(ev('b'), 'b', false)).toBe(true);
    expect(matchEvent(ev('B'), 'b', false)).toBe(true);
    expect(matchEvent(ev('b', { ctrlKey: true }), 'b', false)).toBe(false);
  });
  it('symbols that need Shift still match', () => {
    expect(matchEvent(ev('+', { ctrlKey: true, shiftKey: true }), 'Mod++', false)).toBe(true);
    expect(matchEvent(ev('?', { shiftKey: true }), '?', false)).toBe(true);
  });
  it('reads the physical key when Alt changes the letter', () => {
    const c = comboFromEvent(ev('Ω', { altKey: true, metaKey: true, code: 'KeyZ' }), true);
    expect(c && `${c.mod}${c.alt}${c.key}`).toBe('truetruez');
  });
  it('ignores lone modifiers and the wrong platform key', () => {
    expect(comboFromEvent(ev('Shift', { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(ev('z', { metaKey: true }), false)).toBeNull();
    expect(comboFromEvent(ev('z', { ctrlKey: true }), true)).toBeNull();
  });
  it('Space matches Space', () => {
    expect(matchEvent(ev(' '), 'Space', false)).toBe(true);
  });
});

describe('shifted symbols', () => {
  it('Shift+, and < are the same shortcut', () => {
    expect(normaliseCombo('Shift+,')).toBe('<');
    expect(normaliseCombo('<')).toBe('<');
    expect(normaliseCombo('Shift+.')).toBe('>');
    expect(normaliseCombo('Mod+Shift+[')).toBe('Mod+{');
  });
  it('both spellings match Shift+Comma, whatever character the layout makes of it', () => {
    for (const binding of ['<', 'Shift+,']) {
      expect(matchEvent(ev('<', { shiftKey: true, code: 'Comma' }), binding, false)).toBe(true);
      expect(matchEvent(ev(';', { shiftKey: true, code: 'Comma' }), binding, false)).toBe(true);
      expect(matchEvent(ev(',', { code: 'Comma' }), binding, false)).toBe(false);
    }
    expect(matchEvent(ev('>', { shiftKey: true, code: 'Period' }), 'Shift+.', false)).toBe(true);
    expect(matchEvent(ev('>', { shiftKey: true, code: 'Period' }), '>', false)).toBe(true);
    expect(matchEvent(ev(',', { code: 'Comma' }), ',', false)).toBe(true);
  });
  it('Ctrl+Shift+[ works, and Ctrl+Shift+= is the plus key', () => {
    expect(matchEvent(ev('{', { ctrlKey: true, shiftKey: true, code: 'BracketLeft' }), 'Mod+Shift+[', false)).toBe(true);
    expect(matchEvent(ev('+', { ctrlKey: true, shiftKey: true, code: 'Equal' }), 'Mod++', false)).toBe(true);
    expect(matchEvent(ev('=', { ctrlKey: true, code: 'Equal' }), 'Mod+=', false)).toBe(true);
  });
  it('Shift+digit stays Shift+digit', () => {
    expect(matchEvent(ev('!', { shiftKey: true, code: 'Digit1' }), 'Shift+1', false)).toBe(true);
  });
  it('labels read naturally', () => {
    expect(comboLabel('<', false)).toBe('<');
    expect(comboLabel('Shift+,', false)).toBe('<');
    expect(comboLabel('Mod+Shift+[', false)).toBe('Ctrl+Shift+[');
    expect(comboLabel('Mod++', false)).toBe('Ctrl++');
  });
});

describe('labels', () => {
  it('PC labels', () => {
    expect(comboLabel('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(comboLabel('b', false)).toBe('B');
    expect(comboLabel('Alt+ArrowLeft', false)).toBe('Alt+←');
    expect(comboLabel('F1', false)).toBe('F1');
    expect(comboLabel('Space', false)).toBe('Space');
    expect(comboLabel('Mod+,', false)).toBe('Ctrl+,');
  });
  it('Mac labels', () => {
    expect(comboLabel('Mod+Shift+Z', true)).toBe('⇧⌘Z');
    expect(comboParts('Mod+Alt+K', true)).toEqual(['⌥', '⌘', 'K']);
    expect(comboLabel('Escape', true)).toBe('Esc');
  });
});

describe('overrides', () => {
  const undo = cmd('edit.undo', ['Mod+Z']);
  const redo = cmd('edit.redo', ['Mod+Shift+Z', 'Mod+Y']);
  const brush = cmd('tools.brush', ['b']);
  const none = cmd('x.none');

  it('uses the defaults until the person chooses', () => {
    expect(effectiveKeys(undo)).toEqual(['Mod+z']);
    expect(effectiveKeys(none)).toEqual([]);
  });
  it('an override replaces the defaults, and an empty one means no shortcut', () => {
    setBindings(redo, ['Mod+R']);
    expect(effectiveKeys(redo)).toEqual(['Mod+r']);
    setBindings(redo, []);
    expect(effectiveKeys(redo)).toEqual([]);
    expect(getPrefs().keymap['edit.redo']).toEqual([]);
  });
  it('going back to the defaults drops the override', () => {
    setBindings(brush, ['x']);
    expect(getPrefs().keymap['tools.brush']).toEqual(['x']);
    setBindings(brush, ['b']);
    expect(getPrefs().keymap['tools.brush']).toBeUndefined();
  });
  it('add, remove and reset', () => {
    addBinding(none, 'Mod+Q', [none]);
    expect(effectiveKeys(none)).toEqual(['Mod+q']);
    removeBinding(none, 'ctrl+q');
    expect(effectiveKeys(none)).toEqual([]);
    setBindings(undo, ['Mod+U']);
    resetBindings('edit.undo');
    expect(effectiveKeys(undo)).toEqual(['Mod+z']);
    setBindings(undo, ['Mod+U']);
    setBindings(brush, ['x']);
    resetBindings();
    expect(getPrefs().keymap).toEqual({});
  });
  it('builds a keymap that follows overrides', () => {
    const m = buildKeymap([undo, brush], { 'tools.brush': ['x'] });
    expect(m.get('Mod+z')?.[0]).toBe(undo);
    expect(m.get('x')?.[0]).toBe(brush);
    expect(m.has('b')).toBe(false);
  });
});

describe('conflicts', () => {
  const a = cmd('a', ['Mod+K']);
  const b = cmd('b', ['Mod+J']);
  const c = cmd('c', ['Mod+K']);
  it('finds the other commands using a shortcut', () => {
    expect(conflictsFor('ctrl+k', 'a', [a, b, c]).map((x) => x.id)).toEqual(['c']);
    expect(conflictsFor('Mod+Q', 'a', [a, b, c])).toEqual([]);
  });
  it('lists every shortcut that is shared', () => {
    const all = allConflicts([a, b, c], {});
    expect([...all.keys()]).toEqual(['Mod+k']);
    expect(all.get('Mod+k')?.map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('taking a shortcut removes it from the others', () => {
    addBinding(b, 'Mod+K', [a, b, c], true);
    expect(effectiveKeys(b)).toContain('Mod+k');
    expect(effectiveKeys(a)).toEqual([]);
    expect(effectiveKeys(c)).toEqual([]);
    expect(allConflicts([a, b, c]).size).toBe(0);
  });
});
