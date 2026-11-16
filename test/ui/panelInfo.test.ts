// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { Store, type State } from '../../src/core/store';
import { cameraFeature } from '../../src/camera';
import { flowFeature } from '../../src/flow';
import { lipsyncFeature } from '../../src/lipsync';
import { particlesFeature } from '../../src/particles';
import { rigFeature } from '../../src/rig';
import { textFeature } from '../../src/text';
import { tilesFeature } from '../../src/tiles';
import { groupWord, infoFor, isSection, registerPanelInfo, matchPanel, PANEL_INFO, planRight, railGroups, sectionsNow, splitZone, whenShown } from '../../src/ui/panelInfo';
import { setChoice } from '../../src/core/choices';
import { PROPS_ORDER_CHOICE } from '../../src/ui/propsOrder';
import { folded, foldAll, onlyOpen, setFolded } from '../../src/ui/rightStyle';

// A feature adds its own entry when it is on.
for (const f of [lipsyncFeature, flowFeature, cameraFeature, particlesFeature, rigFeature, textFeature, tilesFeature]) for (const [id, info] of Object.entries(f.sections ?? {})) registerPanelInfo(id, info);

const SECTIONS = ['tool-options', 'colors', 'palette', 'tileset', 'symbol-props', 'selection-numbers', 'align', 'effects', 'text', 'particles', 'camera', 'rig'];

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

  it('plans stacked groups for one rail: Properties only in the first, the rest are plain places', () => {
    const plan = planRight(
      [
        { tabs: ['tool-options', 'library', 'colors'], active: 'colors' },
        { tabs: ['colors2', 'preview'], active: null },
        { tabs: ['effects'], active: 'effects' },
      ],
      true,
    );
    expect(plan[0]).toMatchObject({ index: 0, sections: ['tool-options', 'colors'], active: 'colors', onProps: true, places: [{ group: 'make', ids: ['library'] }] });
    expect(plan[1]).toMatchObject({ sections: [], active: 'colors2', onProps: false });
    // A Properties section dragged into a lower group is just a place there.
    expect(plan[2]).toMatchObject({ sections: [], onProps: false });
    expect(plan[2].places.flatMap((g) => g.ids)).toEqual(['effects']);
    expect(planRight([{ tabs: ['tool-options', 'library'], active: 'library' }], false)[0].sections).toEqual([]);
  });

  it('names stacked groups by where they sit', () => {
    expect(groupWord(0, 1)).toBe('Right side');
    expect([0, 1].map((i) => groupWord(i, 2))).toEqual(['Top group', 'Bottom group']);
    expect([0, 1, 2].map((i) => groupWord(i, 3))).toEqual(['Top group', 'Middle group', 'Bottom group']);
    expect([0, 1, 2, 3].map((i) => groupWord(i, 4))).toEqual(['Top group', 'Upper group', 'Lower group', 'Bottom group']);
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
  it('shows the tool and colours while drawing, the rest are left out of Properties', () => {
    const r = sectionsNow(SECTIONS, state({ tool: 'brush' }), 'tool-options');
    expect(r.shown).toEqual(['colors', 'tool-options']);
    expect(r.idle).toEqual(['palette', 'tileset', 'symbol-props', 'selection-numbers', 'align', 'effects', 'text', 'particles', 'camera', 'rig']);
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

  /** A text shape picked on the top layer. */
  const picked = () => {
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
    return s;
  };

  it('puts Colours first, then the sections about a selection, then the rest', () => {
    const r = sectionsNow(SECTIONS, picked().get(), 'tool-options');
    expect(r.shown.slice(0, 5)).toEqual(['colors', 'selection-numbers', 'align', 'effects', 'text']);
    expect(r.shown).toContain('tool-options');
    // A plain shape is not a symbol: Symbol and motion is still there (for the in-betweens) but does not lead.
    expect(r.shown.indexOf('symbol-props')).toBeGreaterThan(r.shown.indexOf('text'));
  });

  it('puts Position and size, then Align, first among the sections about a selection, wherever the layout holds them', () => {
    const r = sectionsNow(['align', 'effects', 'selection-numbers', 'colors', 'text'], picked().get(), null);
    expect(r.shown).toEqual(['colors', 'selection-numbers', 'align', 'effects', 'text']);
  });

  it('has no Position and size or Align with nothing selected', () => {
    const r = sectionsNow(SECTIONS, state({ tool: 'select' }), null);
    expect(r.shown).not.toContain('selection-numbers');
    expect(r.shown).not.toContain('align');
    expect(r.idle).toEqual(expect.arrayContaining(['selection-numbers', 'align']));
  });

  it('leads Symbol and motion with the selection only when a symbol is picked', () => {
    const s = new Store(newDoc());
    const doc = s.get().doc;
    const layer = doc.layers[doc.layers.length - 1];
    s.update('add', (d) => {
      const l = d.layers.find((x) => x.id === layer.id)!;
      d.drawings.dr1 = { id: 'dr1', kind: 'vector', shapes: [{ id: 'inst1', type: 'instance', symbolId: 'sym1', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0 } as never] };
      l.cels = [{ id: 'cel1', start: 0, length: 4, drawingId: 'dr1' }];
    });
    s.setUi({ activeLayerId: layer.id, selection: ['inst1'], tool: 'select' });
    expect(sectionsNow(SECTIONS, s.get(), null).shown.slice(0, 4)).toEqual(['colors', 'selection-numbers', 'align', 'symbol-props']);
  });

  it('puts the sections about a selection first when that is the answer in Preferences', () => {
    setChoice(PROPS_ORDER_CHOICE, 'selection');
    try {
      const r = sectionsNow(SECTIONS, picked().get(), 'tool-options');
      expect(r.shown.slice(0, 4)).toEqual(['selection-numbers', 'align', 'effects', 'text']);
      expect(r.shown.indexOf('colors')).toBeGreaterThan(3);
      // With nothing picked the answer makes no difference: Colours still lead.
      expect(sectionsNow(SECTIONS, state(), null).shown[0]).toBe('colors');
    } finally {
      setChoice(PROPS_ORDER_CHOICE, undefined);
    }
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

describe('Panels list: when a section turns up', () => {
  const p = (id: string) => ({ id, title: id });
  it('says it in the words of the old idle line', () => {
    expect(whenShown(p('palette'))).toBe('Shows up when you pick a pixel layer');
    expect(whenShown(p('clip-play'))).toBe('Shows up when you click a clip on the timeline');
    expect(whenShown(p('particles'))).toBe('Shows up when you select particles on the canvas');
  });
  it('has no line for sections that are always there, or for rail places', () => {
    expect(whenShown(p('tool-options'))).toBeUndefined();
    expect(whenShown(p('library'))).toBeUndefined();
  });
  it('every section that can be idle has one, and none has an em dash', () => {
    for (const [id, info] of Object.entries(PANEL_INFO)) {
      if (!info.section) continue;
      const line = whenShown(p(id));
      if (info.relevant) expect(line, id).toBeTruthy();
      expect(line ?? '').not.toContain('\u2014');
    }
  });
  it('finds a section by when it shows up', () => {
    expect(matchPanel(p('palette'), 'pixel layer')).toBe(true);
    expect(matchPanel(p('clip-play'), 'timeline')).toBe(true);
  });
});
