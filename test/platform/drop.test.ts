import { describe, expect, it } from 'vitest';
import { sortDropped } from '../../src/platform/drop';

describe('files dropped on the web page', () => {
  it('opens drawings and leaves pictures and Aseprite files to their own handlers', () => {
    expect(sortDropped(['a.frameling', 'b.FLPLAY', 'c.png', 'd.aseprite', 'e.json', 'f.txt', 'g.pdf'])).toEqual({ drawings: ['a.frameling', 'b.FLPLAY'], others: ['f.txt', 'g.pdf'] });
    expect(sortDropped([])).toEqual({ drawings: [], others: [] });
  });
});
