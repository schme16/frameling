import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../src/templates';
import { isBlankDoc, sizeLabel } from '../../src/ui/presets';

describe('blank starters on the welcome sheet', () => {
  const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.make()]));

  it('only the blank templates count as blank', () => {
    const blank = TEMPLATES.filter((t) => isBlankDoc(byId[t.id])).map((t) => t.id);
    expect(blank).toEqual(['blank-vector', 'blank-pixel']);
  });

  it('labels sizes like the size cards do', () => {
    expect(sizeLabel(byId['blank-vector'])).toBe('1280 x 720');
    expect(sizeLabel(byId['blank-pixel'])).toBe('32 x 32 pixels');
  });
});
