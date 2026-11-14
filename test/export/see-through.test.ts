// A page with no background colour is see-through in every format that can hold it; a page with a colour keeps it unless
// Transparent background is ticked. What each format does where it cannot is in the last block.
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { addArtboard, setArtboardBackground } from '../../src/artboards/model';
import { allFormats } from '../../src/export/types';
import '../../src/export/builtin';
import { backgroundFor, wantsSeeThrough } from '../../src/export/draw';
import { boardBackgrounds, defaultSettings } from '../../src/export/plan';

const page = (background: string | null): Doc => newDoc({ width: 32, height: 32, length: 2, background });

describe('which pages are see-through', () => {
  it('a page with no colour is, whatever the tick says', () => {
    expect(wantsSeeThrough(page(null), false)).toBe(true);
    expect(wantsSeeThrough(page(null), true)).toBe(true);
  });

  it('a page with a colour is only when the tick is on', () => {
    expect(wantsSeeThrough(page('#00aa00'), false)).toBe(false);
    expect(wantsSeeThrough(page('#00aa00'), true)).toBe(true);
  });
});

describe('what gets painted behind the picture', () => {
  it('nothing, when it is see-through and the format can hold that', () => {
    expect(backgroundFor(page(null), false, true)).toBe('none');
    expect(backgroundFor(page('#00aa00'), true, true)).toBe('none');
  });

  it("the page's own colour when it has one and nobody ticked the box", () => {
    expect(backgroundFor(page('#00aa00'), false, true)).toBe('doc');
  });

  it('a format that cannot be see-through paints the page colour, or white where there is none', () => {
    expect(backgroundFor(page('#00aa00'), true, false)).toBe('doc');
    expect(backgroundFor(page(null), true, false)).toBe('white');
    expect(backgroundFor(page(null), false, false)).toBe('white');
  });
});

describe('the offered tick for a file with artboards', () => {
  function boards(...bgs: (string | null)[]): Doc {
    const d = page(bgs[0]);
    bgs.slice(1).forEach((bg, i) => addArtboard(d, { name: `B${i + 2}`, width: 32, height: 32, length: 1, background: bg }));
    return d;
  }

  it('one page: ticked when it has no colour (as before)', () => {
    expect(defaultSettings(page(null)).transparent).toBe(true);
    expect(defaultSettings(page('#ffffff')).transparent).toBe(false);
  });

  it('sees every artboard, not just the open one', () => {
    const d = boards(null, '#00aa00', null);
    expect(boardBackgrounds(d)).toEqual([null, '#00aa00', null]);
  });

  it('is ticked only when every artboard is see-through, so a coloured one is not stripped', () => {
    expect(defaultSettings(boards(null, null)).transparent).toBe(true);
    expect(defaultSettings(boards(null, '#00aa00')).transparent).toBe(false);
    expect(defaultSettings(boards('#ffffff', null)).transparent).toBe(false);
  });

  it("follows an artboard's background when it is changed", () => {
    const d = boards(null, '#00aa00');
    const id = d.artboards![1].id;
    setArtboardBackground(d, id, null);
    expect(defaultSettings(d).transparent).toBe(true);
  });
});

describe('which formats can be see-through', () => {
  it('every format can except MP4, JPEG and the contact sheet (H.264 and JPEG have no see-through; WebM needs a codec that does, which the app checks)', () => {
    const cannot = allFormats().filter((f) => !f.alpha).map((f) => f.id);
    expect(cannot).toEqual(['mp4', 'jpeg', 'contact']);
  });
});
