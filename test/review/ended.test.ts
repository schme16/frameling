// A review that has ended says so plainly, and the reviewer can keep the last picture. The words, the title, the file name
// and what the desktop side will accept are all pure, so they are checked here; the real window is in scripts/e2e/review.cjs.
import { describe, expect, it } from 'vitest';
import { ReviewBus, isOver, linkWords, overWords, reviewTitle, type LinkState } from '../../src/popout/reviewBus';
import { pictureFileName } from '../../src/review/pictureName';
import { MAX_PICTURE_BYTES, readPictureAsk } from '../../src/main/reviewPicture';
import { SAVE_PICTURE_NOTE } from '../../src/popout/picture';

const png = (n = 64) => {
  const b = new Uint8Array(n);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
};

describe('when a review is over', () => {
  it('is over when the sharer stops or sends you away, and not before', () => {
    expect(isOver('ended')).toBe(true);
    expect(isOver('removed')).toBe(true);
    for (const l of ['starting', 'looking', 'checking', 'knocking', 'in', 'dropped', 'lost', 'refused', 'stopped'] as LinkState[]) expect(isOver(l), l).toBe(false);
  });
  it('says so in the title bar, so a window left alone cannot be mistaken for a live one', () => {
    expect(reviewTitle('in', 'Bouncing ball')).toBe('Live review: Bouncing ball');
    expect(reviewTitle('ended', 'Bouncing ball')).toBe('Review ended: Bouncing ball');
    expect(reviewTitle('removed', 'Bouncing ball')).toBe('Removed from the review: Bouncing ball');
    expect(reviewTitle('ended', '')).toBe('Review ended: a drawing');
  });
  it('has a headline and a line for the strip across the top, only while it is over', () => {
    expect(overWords('ended')!.title).toBe('This review has ended');
    expect(overWords('ended')!.text).toMatch(/nothing more will arrive/);
    expect(overWords('ended')!.text).toMatch(/last picture they sent/);
    expect(overWords('removed')!.title).toMatch(/taken out/);
    expect(overWords('in')).toBeNull();
    expect(overWords('dropped')).toBeNull();
  });
  it('keeps the thin bar for everything else, with no em dashes anywhere', () => {
    for (const l of ['ended', 'removed'] as LinkState[]) expect(linkWords({ link: l, secondsLeft: null, name: '', waiting: 0 })!.text).toMatch(/Nothing more will arrive/);
    for (const text of [SAVE_PICTURE_NOTE, overWords('ended')!.text, overWords('removed')!.text, overWords('ended')!.title]) expect(text).not.toMatch(/\u2014/);
  });
  it('says what Save picture saves, so nobody expects the layered drawing', () => {
    expect(SAVE_PICTURE_NOTE).toMatch(/flat PNG/);
    expect(SAVE_PICTURE_NOTE).toMatch(/not their layered drawing/);
  });
});

describe('the window hears two more things from the desktop side', () => {
  it('a request to save the picture, and how it went (closing the dialog is not a failure)', () => {
    const bus = new ReviewBus();
    let asked = 0;
    bus.onSavePicture = () => asked++;
    expect(bus.handle({ t: 'savePictureNow' })).toBe(true);
    expect(asked).toBe(1);
    expect(bus.snapshot().pictureSaved).toBeNull();
    bus.handle({ t: 'pictureSaved', ok: true });
    expect(bus.snapshot().pictureSaved).toBe(true);
    bus.handle({ t: 'pictureSaved', ok: false });
    expect(bus.snapshot().pictureSaved).toBe(false);
    bus.handle({ t: 'pictureSaved', ok: null });
    expect(bus.snapshot().pictureSaved).toBeNull();
  });
  it('turns the link to ended when the sharer says goodbye, which is what the strip follows', () => {
    const bus = new ReviewBus();
    bus.handle({ t: 'admitted', name: 'Cat', seat: 1 });
    expect(isOver(bus.snapshot().link)).toBe(false);
    bus.handle({ t: 'bye', why: 'ended' });
    expect(isOver(bus.snapshot().link)).toBe(true);
    expect(overWords(bus.snapshot().link)!.title).toBe('This review has ended');
  });
});

describe('the name a saved picture is offered under', () => {
  it('is the drawing\'s name made plain, with -review.png', () => {
    expect(pictureFileName('Bouncing ball')).toBe('bouncing-ball-review.png');
    expect(pictureFileName('Café  Série #2!')).toBe('cafe-serie-2-review.png');
  });
  it('can never carry a path, a dot or an odd character from the sharer\'s name', () => {
    expect(pictureFileName('../../etc/passwd')).toBe('etc-passwd-review.png');
    expect(pictureFileName('C:\\Users\\x\\a.png')).toBe('c-users-x-a-png-review.png');
    expect(pictureFileName('\u202egnp.exe')).toBe('gnp-exe-review.png');
  });
  it('falls back to "drawing" and stays short', () => {
    expect(pictureFileName('')).toBe('drawing-review.png');
    expect(pictureFileName(42)).toBe('drawing-review.png');
    expect(pictureFileName('???')).toBe('drawing-review.png');
    expect(pictureFileName('a'.repeat(500)).length).toBeLessThanOrEqual(60 + '-review.png'.length);
  });
});

describe('what the desktop side takes from the review window', () => {
  it('takes a real PNG with a name, and makes the name plain again', () => {
    const ask = readPictureAsk({ t: 'savePicture', png: png(), name: '../Cat Pics' });
    expect(ask!.fileName).toBe('cat-pics-review.png');
    expect(ask!.png.length).toBe(64);
  });
  it('refuses anything else: not a save, not a PNG, too small, too big, or bytes that are not bytes', () => {
    expect(readPictureAsk({ t: 'save', png: png(), name: 'x' })).toBeNull();
    expect(readPictureAsk({ t: 'savePicture', png: new Uint8Array(64), name: 'x' })).toBeNull();
    expect(readPictureAsk({ t: 'savePicture', png: png(10), name: 'x' })).toBeNull();
    expect(readPictureAsk({ t: 'savePicture', png: 'iVBORw0KGgo', name: 'x' })).toBeNull();
    expect(readPictureAsk({ t: 'savePicture', png: { length: MAX_PICTURE_BYTES + 1 }, name: 'x' })).toBeNull();
    expect(readPictureAsk(null)).toBeNull();
  });
});
