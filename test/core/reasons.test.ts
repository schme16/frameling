// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { COMMAND_REASONS, hasReason, reasonFor } from '../../src/core/commandReasons';
import { kindsInWords, needManyShapes, pickKindReason } from '../../src/core/reasons';
import { allCommands } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { explainNotNow, notNowMessage } from '../../src/ui/palette';
import { clearToasts, toasts } from '../../src/ui/toast';
import { loadApp } from '../findability/app';

describe('reasons for greyed commands', () => {
  it('names the kinds of layer in plain words', () => {
    expect(kindsInWords(['vector'])).toBe('a vector layer');
    expect(kindsInWords(['vector', 'pixel'])).toBe('a vector or pixel layer');
    expect(kindsInWords(['vector', 'pixel', 'tilemap'])).toBe('a vector, pixel or tile layer');
    expect(pickKindReason(['pixel'], 'Dither')({} as never)).toBe('Dither works on a pixel layer. Pick one in the Layers panel, or add one.');
  });

  it('says which of two things is missing', () => {
    resetStore(newDoc());
    expect(needManyShapes(store().get())).toBe('Select two or more shapes first.');
    store().setUi({ selection: ['a', 'b'] });
    expect(needManyShapes(store().get())).toMatch(/vector layer/);
  });

  it("a command's own reason wins over the table, and a thrown one says nothing", () => {
    const s = store().get();
    expect(reasonFor({ id: 'edit.undo', reason: () => 'Mine.' }, s)).toBe('Mine.');
    expect(reasonFor({ id: 'edit.undo' }, s)).toMatch(/Nothing to undo/);
    expect(reasonFor({ id: 'nothing.here' }, s)).toBeUndefined();
    expect(
      reasonFor(
        {
          id: 'x',
          reason: () => {
            throw new Error('no');
          },
        },
        s,
      ),
    ).toBeUndefined();
    expect(hasReason({ id: 'edit.undo' })).toBe(true);
    expect(hasReason({ id: 'nothing.here' })).toBe(false);
  });

  it('the message for a greyed command leads with its reason, and falls back to the shared line without one', () => {
    expect(notNowMessage({ label: 'Group', reason: () => 'Select some shapes first.' })).toBe('"Group" is greyed out. Select some shapes first.');
    expect(notNowMessage({ label: 'Do a thing' })).toMatch(/can't be used right now/);
  });

  it('pressing a greyed menu item or button toasts its reason, with a link to read more', () => {
    clearToasts();
    explainNotNow({ label: 'Group', help: 'undo', reason: () => 'Select some shapes first.' }, () => {});
    const t = toasts.get().at(-1)!;
    expect(t.message).toContain('Select some shapes first.');
    expect(t.action?.label).toBe('Read about it');
  });

  it('every table entry is for a command that exists, and reads in the house voice', async () => {
    await loadApp();
    const ids = new Set(allCommands().map((c) => c.id));
    expect(Object.keys(COMMAND_REASONS).filter((id) => !ids.has(id))).toEqual([]);
    resetStore(newDoc());
    for (const [id, r] of Object.entries(COMMAND_REASONS)) {
      for (const sel of [[], ['a'], ['a', 'b']]) {
        store().setUi({ selection: sel });
        const text = r(store().get());
        if (!text) continue;
        expect(text, id).toMatch(/^[A-Z].*[.]$/);
        expect(text, id).not.toMatch(/[–—]/);
      }
    }
  });
});
