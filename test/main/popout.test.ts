// The picture window's rules on the desktop side, with Electron swapped for stand-ins: it opens once, comes back where it
// was (or somewhere sensible when that screen is gone), and every way of going away leaves nothing behind.
import { describe, expect, it } from 'vitest';
import { createPopout, openBounds, readPlace, DEFAULT_SIZE, MIN_SIZE, type Place, type PopoutDeps, type PopoutWindow, type WindowEvents } from '../../src/main/popout';

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };
const SECOND = { x: 1920, y: 0, width: 1920, height: 1080 };

class FakeWindow implements PopoutWindow {
  dead = false;
  ports: unknown[] = [];
  raised = 0;
  at: Place = { x: 10, y: 10, width: 900, height: 600 };
  constructor(public events: WindowEvents) {}
  alive = () => !this.dead;
  raise = () => void this.raised++;
  close = () => {
    if (this.dead) return;
    this.events.placed(this.at);
    this.dead = true;
    this.events.closed();
  };
  place = () => (this.dead ? null : this.at);
  /** The person drags or resizes it. */
  move = (p: Place) => {
    this.at = p;
    this.events.placed(p);
  };
  sendPort = (p: unknown) => void this.ports.push(p);
}

function setup(saved: Place | null = null, screens = [SCREEN]) {
  const log = { made: [] as FakeWindow[], toMain: [] as unknown[], told: 0, saved: [] as Place[], bounds: [] as unknown[], channels: 0 };
  const deps: PopoutDeps = {
    create: (bounds, events) => {
      log.bounds.push(bounds);
      const w = new FakeWindow(events);
      log.made.push(w);
      return w;
    },
    channel: () => ({ a: `a${++log.channels}`, b: `b${log.channels}` }),
    toMain: (p) => void log.toMain.push(p),
    tellClosed: () => void log.told++,
    loadPlace: () => saved,
    savePlace: (p) => void log.saved.push(p),
    screens: () => screens,
  };
  const pop = createPopout(deps);
  return { pop, log, last: () => log.made[log.made.length - 1] };
}

describe('opening', () => {
  it('makes a window, and links the two pages once the picture window has loaded', () => {
    const { pop, log, last } = setup();
    pop.open();
    expect(log.made).toHaveLength(1);
    expect(pop.isOpen()).toBe(true);
    expect(log.toMain).toHaveLength(0);
    last().events.loaded();
    expect(log.toMain).toEqual(['a1']);
    expect(last().ports).toEqual(['b1']);
  });

  it('never makes a second window: asking again brings it forward and makes a fresh link', () => {
    const { pop, log, last } = setup();
    pop.open();
    last().events.loaded();
    pop.open();
    pop.open();
    expect(log.made).toHaveLength(1);
    expect(last().raised).toBe(2);
    expect(log.toMain).toHaveLength(3);
  });

  it('does not link before the page has loaded, even if asked again', () => {
    const { pop, log } = setup();
    pop.open();
    pop.open();
    expect(log.toMain).toHaveLength(0);
  });

  it('opens with the default size when it has never been placed', () => {
    const { pop, log } = setup(null);
    pop.open();
    expect(log.bounds[0]).toEqual({ ...DEFAULT_SIZE });
  });
});

describe('going away', () => {
  it('closing it tells the drawing window to stop sending, and remembers where it was', () => {
    const { pop, log, last } = setup();
    pop.open();
    last().events.loaded();
    last().move({ x: 2000, y: 50, width: 700, height: 500 });
    pop.close();
    expect(pop.isOpen()).toBe(false);
    expect(log.told).toBe(1);
    expect(log.saved).toEqual([{ x: 2000, y: 50, width: 700, height: 500 }]);
  });

  it('closing by its own window button does the same', () => {
    const { pop, log, last } = setup();
    pop.open();
    last().events.loaded();
    last().close();
    expect(pop.isOpen()).toBe(false);
    expect(log.told).toBe(1);
  });

  it('reopening after closing makes a new window, in the same place', () => {
    const first = setup();
    first.pop.open();
    first.last().events.loaded();
    first.last().move({ x: 2000, y: 50, width: 700, height: 500 });
    first.pop.close();
    const saved = first.log.saved[0];
    const again = setup(saved, [SCREEN, SECOND]);
    again.pop.open();
    expect(again.log.bounds[0]).toEqual({ x: 2000, y: 50, width: 700, height: 500 });
  });

  it('the drawing window closing takes it along', () => {
    const { pop, last } = setup();
    pop.open();
    last().events.loaded();
    const w = last();
    pop.mainClosed();
    expect(w.dead).toBe(true);
    expect(pop.isOpen()).toBe(false);
  });

  it('the drawing window closing with no picture window open does nothing', () => {
    const { pop, log } = setup();
    expect(() => pop.mainClosed()).not.toThrow();
    expect(log.told).toBe(0);
  });

  it('a crashed picture window page closes the window', () => {
    const { pop, last, log } = setup();
    pop.open();
    last().events.loaded();
    last().events.crashed();
    expect(pop.isOpen()).toBe(false);
    expect(log.told).toBe(1);
  });

  it('a late event from a window that was already replaced says nothing about the new one', () => {
    const { pop, log } = setup();
    pop.open();
    const old = log.made[0];
    old.dead = true;
    pop.open();
    expect(log.made).toHaveLength(2);
    old.events.closed();
    expect(pop.isOpen()).toBe(true);
    expect(log.told).toBe(0);
  });

  it('closing twice is harmless', () => {
    const { pop, log } = setup();
    pop.open();
    pop.close();
    pop.close();
    expect(log.told).toBe(1);
  });
});

describe('the drawing window reloading', () => {
  it('makes a fresh link when the picture window is open', () => {
    const { pop, log, last } = setup();
    pop.open();
    last().events.loaded();
    pop.mainReloaded();
    expect(log.toMain).toHaveLength(2);
    expect(last().ports).toHaveLength(2);
  });
  it('does nothing when it is not open', () => {
    const { pop, log } = setup();
    pop.mainReloaded();
    expect(log.toMain).toHaveLength(0);
  });
});

describe('where it opens', () => {
  const saved: Place = { x: 2000, y: 100, width: 800, height: 600 };
  it('puts it back on the screen it was on', () => {
    expect(openBounds(saved, [SCREEN, SECOND])).toEqual({ x: 2000, y: 100, width: 800, height: 600 });
  });
  it('lets the system choose the spot when that screen has been unplugged', () => {
    expect(openBounds(saved, [SCREEN])).toEqual({ width: 800, height: 600 });
  });
  it('never opens smaller than a usable window', () => {
    const b = openBounds({ x: 0, y: 0, width: 60, height: 60 }, [SCREEN]);
    expect(b.width).toBe(MIN_SIZE.width);
    expect(b.height).toBe(MIN_SIZE.height);
  });
  it('reads a saved place only when every number is sane', () => {
    expect(readPlace({ x: 1, y: 2, width: 300, height: 200 })).toEqual({ x: 1, y: 2, width: 300, height: 200 });
    expect(readPlace({ x: 1, y: 2, width: 300, height: 200, fullScreen: true })?.fullScreen).toBe(true);
    for (const bad of [null, 'x', {}, { x: 'a', y: 0, width: 300, height: 200 }, { x: 0, y: 0, width: NaN, height: 200 }, { x: 0, y: 0, width: 10, height: 200 }, { x: 1e9, y: 0, width: 300, height: 200 }, { x: 0, y: 0, width: 300, height: 1e9 }]) {
      expect(readPlace(bad)).toBeNull();
    }
  });
});
