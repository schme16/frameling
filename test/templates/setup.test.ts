import { beforeEach, describe, expect, it } from 'vitest';
import { resetStore } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import { findTemplate } from '../../src/templates';
import { forgetSetups, setupFor, templateExport, watchSetups } from '../../src/templates/setup';
import { artScale, defaultSettings } from '../../src/export/plan';

beforeEach(() => forgetSetups());

describe('template setup', () => {
  it('turns onion skin on when the walk cycle opens, and leaves other documents alone', () => {
    const s = resetStore();
    const stop = watchSetups(s);
    s.load(newDoc());
    expect(s.get().ui.onion.enabled).toBe(false);
    s.load(findTemplate('walk-cycle')!.make());
    expect(s.get().ui.onion).toMatchObject({ enabled: true, before: 1, after: 1 });
    stop();
  });

  it('starts the first export on the template choice, then gets out of the way', () => {
    const doc = findTemplate('ui-icons')!.make();
    const base = defaultSettings(doc);
    const first = templateExport(doc.id, base, artScale(doc));
    expect(first.format).toBe('sheet');
    expect(first.scale).toBe(1 / 16);
    expect(first.sheet).toMatchObject({ content: 'separate', layout: 'grid', columns: 4 });
    expect(templateExport(doc.id, base, artScale(doc))).toBe(base);
  });

  it('gives the spinner a see-through looping GIF, and nothing to a plain document', () => {
    const doc = findTemplate('loading-spinner')!.make();
    expect(templateExport(doc.id, defaultSettings(doc), null)).toMatchObject({ format: 'gif', loop: true, transparent: true });
    const plain = newDoc();
    const base = defaultSettings(plain);
    expect(templateExport(plain.id, base, null)).toBe(base);
    expect(setupFor(plain.id)).toBeUndefined();
  });
});
