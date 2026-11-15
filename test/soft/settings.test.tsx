// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanSoft, DEFAULT_SOFT, FLOW_RANGE, SIZE_RANGE } from '../../src/soft/settings';
import { edgeNote } from '../../src/soft/Options';
import { SOFT_SPECS } from '../../src/soft/tools';
import { getTool } from '../../src/core/registry';

describe('soft paint settings', () => {
  it('start from the defaults when nothing is saved', () => {
    expect(cleanSoft(null)).toEqual(DEFAULT_SOFT);
    expect(cleanSoft('nonsense')).toEqual(DEFAULT_SOFT);
  });

  it('keep what was saved, held inside the limits', () => {
    const s = cleanSoft({ tools: { airbrush: { size: 9999, hardness: -3, flow: 7 }, smudge: { size: 20, flow: 0.5 } }, holdBuilds: false });
    expect(s.tools.airbrush).toEqual({ size: SIZE_RANGE.max, hardness: 0, flow: FLOW_RANGE.max });
    expect(s.tools.smudge.size).toBe(20);
    expect(s.tools.smudge.hardness).toBe(DEFAULT_SOFT.tools.smudge.hardness);
    expect(s.holdBuilds).toBe(false);
  });

  it('ignore a value of the wrong kind', () => {
    const s = cleanSoft({ tools: { airbrush: { size: 'big', flow: null } }, holdBuilds: 'yes' });
    expect(s.tools.airbrush.size).toBe(DEFAULT_SOFT.tools.airbrush.size);
    expect(s.tools.airbrush.flow).toBe(DEFAULT_SOFT.tools.airbrush.flow);
    expect(s.holdBuilds).toBe(true);
  });
});

describe('the soft edge note', () => {
  it('says plainly why the edge is dithered, and says nothing when it is smooth', () => {
    expect(edgeNote(true, false, 'smooth', 'airbrush')).toMatch(/palette/);
    expect(edgeNote(false, true, 'crisp', 'airbrush')).toMatch(/Pixel perfect/);
    expect(edgeNote(false, true, 'smooth', 'airbrush')).toBeNull();
    expect(edgeNote(false, false, 'crisp', 'airbrush')).toBeNull();
    expect(edgeNote(true, false, 'crisp', 'smudge')).toMatch(/moves whole pixels/);
  });

  it('has no em dashes', () => {
    for (const k of ['airbrush', 'smudge'] as const) expect(edgeNote(true, true, 'crisp', k)).not.toMatch(/[–—]/);
  });
});

describe('the soft paint tools', () => {
  it('are pixel layer tools, so a vector layer never offers them', () => {
    for (const s of SOFT_SPECS) {
      const t = getTool(s.kind);
      expect(t, s.kind).toBeDefined();
      expect(t!.layers).toEqual(['pixel']);
      expect(t!.help).toBe('soft-paint');
    }
  });
});
