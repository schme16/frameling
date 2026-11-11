// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { Store, type State } from '../../src/core/store';
import { infoFor, isSection, matchPanel, PANEL_INFO, railGroups, sectionsNow, splitZone } from '../../src/ui/panelInfo';
import { folded, foldAll, onlyOpen, setFolded } from '../../src/ui/rightStyle';

const SECTIONS = ['tool-options', 'colors', 'palette', 'tileset', 'symbol-props', 'effects', 'text', 'particles', 'camera', 'rig'];

/** A fresh vector document, with the UI bits a test wants. */
function state(ui: Partial<State['ui']> = {}, pixel = false): State {
  const s = new Store(newDoc(pixel ? { pixel: { pixelSize: 8 } } : {}));
  s.setUi(ui);
  return s.get();
}

describe('right side: which panel goes where', () => {
  it('splits the zone into Properties sections and rail places, in the zone order', () => {
    const tabs = ['tool-options', 'colors', 'library', 'effects', 'quests', 'help', 'plugin.x'];
    expect(splitZone(tabs, true)).toEqual({ sections: ['tool-options', 'colors', 'effects'], rail: ['library', 'quests', 'help', 'plugin.x'] });
    // The plain rail keeps every panel as its own place.
    expect(splitZone(tabs, false)).toEqual({ sections: [], rail: tabs });
  });

  it('groups rail places, groups in a fixed order and the zone order inside', () => {
    expect(railGroups(['help', 'lipsync', 'library', 'plugin.x', 'clip-flow', 'quests'])).toEqual([
      { group: 'make', ids: ['library'] },
      { group: 'animate', ids: ['lipsync', 'clip-flow'] },
      { group: 'learn', ids: ['help', 'quests'] },
      { group: 'more', ids: ['plugin.x'] },
    ]);
  });

  it('knows every built-in right panel, with a sentence each', () => {
    for (const id of [...SECTIONS, 'library', 'clip-flow', 'lipsync', 'quests', 'help', 'timeline', 'preview']) {
      expect(PANEL_INFO[id], id).toBeTruthy();
      expect(PANEL_INFO[id].blurb.length, id).toBeGreaterThan(10);
      expect(PANEL_INFO[id].blurb, id).not.toMatch(/—/);
    }
    for (const id of SECTIONS) {
      expect(isSection(id), id).toBe(true);
      if (PANEL_INFO[id].relevant) expect(PANEL_INFO[id].idle, `${id} says what brings it up`).toBeTruthy();
    }
    expect(infoFor({ id: 'plugin.thing', title: 'Thing' })).toMatchObject({ group: 'more', blurb: 'Added by a plugin.' });
  });
});

describe('Properties: what shows now', () => {
  it('shows the tool and colours while drawing, the rest wait under Also here', () => {
    const r = sectionsNow(SECTIONS, state({ tool: 'brush' }), 'tool-options');
    expect(r.shown).toEqual(['tool-options', 'colors']);
    expect(r.idle).toEqual(['palette', 'tileset', 'symbol-props', 'effects', 'text', 'particles', 'camera', 'rig']);
  });

  it('shows the section asked for even when it does not apply', () => {
    expect(sectionsNow(SECTIONS, state(), 'particles').shown).toContain('particles');
  });

  it('brings up Text with the text tool, Rig with the bone tool, the palette on a pixel layer', () => {
    expect(sectionsNow(SECTIONS, state({ tool: 'text' }), null).shown).toContain('text');
    expect(sectionsNow(SECTIONS, state({ tool: 'bone' }), null).shown).toContain('rig');
    expect(sectionsNow(SECTIONS, state({}, true), null).shown).toContain('palette');
    expect(sectionsNow(SECTIONS, state({}, false), null).shown).not.toContain('palette');
  });

  it('puts the sections about a selection first', () => {
    const s = new Store(newDoc());
    const doc = s.get().doc;
    const layer = doc.layers[doc.layers.length - 1];
    const id = 'shape1';
    s.update('add', (d) => {
      const l = d.layers.find((x) => x.id === layer.id)!;
      d.drawings.dr1 = { id: 'dr1', kind: 'vector', shapes: [{ id, type: 'text', text: 'Hi', x: 0, y: 0 } as never] };
      l.cels = [{ id: 'cel1', start: 0, length: 4, drawingId: 'dr1' }];
    });
    s.setUi({ activeLayerId: layer.id, selection: [id], tool: 'select' });
    const r = sectionsNow(SECTIONS, s.get(), 'tool-options');
    expect(r.shown.slice(0, 3)).toEqual(['symbol-props', 'effects', 'text']);
    expect(r.shown).toContain('tool-options');
  });

  it('a broken relevance check shows the section rather than losing it', () => {
    const before = PANEL_INFO.camera.relevant;
    PANEL_INFO.camera.relevant = () => {
      throw new Error('boom');
    };
    try {
      expect(sectionsNow(['camera'], state(), null).shown).toEqual(['camera']);
    } finally {
      PANEL_INFO.camera.relevant = before;
    }
  });
});

describe('panel search', () => {
  it('finds panels by name, blurb, keywords and half words', () => {
    expect(matchPanel({ id: 'effects', title: 'Effects' }, 'glow')).toBe(true);
    expect(matchPanel({ id: 'library', title: 'Library' }, 'sym')).toBe(true);
    expect(matchPanel({ id: 'lipsync', title: 'Lip sync' }, 'mouth voice')).toBe(true);
    expect(matchPanel({ id: 'lipsync', title: 'Lip sync' }, 'glow')).toBe(false);
    expect(matchPanel({ id: 'help', title: 'Help' }, '  ')).toBe(true);
  });
});

describe('folded sections', () => {
  it('folds, opens, opens only one and folds all', () => {
    folded.set([]);
    setFolded('colors', true);
    expect(folded.get()).toEqual(['colors']);
    setFolded('colors', true);
    expect(folded.get()).toEqual(['colors']);
    onlyOpen('effects', ['tool-options', 'colors', 'effects']);
    expect(folded.get().sort()).toEqual(['colors', 'tool-options']);
    foldAll(['tool-options', 'colors', 'effects'], false);
    expect(folded.get()).toEqual([]);
    foldAll(['a', 'b'], true);
    expect(folded.get()).toEqual(['a', 'b']);
    folded.set([]);
  });
});
