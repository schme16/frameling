import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape } from '../../src/core/format';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { currentChoice, resetChoices, setChoice } from '../../src/core/choices';
import { doneWords, problemWords } from '../../src/tools/combine';
import '../../src/tools/edit-commands';
import '../../src/tools/combine';
import { addShapes, box, shapesNow, vectorStore } from './helpers';

const run = (id: string) => getCommand(id)!.run();
const pick = (...ids: string[]) => store().setUi({ selection: ids });

beforeEach(() => {
  resetChoices();
  vectorStore();
  addShapes(box('a', 0, 0, 100, 100, '#ff0000'), box('b', 50, 50, 100, 100, '#0000ff'));
  pick('a', 'b');
});

describe('combine commands', () => {
  it('has all four in the palette, plain words first', () => {
    expect(['shapes.join', 'shapes.cut', 'shapes.overlap', 'shapes.punch'].map((id) => getCommand(id)?.label)).toEqual(['Join', 'Cut out', 'Keep the overlap', 'Punch a hole']);
  });

  it('Join is one undo step and keeps the result selected', () => {
    run('shapes.join');
    expect(shapesNow()).toHaveLength(1);
    expect(store().get().ui.selection).toEqual(['a']);
    store().undo();
    expect(shapesNow().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('wears the top colours when that is the remembered answer', () => {
    setChoice('shapes.combineLook', 'top');
    run('shapes.join');
    expect((shapesNow()[0] as PathShape).fill).toBe('#0000ff');
  });

  it('defaults to the bottom shape without asking', () => {
    expect(currentChoice('shapes.combineLook')).toBe('bottom');
    run('shapes.punch');
    expect((shapesNow()[0] as PathShape).fill).toBe('#ff0000');
  });

  it('does nothing, and changes nothing, when one shape is picked', () => {
    pick('a');
    const before = shapesNow();
    run('shapes.cut');
    expect(shapesNow()).toBe(before);
  });

  it('is only on offer with two or more picked', () => {
    expect(getCommand('shapes.join')!.enabled!(store().get())).toBe(true);
    pick('a');
    expect(getCommand('shapes.join')!.enabled!(store().get())).toBe(false);
  });

  it('says what happened to the colours', () => {
    expect(doneWords('join', { used: 2, skipped: 0 }, 'bottom')).toBe('Joined 2 shapes. It wears the bottom shape’s colours.');
    expect(doneWords('cut', { used: 3, skipped: 1 }, 'bottom')).toContain('keeps its colours');
    expect(problemWords('cut', 'apart')).toContain('nothing to cut');
  });
});
