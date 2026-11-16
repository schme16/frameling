// Each drawing keeps its own export choices: exporting one never changes what another repeats.
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { store } from '../../src/core/store';
import { docExports, removeWay, renameWay, rememberExport, saveWay } from '../../src/export/savedOps';
import { DEFAULT_SHEET, type ExportSettings } from '../../src/export/types';

const gif: ExportSettings = { format: 'gif', range: 'all', clipId: null, scale: 2, transparent: false, loop: true, dither: true, sheet: DEFAULT_SHEET };

describe('saved export choices in the open drawing', () => {
  it('belong to the drawing: opening another starts with none', () => {
    store().load(newDoc({ name: 'A' }));
    rememberExport(gif);
    expect(docExports()?.last?.settings.format).toBe('gif');
    store().load(newDoc({ name: 'B' }));
    expect(docExports()).toBeUndefined();
  });

  it('exporting the same way twice does not mark the drawing as changed', () => {
    store().load(newDoc({ name: 'A' }));
    rememberExport(gif);
    store().setUi({ dirty: false });
    rememberExport({ ...gif, loopTouched: true });
    expect(store().get().ui.dirty).toBe(false);
  });

  it('saves, renames and forgets a way, each as one undo step', () => {
    store().load(newDoc({ name: 'A' }));
    const way = saveWay('web', gif)!;
    expect(docExports()?.ways?.[0].name).toBe('web');
    expect(renameWay(way.id, 'web page')).toBe(true);
    expect(docExports()?.ways?.[0].name).toBe('web page');
    removeWay(way.id);
    expect(docExports()?.ways).toBeUndefined();
    store().undo();
    expect(docExports()?.ways?.[0].name).toBe('web page');
  });
});
