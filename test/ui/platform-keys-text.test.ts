import { describe, expect, it } from 'vitest';
import { platformKeysText } from '../../src/ui/keys';

describe('platformKeysText', () => {
  it('leaves text alone off a Mac', () => {
    const s = 'Press **Ctrl+S** (**Cmd+S** on a Mac). Alt+drag copies.';
    expect(platformKeysText(s, false)).toBe(s);
  });

  it('writes key shortcuts the Mac way and drops the Mac aside', () => {
    expect(platformKeysText('Press **Ctrl+S** (**Cmd+S** on a Mac). The first time...', true)).toBe('Press **⌘S**. The first time...');
    expect(platformKeysText('Press **Ctrl+O** (**Cmd+O**) and pick a file.', true)).toBe('Press **⌘O** and pick a file.');
    expect(platformKeysText('Make in-betweens (Ctrl+Shift+T)', true)).toBe('Make in-betweens (⇧⌘T)');
    expect(platformKeysText('Back to your drawing (Ctrl+Enter)', true)).toBe('Back to your drawing (⌘↩)');
    expect(platformKeysText('Open it with **Ctrl+,** or the menu', true)).toBe('Open it with **⌘,** or the menu');
    expect(platformKeysText('Alt+M mutes', true)).toBe('⌥M mutes');
  });

  it('names the keys for mouse moves and held keys', () => {
    expect(platformKeysText('Ctrl+click a bone, Alt+drag for a copy, Shift+click to add.', true)).toBe('Cmd+click a bone, Option+drag for a copy, Shift+click to add.');
    expect(platformKeysText('Hold **Alt** while dragging, or hold Ctrl and scroll', true)).toBe('Hold **Option** while dragging, or hold Cmd and scroll');
  });

  it('keeps plain mentions that explain the keys', () => {
    const s = '**Mod** means **Ctrl** on Windows and Linux, and **Cmd** on a Mac.';
    expect(platformKeysText(s, true)).toBe(s);
    expect(platformKeysText('Shift+T and Shift+click', true)).toBe('Shift+T and Shift+click');
  });
});
