// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanValues, defaultValues, rememberedValues, rememberValues, sanitizeOptions } from '../../src/plugins/options';

const options = sanitizeOptions([
  { id: 'size', type: 'number', label: 'Size', min: 2, max: 10, step: 2, default: 4 },
  { id: 'mode', type: 'choice', label: 'Mode', choices: [{ value: 'a', label: 'A' }, 'b'], default: 'b' },
  { id: 'loud', type: 'switch', label: 'Loud' },
  { id: 'name', type: 'text', label: 'Name', default: 'hi', maxLength: 5 },
]);

describe('exporter options', () => {
  it('describes number, choice, switch and text, and drops what it does not know', () => {
    expect(options.map((o) => o.type)).toEqual(['number', 'choice', 'switch', 'text']);
    expect(sanitizeOptions([{ id: 'x', type: 'colour' }, { id: 'no spaces', type: 'switch' }, 'x', { id: 'c', type: 'choice', choices: [] }])).toEqual([]);
    expect(sanitizeOptions(Array.from({ length: 40 }, (_, i) => ({ id: `o${i}`, type: 'switch' }))).length).toBe(20);
  });

  it('starts from the defaults', () => {
    expect(defaultValues(options)).toEqual({ size: 4, mode: 'b', loud: false, name: 'hi' });
  });

  it('checks values: wrong kinds, out of range and unknown ones never reach the plugin', () => {
    expect(cleanValues(options, { size: 99, mode: 'zzz', loud: 'yes', name: 'abcdefgh', extra: 1 })).toEqual({ size: 10, mode: 'b', loud: false, name: 'abcde' });
    expect(cleanValues(options, { size: 5.3 }).size).toBe(6);
    expect(cleanValues(options, null)).toEqual(defaultValues(options));
    expect(cleanValues(options, { size: NaN }).size).toBe(4);
  });

  describe('remembered', () => {
    beforeEach(() => localStorage.clear());
    it('comes back next time, repaired against the options as they are now', () => {
      rememberValues('p', 'e', { size: 8, mode: 'a', loud: true, name: 'yo' });
      expect(rememberedValues('p', 'e', options)).toEqual({ size: 8, mode: 'a', loud: true, name: 'yo' });
      const newer = sanitizeOptions([{ id: 'size', type: 'number', min: 0, max: 5, default: 1 }, { id: 'fresh', type: 'switch', default: true }]);
      expect(rememberedValues('p', 'e', newer)).toEqual({ size: 5, fresh: true });
      expect(rememberedValues('other', 'e', options)).toEqual(defaultValues(options));
    });
  });
});
