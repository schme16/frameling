// @vitest-environment jsdom
// Every panel the app registers says what it's for, so the rail and the Panels list never show a blank.
import { describe, expect, it } from 'vitest';
import { allPanels } from '../../src/core/registry';
import { PANEL_INFO } from '../../src/ui/panelInfo';
import '../../src/renderer/features';

describe('panel info (the real app)', () => {
  it('every built-in panel has a sentence and a group', () => {
    const missing = allPanels().filter((p) => !PANEL_INFO[p.id]).map((p) => p.id);
    expect(missing).toEqual([]);
  });
});
