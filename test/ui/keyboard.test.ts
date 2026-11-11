// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerCommand, registerTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import { dispatchKey, holdKeyboard, installKeyboard, isTypingTarget, resetKeyboard } from '../../src/ui/keyboard';
import { closePalette, overlays, openPrefs, closePrefs } from '../../src/ui/overlays';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { effectiveKeys } from '../../src/ui/keys';

let ran: string[] = [];
const press = (key: string, o: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o });
  target.dispatchEvent(e);
  return dispatchKey(e);
};

beforeEach(() => {
  ran = [];
  resetPrefs();
  resetKeyboard();
  resetStore(newDoc());
  closePalette();
  closePrefs();
  registerCommand({ id: 't.plain', label: 'Plain', category: 'Test', keys: ['Mod+J'], run: () => void ran.push('plain') });
  registerCommand({ id: 't.global', label: 'Global', category: 'Test', keys: ['Mod+G'], global: true, run: () => void ran.push('global') });
  registerCommand({ id: 't.off', label: 'Off', category: 'Test', keys: ['Mod+H'], enabled: () => false, run: () => void ran.push('off') });
  registerCommand({ id: 't.single', label: 'Single', category: 'Test', keys: ['q'], run: () => void ran.push('single') });
  registerCommand({ id: 't.move', label: 'Move', category: 'Test', keys: ['Mod+M'], run: () => void ran.push('move') });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('keyboard dispatcher', () => {
  it('runs the command for a shortcut and stops the browser getting it', () => {
    const e = new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, cancelable: true });
    expect(dispatchKey(e)).toBe(true);
    expect(ran).toEqual(['plain']);
    expect(e.defaultPrevented).toBe(true);
  });
  it('does nothing for keys nobody uses', () => {
    expect(press('z', { shiftKey: true, altKey: true })).toBe(false);
    expect(ran).toEqual([]);
  });
  it('does not run disabled commands', () => {
    press('h', { ctrlKey: true });
    expect(ran).toEqual([]);
  });
  it('follows the person own shortcuts', () => {
    setPrefs({ keymap: { 't.single': ['w'] } });
    press('q');
    expect(ran).toEqual([]);
    press('w');
    expect(ran).toEqual(['single']);
  });
  it('typing in a field only fires global commands', () => {
    const input = document.createElement('input');
    document.body.append(input);
    press('q', {}, input);
    press('j', { ctrlKey: true }, input);
    expect(ran).toEqual([]);
    press('g', { ctrlKey: true }, input);
    expect(ran).toEqual(['global']);
  });
  it('knows what counts as typing', () => {
    const mk = (tag: string, type?: string) => {
      const el = document.createElement(tag);
      if (type) (el as HTMLInputElement).type = type;
      return el;
    };
    expect(isTypingTarget(mk('input', 'text'))).toBe(true);
    expect(isTypingTarget(mk('input', 'search'))).toBe(true);
    expect(isTypingTarget(mk('textarea'))).toBe(true);
    expect(isTypingTarget(mk('input', 'checkbox'))).toBe(false);
    expect(isTypingTarget(mk('button'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
  });
  it('while a big dialog is open only global commands work', () => {
    openPrefs();
    press('j', { ctrlKey: true });
    expect(ran).toEqual([]);
    press('g', { ctrlKey: true });
    expect(ran).toEqual(['global']);
    expect(overlays.get().prefs).not.toBeNull();
  });
  it('a held Space blocks everything until it is let go', () => {
    expect(press(' ')).toBe(false);
    expect(press('q')).toBe(false);
    expect(press('j', { ctrlKey: true })).toBe(false);
    expect(ran).toEqual([]);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    // The window-level keyup handler is only attached by installKeyboard.
    const off = installKeyboard();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    off();
    press('q');
    expect(ran).toEqual(['single']);
  });
  it('stays quiet while the shortcut recorder is listening', () => {
    const release = holdKeyboard();
    expect(press('q')).toBe(false);
    release();
    expect(press('q')).toBe(true);
  });
  it('gives every tool a `tools.<id>` command with its key, picked up lazily', () => {
    registerTool({ id: 'zap', label: 'Zap', icon: 'sparkle', key: 'x', layers: ['vector', 'pixel'] });
    expect(press('x')).toBe(true);
    expect(store().get().ui.tool).toBe('zap');
  });
  it('respects a tool switch that the layer kind forbids', () => {
    registerTool({ id: 'pixonly', label: 'Pix', icon: 'pixel', key: 'y', layers: ['pixel'] });
    press('y');
    expect(store().get().ui.tool).not.toBe('pixonly');
  });
  it('a disabled command leaves the key alone, so the next binding or the browser gets it', () => {
    registerCommand({ id: 't.nudge', label: 'Nudge', category: 'Test', keys: ['ArrowLeft'], enabled: () => false, run: () => void ran.push('nudge') });
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    expect(dispatchKey(e)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    registerCommand({ id: 't.step', label: 'Step', category: 'Test', keys: ['ArrowLeft'], run: () => void ran.push('step') });
    expect(press('ArrowLeft')).toBe(true);
    expect(ran).toEqual(['step']);
  });
  it('never binds a bare Space', () => {
    registerCommand({ id: 't.space', label: 'Space', category: 'Test', keys: ['Space'], run: () => void ran.push('space') });
    expect(press(' ')).toBe(false);
    expect(effectiveKeys({ id: 't.space', keys: ['Space', 'Mod+Space'] })).toEqual(['Mod+Space']);
  });
  it('leaves keys alone when something else already handled them', () => {
    const e = new KeyboardEvent('keydown', { key: 'q', cancelable: true });
    e.preventDefault();
    expect(dispatchKey(e)).toBe(false);
    expect(ran).toEqual([]);
  });
});
