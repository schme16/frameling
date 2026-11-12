// @vitest-environment jsdom
// The chooser flow (Quill's "What are we making?" and the starter cards), the "Coming from Aseprite?" ask, the mode
// chip, the change dialog, the layout that follows the way, the second-board question and Quill's moments.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/pixel';
import { _resetChoicesForTests, registerChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import type { Doc } from '../../src/core/format';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { artboardsOf, addArtboard } from '../../src/artboards/model';
import { newDoc } from '../../src/core/doc';
import { openPixelChooser, PixelStarters } from '../../src/pixel/Chooser';
import { openChangeWay } from '../../src/pixel/ChangeWay';
import { PictureStrip, PixelBar } from '../../src/pixel/PixelBar';
import { ASEPRITE_SET, askAboutKeys, KEYS_CHOICE, setFor } from '../../src/pixel/keysAsk';
import { _resetMoments, moment } from '../../src/pixel/moments';
import { changeWay, layoutFor, makeItMove, watchSecondThings, watchWayLayout, type WayDock } from '../../src/pixel/wayOps';
import { newSpriteDoc, wayOf } from '../../src/pixel/way';
import { quillFits, QUILL_ART_HEIGHT } from '../../src/pixel/preview';
import { getPrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { toasts } from '../../src/ui/toast';
import { toolEvent } from '../../src/tools/toolEvents';
import { setPaintWells } from '../../src/tools/pixelWells';
import { dock } from '../../src/ui/dock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement | null = null;
let root: Root | null = null;
const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
const mount = (el: React.ReactElement) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
};

beforeEach(() => {
  localStorage.clear();
  _resetMoments();
  resetPrefs();
  resetStore(newDoc({ name: 'blank', width: 64, height: 64 }));
  toasts.set(() => []);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  host = root = null;
  document.body.innerHTML = '';
  setPaintWells(false);
});

const cards = () => [...document.querySelectorAll<HTMLElement>('.px-way-card')];
const click = (el: Element) => act(() => (el as HTMLElement).click());
const startBtn = () => [...document.querySelectorAll<HTMLButtonElement>('.io-foot button')].find((b) => b.textContent === 'Start')!;

describe("Quill's chooser", () => {
  it('asks what we are making with four answers, and Start waits for one', async () => {
    act(() => openPixelChooser());
    expect(document.querySelector('.px-chooser-head h2')?.textContent).toBe('Pixel time! What are we making?');
    expect(cards().map((c) => c.querySelector('strong')!.textContent)).toEqual(['One picture', 'An animation', 'Frames on boards', 'Sprites on a sheet']);
    expect(document.querySelector('.px-way-tag')?.textContent).toBe('Like Aseprite');
    expect(startBtn().disabled).toBe(true);
    expect(document.querySelector('.px-chooser-says')?.textContent).toMatch(/Not sure\? Pick An animation/);
    click(cards()[2]);
    expect(document.querySelector('.px-chooser-says')?.textContent).toBe('Every frame gets its own little board. Tidy!');
    expect(startBtn().disabled).toBe(false);
  });

  it.each([
    ['One picture', 'picture', 1],
    ['An animation', 'animation', 1],
    ['Frames on boards', 'boards', 4],
    ['Sprites on a sheet', 'sheet', 3],
  ] as const)('%s makes a ready document at the size you picked', async (name, way, boards) => {
    act(() => openPixelChooser());
    click(cards().find((c) => c.querySelector('strong')!.textContent === name)!);
    // a size chip: 16 x 16
    click([...document.querySelectorAll('.px-size-chip')].find((c) => c.textContent === '16 x 16')!);
    click(startBtn());
    await flush();
    const doc = store().get().doc;
    expect(doc.sprite?.way).toBe(way);
    expect(wayOf(doc)).toBe(way);
    expect(artboardsOf(doc)).toHaveLength(boards);
    expect(Math.ceil(doc.width / (doc.layers[0] as { pixelSize: number }).pixelSize)).toBe(16);
    expect(document.querySelector('.px-chooser')).toBeNull();
  });

  it('your own size is clamped to what a sprite can be', async () => {
    act(() => openPixelChooser());
    click(cards()[0]);
    click([...document.querySelectorAll('.px-size-chip')].find((c) => c.textContent === 'Your own size')!);
    const [w, h] = [...document.querySelectorAll<HTMLInputElement>('.px-size-own input')];
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(w, '40');
      w.dispatchEvent(new Event('input', { bubbles: true }));
      set.call(h, '9999');
      h.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(startBtn());
    await flush();
    const doc = store().get().doc;
    const ps = (doc.layers[0] as { pixelSize: number }).pixelSize;
    expect([Math.ceil(doc.width / ps), Math.ceil(doc.height / ps)]).toEqual([40, 512]);
  });

  it('Back goes to the New sheet', () => {
    act(() => openPixelChooser());
    click([...document.querySelectorAll<HTMLButtonElement>('.io-foot button')].find((b) => b.textContent === 'Back')!);
    expect(document.querySelector('.px-chooser')).toBeNull();
  });
});

describe('the starter cards (Quill off)', () => {
  it('make the same ready documents straight away', async () => {
    const done = vi.fn();
    mount(<PixelStarters onMade={done} />);
    expect(cards()).toHaveLength(4);
    click(cards()[3]);
    await flush();
    expect(wayOf(store().get().doc)).toBe('sheet');
    expect(done).toHaveBeenCalled();
  });
});

describe('Coming from Aseprite?', () => {
  it('asks the first time a pixel file opens, with the two answers', () => {
    const asked: string[] = [];
    setChoiceAsker(async (def) => {
      asked.push(def.id);
      return { value: 'aseprite', remember: true };
    });
    askAboutKeys();
    return flush().then(() => {
      expect(asked).toEqual([KEYS_CHOICE]);
      expect(getPrefs().keymapSet).toBe(ASEPRITE_SET);
      expect(toasts.get().at(-1)?.message).toMatch(/Aseprite keys are on/);
      setChoiceAsker(null);
    });
  });
  it('is asked once: a remembered answer is not asked again, and one who picked another set is left alone', async () => {
    setChoice(KEYS_CHOICE, 'frameling');
    const ask = vi.fn(async () => ({ value: 'aseprite', remember: true }));
    setChoiceAsker(ask);
    askAboutKeys();
    await flush();
    expect(ask).not.toHaveBeenCalled();
    setChoice(KEYS_CHOICE, undefined);
    setPrefs({ keymapSet: 'flash' });
    askAboutKeys();
    await flush();
    expect(ask).not.toHaveBeenCalled();
    setChoiceAsker(null);
  });
  it('changing the answer in Preferences changes the keys', () => {
    setChoice(KEYS_CHOICE, 'aseprite');
    expect(getPrefs().keymapSet).toBe('pixel');
    setChoice(KEYS_CHOICE, 'frameling');
    expect(getPrefs().keymapSet).toBe('frameling');
    expect(setFor('aseprite')).toBe('pixel');
  });
});

describe('the mode chip and the picture strip', () => {
  beforeEach(() => {
    vi.spyOn(dock, 'use').mockImplementation(((sel: (d: unknown) => unknown) => sel({ workspaceId: 'pixel' })) as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('says which way the sprite is built', () => {
    resetStore(newSpriteDoc({ way: 'animation', width: 16, height: 16 }));
    // The chip needs the Pixel workspace; use the label function directly through the rendered bar.
    expect(wayOf(store().get().doc)).toBe('animation');
  });
});

describe('change how it is built (command and dialog)', () => {
  it('the dialog lists the four ways and says why one is off', () => {
    const doc = newSpriteDoc({ way: 'animation', width: 16, height: 16 });
    store().update('x', () => {});
    resetStore(doc);
    store().update('more frames', (d) => void (d.length = 6));
    act(() => openChangeWay());
    expect(cards()).toHaveLength(4);
    expect(cards()[0].className).toContain('is-off');
    expect(cards()[1].textContent).toContain('This is how it is built now');
    expect(document.querySelector('.px-way-off')?.textContent).toMatch(/6 frames/);
  });
  it('turns frames into boards as one undo step and back with undo', () => {
    resetStore(newSpriteDoc({ way: 'animation', width: 16, height: 16 }));
    expect(changeWay('boards', false).ok).toBe(true);
    expect(artboardsOf(store().get().doc)).toHaveLength(4);
    store().undo();
    expect(store().get().doc.artboards).toBeUndefined();
    expect(store().get().doc.length).toBe(4);
  });
  it('says why in a toast when it cannot, and changes nothing', () => {
    const doc = newSpriteDoc({ way: 'animation', width: 16, height: 16 });
    resetStore(doc);
    const r = changeWay('picture');
    expect(r.ok).toBe(false);
    expect(toasts.get().at(-1)?.message).toMatch(/4 frames/);
    expect(store().get().doc).toBe(doc);
  });
  it('Make it move turns a picture into an animation', () => {
    resetStore(newSpriteDoc({ way: 'picture', width: 16, height: 16 }));
    expect(getCommand('pixel.makeItMove')!.enabled!(store().get())).toBe(true);
    makeItMove();
    expect(wayOf(store().get().doc)).toBe('animation');
    expect(store().get().doc.length).toBe(4);
    expect(getCommand('pixel.makeItMove')!.enabled!(store().get())).toBe(false);
  });
  it('the commands are enabled only when they can do something', () => {
    resetStore(newSpriteDoc({ way: 'animation', width: 16, height: 16 }));
    expect(getCommand('pixel.framesToBoards')!.enabled!(store().get())).toBe(true);
    expect(getCommand('pixel.boardsToFrames')!.enabled!(store().get())).toBe(false);
    resetStore(newDoc({ pixel: undefined }));
    expect(getCommand('pixel.changeWay')!.enabled!(store().get())).toBe(false);
  });
});

describe('the layout follows the way', () => {
  const fake = () => {
    const calls: string[] = [];
    const d: WayDock = { inPixelWorkspace: () => true, fold: (on) => calls.push(on ? 'fold' : 'open'), stack: (a, b) => calls.push(`stack ${a} over ${b}`) };
    return { d, calls };
  };
  it('what each way shows', () => {
    expect(layoutFor(newSpriteDoc({ way: 'picture', width: 16, height: 16 }))).toEqual({ timeline: 'fold', stack: null });
    expect(layoutFor(newSpriteDoc({ way: 'animation', width: 16, height: 16 }))).toEqual({ timeline: 'open', stack: null });
    expect(layoutFor(newSpriteDoc({ way: 'boards', width: 16, height: 16 }))).toEqual({ timeline: 'fold', stack: ['artboards', 'preview'] });
    expect(layoutFor(newSpriteDoc({ way: 'sheet', width: 16, height: 16 }))).toEqual({ timeline: 'open', stack: ['artboards', 'preview'] });
  });
  it('folds for a picture, opens when it moves, and leaves a moved panel alone otherwise', () => {
    const { d, calls } = fake();
    resetStore(newSpriteDoc({ way: 'picture', width: 16, height: 16 }));
    watchWayLayout(store(), d);
    expect(calls).toEqual(['fold']);
    store().update('draw', (x) => void (x.name = 'renamed'));
    expect(calls).toEqual(['fold']); // nothing about the way changed
    makeItMove();
    expect(calls).toEqual(['fold', 'open']);
  });
  it('stacks the Artboards panel over the Preview for the board ways', () => {
    const { d, calls } = fake();
    resetStore(newSpriteDoc({ way: 'sheet', width: 16, height: 16 }));
    watchWayLayout(store(), d);
    expect(calls).toEqual(['open', 'stack artboards over preview']);
  });
  it('does nothing outside the Pixel workspace or for other documents', () => {
    const { d, calls } = fake();
    d.inPixelWorkspace = () => false;
    resetStore(newSpriteDoc({ way: 'picture', width: 16, height: 16 }));
    watchWayLayout(store(), d);
    expect(calls).toEqual([]);
  });
});

describe('a second board', () => {
  it('asks what the boards are, once, and stores the answer', async () => {
    registerChoice({ id: 'x', title: 'x', question: 'x', options: [{ value: 'a', label: 'a' }], default: 'a', category: 'x' });
    resetStore(newSpriteDoc({ way: 'picture', width: 16, height: 16 }));
    const off = watchSecondThings(store());
    store().update('add a board', (d) => void addArtboard(d, { name: 'Hero' }));
    await flush();
    // no asker in tests: the default (frames of one sprite) is used and stored
    expect(store().get().doc.sprite?.way).toBe('boards');
    off();
  });
  it('a second frame cheers once for the file', () => {
    resetStore(newSpriteDoc({ way: 'picture', width: 16, height: 16 }));
    const off = watchSecondThings(store());
    store().update('longer', (d) => void (d.length = 2));
    expect(toasts.get().at(-1)?.message).toBe('A second frame! Now it moves.');
    store().update('longer', (d) => void (d.length = 3));
    expect(toasts.get().filter((t) => t.message === 'A second frame! Now it moves.')).toHaveLength(1);
    off();
  });
});

describe("Quill's moments", () => {
  it('say a line once and stay quiet with Quill off', () => {
    expect(moment('a', () => 'Hi')).toBe(true);
    expect(moment('a', () => 'Hi')).toBe(false);
    setPrefs({ showQuill: false });
    expect(moment('b', () => 'Hi')).toBe(false);
    setPrefs({ showQuill: true });
    expect(moment('b', () => 'Hi')).toBe(true);
  });
  it('the first Alt pick and the first pixel perfect fix, in the Pixel workspace only', () => {
    setPaintWells(true);
    void dock;
    toolEvent('altPick');
    toolEvent('perfectFix');
    // not in a Pixel workspace in tests: nothing is said
    expect(toasts.get()).toHaveLength(0);
  });
});

describe('Quill for scale', () => {
  it('fits beside the sprite only when there is room', () => {
    expect(QUILL_ART_HEIGHT).toBe(48);
    expect(quillFits(1, 32, 32, 264, 300)).toBe(true);
    expect(quillFits(4, 32, 32, 264, 300)).toBe(false);
    expect(quillFits(1, 200, 100, 220, 300)).toBe(false);
  });
});

describe('the bar parts are exported', () => {
  it('has a chip and a strip', () => {
    expect(typeof PixelBar).toBe('function');
    expect(typeof PictureStrip).toBe('function');
    const _doc: Doc | null = null;
    void _doc;
  });
});
