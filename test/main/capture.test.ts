// The capture view's logic: sizes, colours, the window name, and how the window is opened and swapped on the desktop side
// (Electron swapped for stand-ins, as in popout.test.ts).
import { describe, expect, it } from 'vitest';
import {
  BACKGROUNDS,
  CAPTURE_SIZES,
  CAPTURE_TITLE,
  FALLBACK_BACKGROUND,
  backgroundColour,
  isHexColour,
  readOpen,
  readSize,
  safeBackground,
  sameCapture,
  sameOpen,
  sizeOf,
  windowTitle,
  windowUnits,
  SECOND_WINDOW,
  type OpenOpts,
} from '../../src/popout/capture';
import { createPopout, fixedBounds, type Place, type PopoutDeps, type PopoutWindow, type WindowEvents } from '../../src/main/popout';
import { sameLook } from '../../src/popout/mirror';
import type { Look } from '../../src/popout/protocol';

describe('sizes', () => {
  it('offers the common capture sizes', () => {
    const ids = CAPTURE_SIZES.map((s) => s.id);
    for (const id of ['1920x1080', '1280x720', '2560x1440', '3840x2160', '1080x1080', '1080x1920']) expect(ids).toContain(id);
  });
  it('every id says its own size, and every label shows it', () => {
    for (const s of CAPTURE_SIZES) {
      expect(s.id).toBe(`${s.width}x${s.height}`);
      expect(s.label).toContain(`${s.width} x ${s.height}`);
      expect(sizeOf(s.id)).toEqual({ width: s.width, height: s.height });
    }
  });
  it('free and anything unknown mean no fixed size', () => {
    expect(sizeOf('free')).toBeNull();
    expect(sizeOf('banana')).toBeNull();
    expect(sizeOf('')).toBeNull();
  });
  it('reads a size from a page only when it is sane', () => {
    expect(readSize({ width: 1920.4, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    for (const bad of [null, 5, 'x', {}, { width: 10, height: 1080 }, { width: 1920, height: 99999 }, { width: NaN, height: 1080 }, { width: '1920', height: '1080' }]) {
      expect(readSize(bad)).toBeNull();
    }
  });
  it('turns pixels into window units for the screen scale', () => {
    expect(windowUnits({ width: 1920, height: 1080 }, 1)).toEqual({ width: 1920, height: 1080 });
    expect(windowUnits({ width: 1920, height: 1080 }, 2)).toEqual({ width: 960, height: 540 });
    expect(windowUnits({ width: 1920, height: 1080 }, 1.5)).toEqual({ width: 1280, height: 720 });
    expect(windowUnits({ width: 1920, height: 1080 }, 0)).toEqual({ width: 1920, height: 1080 });
    expect(windowUnits({ width: 1920, height: 1080 }, NaN)).toEqual({ width: 1920, height: 1080 });
  });
  it('a fixed size keeps the saved spot and replaces the size', () => {
    expect(fixedBounds({ x: 10, y: 20, width: 500, height: 400 }, { width: 1920, height: 1080 }, 1)).toEqual({ x: 10, y: 20, width: 1920, height: 1080 });
    expect(fixedBounds({ width: 500, height: 400 }, { width: 1920, height: 1080 }, 2)).toEqual({ width: 960, height: 540 });
  });
});

describe('colours', () => {
  it('has a chroma key green, and every colour is a plain hex', () => {
    expect(BACKGROUNDS.green).toBe('#00b140');
    for (const c of Object.values(BACKGROUNDS)) expect(isHexColour(c)).toBe(true);
  });
  it('maps an answer to its colour, and an unknown answer to the key green', () => {
    expect(backgroundColour('white')).toBe('#ffffff');
    expect(backgroundColour('dark')).toBe(BACKGROUNDS.dark);
    expect(backgroundColour('nope')).toBe(FALLBACK_BACKGROUND);
  });
  it('trusts only #rrggbb from a page', () => {
    expect(safeBackground('#00FF00')).toBe('#00ff00');
    for (const bad of ['red', '#fff', 'url(x)', '#00ff00; background: red', 5, null, undefined, '']) expect(safeBackground(bad)).toBe(FALLBACK_BACKGROUND);
    expect(safeBackground('nope', '#123456')).toBe('#123456');
  });
  it('compares looks by value', () => {
    expect(sameCapture({ bg: '#000000', hideCursor: true }, { bg: '#000000', hideCursor: true })).toBe(true);
    expect(sameCapture({ bg: '#000000', hideCursor: true }, { bg: '#000000', hideCursor: false })).toBe(false);
    expect(sameCapture(null, undefined)).toBe(true);
    expect(sameCapture(null, { bg: '#000000', hideCursor: true })).toBe(false);
  });
  it('a change of colour or cursor is a change of look, so the window is told', () => {
    const base: Look = { name: '', frame: 0, playing: false, activeLayerId: null, camera: false, marks: false, theme: { dark: true, bg: '#000', text: '#fff', muted: '#888', accent: '#a0f', raised: '#222' } };
    expect(sameLook({ ...base, capture: { bg: '#00b140', hideCursor: true } }, { ...base, capture: { bg: '#00b140', hideCursor: true } })).toBe(true);
    expect(sameLook({ ...base, capture: { bg: '#00b140', hideCursor: true } }, { ...base, capture: { bg: '#ffffff', hideCursor: true } })).toBe(false);
    expect(sameLook(base, { ...base, capture: { bg: '#00b140', hideCursor: true } })).toBe(false);
  });
});

describe('the window name', () => {
  const secrets = ['/home/me/Documents/My Secret Film.fling', 'C:\\Users\\me\\Pictures\\client-work.fling', 'My Secret Film', 'client-work.fling'];
  it('never contains the drawing name or path in the capture view', () => {
    for (const s of secrets) {
      const t = windowTitle(true, s);
      expect(t).toBe(CAPTURE_TITLE);
      expect(t).not.toContain(s);
      expect(t).not.toMatch(/Secret|client|Users|home|\.fling|[\\/]/);
    }
  });
  it('the plain second window keeps the drawing name', () => {
    expect(windowTitle(false, 'My Film')).toBe('My Film - second window');
  });
});

describe('what is asked of the desktop side', () => {
  it('anything missing or odd means the plain second window', () => {
    for (const bad of [undefined, null, 'capture', 5, {}, { capture: 'yes' }, { capture: false, size: { width: 1920, height: 1080 } }]) expect(readOpen(bad)).toEqual(SECOND_WINDOW);
  });
  it('reads a capture request, cleaning the size and colour', () => {
    expect(readOpen({ capture: true, size: { width: 1920, height: 1080 }, background: '#00B140' })).toEqual({ capture: true, size: { width: 1920, height: 1080 }, background: '#00b140' });
    expect(readOpen({ capture: true, size: { width: 5, height: 5 }, background: 'red' })).toEqual({ capture: true, size: null, background: FALLBACK_BACKGROUND });
    expect(readOpen({ capture: true })).toEqual({ capture: true, size: null, background: FALLBACK_BACKGROUND });
  });
  it('tells a changed kind or size from a changed colour (which needs no new window)', () => {
    const a: OpenOpts = { capture: true, size: { width: 1920, height: 1080 }, background: '#00b140' };
    expect(sameOpen(a, { ...a, background: '#ffffff' })).toBe(true);
    expect(sameOpen(a, { ...a, size: null })).toBe(false);
    expect(sameOpen(a, { ...a, size: { width: 1280, height: 720 } })).toBe(false);
    expect(sameOpen(a, SECOND_WINDOW)).toBe(false);
  });
});

class FakeWindow implements PopoutWindow {
  dead = false;
  ports: unknown[] = [];
  raised = 0;
  applied: OpenOpts[] = [];
  at: Place = { x: 10, y: 10, width: 900, height: 600 };
  constructor(
    public events: WindowEvents,
    public opts: OpenOpts,
  ) {}
  alive = () => !this.dead;
  apply = (o: OpenOpts) => void this.applied.push(o);
  raise = () => void this.raised++;
  close = () => {
    if (this.dead) return;
    this.dead = true;
    this.events.closed();
  };
  place = () => (this.dead ? null : this.at);
  sendPort = (p: unknown) => void this.ports.push(p);
}

function setup(places: { capture?: Place; second?: Place } = {}) {
  const log = { made: [] as FakeWindow[], toMain: [] as { port: unknown; capture: boolean }[], told: 0, saved: [] as { p: Place; capture: boolean }[], loads: [] as boolean[], channels: 0 };
  const deps: PopoutDeps = {
    create: (_b, events, opts) => {
      const w = new FakeWindow(events, opts);
      log.made.push(w);
      return w;
    },
    channel: () => ({ a: `a${++log.channels}`, b: `b${log.channels}` }),
    toMain: (port, capture) => void log.toMain.push({ port, capture }),
    tellClosed: () => void log.told++,
    loadPlace: (capture) => {
      log.loads.push(capture);
      return (capture ? places.capture : places.second) ?? null;
    },
    savePlace: (p, capture) => void log.saved.push({ p, capture }),
    screens: () => [{ x: 0, y: 0, width: 1920, height: 1080 }],
  };
  return { pop: createPopout(deps), log, last: () => log.made[log.made.length - 1] };
}

const CAP: OpenOpts = { capture: true, size: null, background: '#00b140' };
const FIXED: OpenOpts = { capture: true, size: { width: 1920, height: 1080 }, background: '#00b140' };

describe('the capture view window', () => {
  it('opens with the capture options, and links the drawing window as a capture view', () => {
    const { pop, log, last } = setup();
    pop.open(CAP);
    expect(last().opts).toEqual(CAP);
    last().events.loaded();
    expect(log.toMain).toEqual([{ port: 'a1', capture: true }]);
  });
  it('the plain second window links as not capture', () => {
    const { pop, log, last } = setup();
    pop.open();
    last().events.loaded();
    expect(log.toMain[0].capture).toBe(false);
  });
  it('keeps its own place, apart from the second window', () => {
    const { pop, log } = setup({ capture: { x: 5, y: 5, width: 800, height: 450 } });
    pop.open(CAP);
    expect(log.loads).toEqual([true]);
  });
  it('asking again with another size resizes it in place, without a new window', () => {
    const { pop, log, last } = setup();
    pop.open(CAP);
    last().events.loaded();
    pop.open(FIXED);
    expect(log.made).toHaveLength(1);
    expect(last().applied).toEqual([FIXED]);
    expect(last().raised).toBe(1);
    pop.open(FIXED);
    expect(last().applied).toHaveLength(1);
  });
  it('asking for the capture view when the second window is open swaps the window, once', () => {
    const { pop, log, last } = setup();
    pop.open();
    last().events.loaded();
    last().at = { x: 100, y: 100, width: 700, height: 500 };
    const first = last();
    pop.open(CAP);
    expect(first.dead).toBe(true);
    expect(log.made).toHaveLength(2);
    expect(log.saved).toEqual([{ p: { x: 100, y: 100, width: 700, height: 500 }, capture: false }]);
    // The old window going is not news to the drawing window, which is about to be linked to the new one.
    expect(log.told).toBe(0);
    expect(pop.isOpen()).toBe(true);
    last().events.loaded();
    expect(log.toMain.map((t) => t.capture)).toEqual([false, true]);
  });
  it('and back again', () => {
    const { pop, log, last } = setup();
    pop.open(CAP);
    last().events.loaded();
    pop.open();
    expect(log.made).toHaveLength(2);
    expect(last().opts.capture).toBe(false);
    last().events.loaded();
    expect(log.toMain[log.toMain.length - 1].capture).toBe(false);
  });
  it('saves a closed capture view under the capture place', () => {
    const { pop, log, last } = setup();
    pop.open(CAP);
    last().events.loaded();
    last().at = { x: 1, y: 2, width: 800, height: 450 };
    pop.close();
    expect(log.saved).toEqual([{ p: { x: 1, y: 2, width: 800, height: 450 }, capture: true }]);
    expect(log.told).toBe(1);
  });
  it('a reload of the drawing window keeps the kind', () => {
    const { pop, log, last } = setup();
    pop.open(CAP);
    last().events.loaded();
    pop.mainReloaded();
    expect(log.toMain.map((t) => t.capture)).toEqual([true, true]);
  });
});
