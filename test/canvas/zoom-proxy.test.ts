import { describe, expect, it, vi } from 'vitest';
import { giveUp, MAX_CATCH_UP_MS, MAX_SLICES, overviewSize, visibleSlice } from '../../src/canvas/zoomProxy';
import { mayBuild, runProgressive, runSliced, slicing, unitBegin, unitEnd } from '../../src/core/slice';

describe('overviewSize', () => {
  it('keeps the stage shape at about one screen of pixels', () => {
    const o = overviewSize(1920, 1080, 1400, 900);
    expect(o.w / o.h).toBeCloseTo(1920 / 1080, 1);
    expect(o.w * o.h).toBeLessThanOrEqual(1400 * 900 * 1.01);
    expect(o.w * o.h).toBeGreaterThan(1400 * 900 * 0.95);
  });
  it('never goes past four million pixels, however big the screen', () => {
    const o = overviewSize(1920, 1080, 7680, 4320);
    expect(o.w * o.h).toBeLessThanOrEqual(4_000_000 * 1.01);
  });
  it('is never empty', () => {
    expect(overviewSize(0, 0, 0, 0)).toEqual({ w: 1, h: 1 });
  });
});

describe('visibleSlice', () => {
  const screen = { w: 1400, h: 900 };
  const src = { w: 1000, h: 500 };
  it('maps the screen back to the part of the picture it shows', () => {
    // The picture stretched 100 times and moved so its middle is under the screen's middle.
    const rect = { x: 700 - 50_000, y: 450 - 25_000, w: 100_000, h: 50_000 };
    const v = visibleSlice(rect, src, screen)!;
    expect(v.dx).toBe(0);
    expect(v.dy).toBe(0);
    expect(v.dw).toBe(1400);
    expect(v.dh).toBe(900);
    expect(v.sx).toBeCloseTo(500 - 7, 5);
    expect(v.sw).toBeCloseTo(14, 5);
    expect(v.sy).toBeCloseTo(250 - 4.5, 5);
    expect(v.sh).toBeCloseTo(9, 5);
  });
  it('is the whole picture when it lies inside the screen', () => {
    const v = visibleSlice({ x: 100, y: 50, w: 500, h: 250 }, src, screen)!;
    expect(v).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 500, dx: 100, dy: 50, dw: 500, dh: 250 });
  });
  it('is null when none of it shows', () => {
    expect(visibleSlice({ x: 2000, y: 0, w: 500, h: 250 }, src, screen)).toBeNull();
    expect(visibleSlice({ x: -600, y: 0, w: 500, h: 250 }, src, screen)).toBeNull();
  });
});

describe('giveUp', () => {
  it('lets catch-up run a while and then stops it', () => {
    expect(giveUp(1, 20)).toBe(false);
    expect(giveUp(MAX_SLICES, 20)).toBe(true);
    expect(giveUp(3, MAX_CATCH_UP_MS)).toBe(true);
  });
});

describe('runSliced', () => {
  it('builds freely outside a sliced run', () => {
    expect(slicing()).toBe(false);
    expect(mayBuild()).toBe(true);
    expect(mayBuild()).toBe(true);
  });

  it('always lets the first picture be built, so every run moves on', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    let first = false;
    const done = runSliced(8, () => {
      now.mockReturnValue(5000); // the time is already spent
      first = mayBuild();
    });
    expect(first).toBe(true);
    expect(done).toBe(true);
    now.mockRestore();
  });

  it('cuts the run short once the time is spent and says so', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    const answers: boolean[] = [];
    const done = runSliced(8, () => {
      answers.push(mayBuild()); // 1000: first
      now.mockReturnValue(1005);
      answers.push(mayBuild()); // inside the 8 ms
      now.mockReturnValue(1009);
      answers.push(mayBuild()); // spent
      answers.push(mayBuild()); // stays spent
    });
    expect(answers).toEqual([true, true, false, false]);
    expect(done).toBe(false);
    expect(slicing()).toBe(false);
    now.mockRestore();
  });

  it('leaves nothing sliced behind when the drawing throws', () => {
    expect(() =>
      runSliced(8, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(slicing()).toBe(false);
    expect(mayBuild()).toBe(true);
  });
});

describe('runProgressive', () => {
  // What drawDrawing does for each shape, with the draw itself a log line.
  const drawAll = (log: number[], n: number) => () => {
    for (let i = 0; i < n; i++) {
      const u = unitBegin();
      if (u === 'skip') continue;
      if (u === 'stop') return;
      try {
        log.push(i);
      } finally {
        unitEnd();
      }
    }
  };

  it('is a plain draw outside a run', () => {
    expect(unitBegin()).toBe('draw');
    unitEnd();
  });

  it('draws every unit once across runs, in order, however the time falls', () => {
    const now = vi.spyOn(performance, 'now');
    let t = 0;
    now.mockImplementation(() => (t += 3)); // each look at the clock costs 3 ms: a slow machine
    const log: number[] = [];
    let from = 0;
    let runs = 0;
    for (; runs < 100; runs++) {
      const r = runProgressive(8, from, drawAll(log, 20));
      from = r.done;
      if (r.complete) break;
    }
    now.mockRestore();
    expect(log).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(runs).toBeGreaterThan(1);
    expect(runs).toBeLessThan(100);
  });

  it('always does at least one unit per run, so a run that is already out of time still moves on', () => {
    const now = vi.spyOn(performance, 'now');
    const log: number[] = [];
    // Time is spent from the start: one unit per run.
    let t = 1000;
    now.mockImplementation(() => (t += 50));
    let from = 0;
    let runs = 0;
    while (runs < 50) {
      const r = runProgressive(8, from, drawAll(log, 5));
      runs++;
      from = r.done;
      if (r.complete) break;
    }
    now.mockRestore();
    expect(log).toEqual([0, 1, 2, 3, 4]);
    expect(runs).toBe(5);
  });

  it('counts a nested draw inside a unit as part of it', () => {
    const log: string[] = [];
    const draw = () => {
      for (let i = 0; i < 3; i++) {
        const u = unitBegin();
        if (u === 'skip') continue;
        if (u === 'stop') return;
        try {
          log.push('unit' + i);
          const inner = unitBegin(); // a symbol's own drawing
          expect(inner).toBe('draw');
          log.push('inner' + i);
          unitEnd();
        } finally {
          unitEnd();
        }
      }
    };
    const r = runProgressive(1000, 0, draw);
    expect(r).toEqual({ done: 3, complete: true });
    expect(log).toEqual(['unit0', 'inner0', 'unit1', 'inner1', 'unit2', 'inner2']);
    expect(runProgressive(1000, 2, () => { log.length = 0; draw(); }).done).toBe(3);
    expect(log).toEqual(['unit2', 'inner2']);
  });
});
