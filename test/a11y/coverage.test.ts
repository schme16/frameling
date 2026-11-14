// The accessibility check must fail when it looked at nothing: a panel that was not on the page used to count as a pass.
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { judgeCoverage } = require(path.join(__dirname, '../../scripts/lib/a11y-coverage.cjs')) as {
  judgeCoverage: (s: { name: string; missing?: boolean; examined?: number }[], o?: { panels?: string[]; full?: boolean; minPanels?: number; minElements?: number; skipped?: Record<string, string> }) => {
    problems: string[];
    notFound: string[];
    panelsListed: number;
    panelsExpected: number;
    panelsExamined: number;
  };
};

const panels = ['a', 'b', 'c'];
const both = (id: string, missing = false) => [{ name: `panel ${id}`, missing }, { name: `panel ${id} (selected)`, missing }];

describe('what counts as checked', () => {
  it('a full run where every panel was found is clean', () => {
    const r = judgeCoverage(panels.flatMap((p) => both(p)), { panels, full: true, minPanels: 3 });
    expect(r.problems).toEqual([]);
    expect(r.panelsExamined).toBe(3);
  });

  it('a panel that was not on the page fails the run, never passes it', () => {
    const r = judgeCoverage([...both('a'), ...both('b', true), ...both('c')], { panels, full: true, minPanels: 3 });
    expect(r.problems.length).toBe(2);
    expect(r.problems[0]).toContain('panel b');
    expect(r.panelsExamined).toBe(2);
  });

  it('this is the bug itself: most panels missing makes it fail, in numbers', () => {
    const r = judgeCoverage([...both('a'), ...both('b', true), ...both('c', true)], { panels, full: true, minPanels: 3 });
    expect(r.panelsExamined).toBe(1);
    expect(r.panelsExpected).toBe(3);
    expect(r.problems).not.toEqual([]);
  });

  it('a panel the app lists but no scenario ran for is caught on a full run', () => {
    const r = judgeCoverage(both('a'), { panels, full: true, minPanels: 3 });
    expect(r.problems.some((p) => p.includes('panel b: never checked'))).toBe(true);
  });

  it('a list that came back too short is caught, so an empty list cannot pass by checking nothing', () => {
    expect(judgeCoverage([], { panels: [], full: true }).problems[0]).toContain('only 0 panels');
  });

  it('a subset run (--only) judges only what it ran, but a missing target still fails', () => {
    expect(judgeCoverage(both('a'), { panels, full: false }).problems).toEqual([]);
    expect(judgeCoverage(both('a', true), { panels, full: false }).problems.length).toBe(2);
  });

  it('a panel that was there but held almost nothing for axe to judge fails too', () => {
    const thin = [{ name: 'panel a', examined: 1 }, { name: 'panel a (selected)', examined: 2 }, ...both('b'), ...both('c')];
    const r = judgeCoverage(thin, { panels, full: true, minPanels: 3 });
    expect(r.problems).toEqual(['panel a: axe judged only 2 elements, so it was effectively empty']);
    expect(judgeCoverage([{ name: 'panel a', examined: 1 }, { name: 'panel a (selected)', examined: 40 }], { panels: ['a'], minPanels: 1 }).problems).toEqual([]);
  });

  it('a dialog that never opened fails too', () => {
    expect(judgeCoverage([{ name: 'dialog about', missing: true }]).problems).toEqual(['dialog about: not on the page, so nothing was checked']);
  });

  it('a panel named in skipped, with a reason, is not expected', () => {
    const r = judgeCoverage([...both('a'), ...both('b')], { panels, full: true, minPanels: 3, skipped: { c: 'only floats' } });
    expect(r.problems).toEqual([]);
    expect(r.panelsExpected).toBe(2);
  });
});
