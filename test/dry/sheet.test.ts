// The paper as the sheet's: which tools carry the Paper group, which paper a stroke lands on, and what happens when the
// sheet's paper and a brush's own paper disagree.
import { describe, expect, it } from 'vitest';
import { PAPER_TOOLS, effectivePaper, paperGroupMode, paperNow, paperSaid, pickNeedsAnswer, pickPaper, pinBrush, savedPaperDiffers, sheetAfterUsing, unpinBrush } from '../../src/dry/sheet';

describe('which tools carry the Paper group', () => {
  it('chalk and charcoal always do', () => {
    expect(paperGroupMode({ tool: 'charcoal' })).toBe('on');
  });
  it('the pixel brush shows it open with grain on, and just the switch with grain off', () => {
    expect(paperGroupMode({ tool: 'pixel-brush', grainOn: true })).toBe('on');
    expect(paperGroupMode({ tool: 'pixel-brush', grainOn: false })).toBe('off');
  });
  it('the brush shows it for a chalk or charcoal tip: open when it catches on paper, just its switch when not', () => {
    expect(paperGroupMode({ tool: 'brush', tipKind: 'chalk', tipDry: true })).toBe('on');
    expect(paperGroupMode({ tool: 'brush', tipKind: 'charcoal', tipDry: true })).toBe('on');
    expect(paperGroupMode({ tool: 'brush', tipKind: 'charcoal', tipDry: false })).toBe('off');
    expect(paperGroupMode({ tool: 'brush', tipKind: 'nib', tipDry: true })).toBe('none');
    expect(paperGroupMode({ tool: 'brush', tipKind: null })).toBe('none');
  });
  it('a tool that never touches paper does not carry it', () => {
    for (const tool of ['pen', 'pencil', 'airbrush', 'soft-brush', 'soft-eraser', 'smudge', 'eraser', 'fill', 'select']) expect(paperGroupMode({ tool, grainOn: true, tipKind: 'chalk', tipDry: true })).toBe('none');
  });
  it('names the three tools, so an audit can check each one has the group', () => {
    expect(PAPER_TOOLS).toEqual(['charcoal', 'pixel-brush', 'brush']);
  });
});

describe('which paper a stroke lands on', () => {
  it('a brush with no paper of its own uses the sheet’s', () => {
    expect(paperNow('rough')).toEqual({ paper: 'rough', source: 'sheet', differs: false });
    expect(effectivePaper('rough')).toBe('rough');
  });
  it('a brush with its own paper keeps it, whatever the sheet is', () => {
    expect(paperNow('rough', 'fine')).toEqual({ paper: 'fine', source: 'brush', differs: true });
    expect(effectivePaper('rough', 'fine')).toBe('fine');
  });
  it('a brush whose own paper matches the sheet is still its own, so changing the sheet will leave it', () => {
    expect(paperNow('fine', 'fine')).toEqual({ paper: 'fine', source: 'brush', differs: false });
  });
  it('says in words whose paper it is', () => {
    expect(paperSaid(paperNow('fine'), 'fine')).toMatch(/sheet’s paper/);
    expect(paperSaid(paperNow('rough', 'fine'), 'rough')).toBe('This brush keeps its own paper. Your sheet is on Rough.');
    expect(paperSaid(paperNow('fine', 'fine'), 'fine')).toMatch(/same as your sheet/);
  });
});

describe('picking a paper in the group', () => {
  it('on the sheet’s paper it changes the sheet, with nothing to ask', () => {
    expect(pickNeedsAnswer({ sheet: 'medium' }, 'rough')).toBe(false);
    expect(pickPaper({ sheet: 'medium' }, 'rough', 'brush')).toEqual({ sheet: 'rough' });
    expect(pickPaper({ sheet: 'medium' }, 'rough', 'sheet')).toEqual({ sheet: 'rough' });
  });
  it('on a brush’s own paper it is a question', () => {
    expect(pickNeedsAnswer({ sheet: 'medium', own: 'fine' }, 'rough')).toBe(true);
    expect(pickNeedsAnswer({ sheet: 'medium', own: 'fine' }, 'fine')).toBe(false);
  });
  it('answered "just this brush", the sheet stays and the brush moves', () => {
    expect(pickPaper({ sheet: 'medium', own: 'fine' }, 'rough', 'brush')).toEqual({ sheet: 'medium', own: 'rough' });
  });
  it('answered "the whole sheet", the sheet moves and the brush follows it again', () => {
    expect(pickPaper({ sheet: 'medium', own: 'fine' }, 'rough', 'sheet')).toEqual({ sheet: 'rough' });
  });
  it('keeping a brush on its paper, then letting it go', () => {
    expect(pinBrush({ sheet: 'laid' })).toEqual({ sheet: 'laid', own: 'laid' });
    expect(pinBrush({ sheet: 'laid', own: 'fine' })).toEqual({ sheet: 'laid', own: 'fine' });
    expect(unpinBrush({ sheet: 'laid', own: 'fine' })).toEqual({ sheet: 'laid' });
  });
});

describe('using a brush saved on a paper', () => {
  it('moves the sheet only when the answer is to, and only when they differ', () => {
    expect(savedPaperDiffers('medium', 'rough')).toBe(true);
    expect(savedPaperDiffers('rough', 'rough')).toBe(false);
    expect(savedPaperDiffers('medium', undefined)).toBe(false);
    expect(sheetAfterUsing('medium', 'rough', 'sheet')).toBe('rough');
    expect(sheetAfterUsing('medium', 'rough', 'keep')).toBe('medium');
    expect(sheetAfterUsing('medium', undefined, 'sheet')).toBe('medium');
  });
});
