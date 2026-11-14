// The layer line, the way back to a layer, and the one question about hiding or greying the tools that do not work.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { resetChoices, currentChoice, rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { newDoc, newPixelLayer, newTilemapLayer } from '../../src/core/doc';
import type { Layer } from '../../src/core/format';
import { getCommand, getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import '../../src/ui/dockCommands';
import { flipSideFor, goToLayerKind, layerWord, MAKE_LAYER_CHOICE, modeLine, OFF_LAYER_CHOICE, offInGroup, planPress, pressSide, sideOf, sideWord, sizeForNewPixelLayer, tellAboutOffLayer, topLayerOf } from '../../src/ui/drawingMode';
import { getPrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { toasts } from '../../src/ui/toast';
import type { WaitingTool } from '../../src/ui/toolArrange';

const W = (id: string, label: string, needs: 'vector' | 'pixel' = 'pixel'): WaitingTool => ({ id, label, needs });

describe('modeLine', () => {
  it('names the layer, and says nothing is off when every tool works', () => {
    const m = modeLine('pixel', 'Sprite', []);
    expect(m.word).toBe('Pixel layer');
    expect(m.off).toBe('');
    expect(m.needs).toBeNull();
    expect(m.tip).toBe('Pixel layer "Sprite"');
    expect(layerWord('tilemap')).toBe('Tile layer');
  });

  it('counts the tools that are off, names the first few, and says what they need', () => {
    const m = modeLine('vector', 'Layer 2', [W('shade', 'Shade'), W('dither', 'Dither'), W('spray', 'Spray'), W('wand', 'Magic wand'), W('slice', 'Slice')]);
    expect(m.off).toBe('5 tools off');
    expect(m.needs).toBe('pixel');
    expect(m.desc).toBe('Shade, Dither, Spray and 2 more need a pixel layer. Press Pixels to go to one.');
    expect(m.label).toContain('You are drawing on a vector layer "Layer 2". 5 tools are off the rail');
  });

  it('says one tool in the singular, and greyed out when they are greyed', () => {
    expect(modeLine('pixel', '', [W('text', 'Text', 'vector')]).off).toBe('1 tool off');
    expect(modeLine('pixel', '', [W('text', 'Text', 'vector')]).desc).toBe('Text needs a vector layer. Press Vectors to go to one.');
    expect(modeLine('vector', '', [W('shade', 'Shade'), W('dither', 'Dither')], true).off).toBe('2 greyed out');
  });
});

describe('offInGroup', () => {
  it('counts the tools of a group that are waiting', () => {
    expect(offInGroup(['pencil', 'shade', 'dither'], new Set(['shade', 'dither', 'text']))).toBe(2);
    expect(offInGroup(['pencil'], new Set())).toBe(0);
  });
});

describe('going to a layer of a kind', () => {
  beforeEach(() => toasts.set([]));

  it('picks the top layer of that kind', () => {
    const d = newDoc({ width: 100, height: 100 });
    d.layers.push(newPixelLayer('Low', 8), newPixelLayer('High', 8));
    resetStore(d);
    expect(topLayerOf(d.layers, 'pixel')?.name).toBe('High');
    expect(goToLayerKind('pixel')).toBe(true);
    expect(store().get().ui.activeLayerId).toBe(d.layers[2].id);
  });

  it('with none, says how to make one and picks nothing', () => {
    const d = newDoc({ width: 100, height: 100 });
    resetStore(d);
    store().setUi({ activeLayerId: d.layers[0].id });
    expect(goToLayerKind('pixel')).toBe(false);
    expect(store().get().ui.activeLayerId).toBe(d.layers[0].id);
    expect(toasts.get().some((t) => /no pixel layer yet/.test(t.message))).toBe(true);
  });

  it('is in the command palette for both kinds', () => {
    const d = newDoc({ width: 100, height: 100 });
    d.layers.push(newPixelLayer('Sprite', 8));
    resetStore(d);
    getCommand('layers.go.pixel')!.run();
    expect(store().get().ui.activeLayerId).toBe(d.layers[1].id);
    getCommand('layers.go.vector')!.run();
    expect(store().get().ui.activeLayerId).toBe(d.layers[0].id);
  });
});

describe('hide them or grey them out: one setting, asked once', () => {
  beforeEach(() => {
    resetChoices();
    resetPrefs();
    setChoiceAsker(null);
  });

  it('a preference moved off the default counts as the answer', () => {
    setPrefs({ toolsOffLayer: 'grey' });
    expect(rememberedChoice(OFF_LAYER_CHOICE)).toBe('grey');
  });

  it('the answer in Preferences, Behaviour moves the preference', () => {
    setChoice(OFF_LAYER_CHOICE, 'grey');
    expect(getPrefs().toolsOffLayer).toBe('grey');
    setChoice(OFF_LAYER_CHOICE, 'hide');
    expect(getPrefs().toolsOffLayer).toBe('hide');
  });

  it('is not asked again once it has an answer, and leaves that answer alone', () => {
    setChoice(OFF_LAYER_CHOICE, 'grey');
    tellAboutOffLayer();
    expect(getPrefs().toolsOffLayer).toBe('grey');
    expect(currentChoice(OFF_LAYER_CHOICE)).toBe('grey');
  });
});

// ---- The Pixels | Vectors switch: what it shows, what pressing it does, and which tools flip it.

const layersOf = (...kinds: ('vector' | 'pixel')[]): Layer[] => {
  const d = newDoc({ width: 100, height: 100 });
  return kinds.map((k, i) => (k === 'pixel' ? newPixelLayer(`P${i}`, 4 + i) : { ...d.layers[0], id: `v${i}`, name: `V${i}` }));
};

describe('the switch shows the kind of layer', () => {
  it('lights Pixels on a pixel layer, Vectors on a vector layer, and neither on tile and camera layers', () => {
    expect(sideOf('pixel')).toBe('pixel');
    expect(sideOf('vector')).toBe('vector');
    expect(sideOf('tilemap')).toBeNull();
    expect(sideOf('camera')).toBeNull();
    expect(sideOf(null)).toBeNull();
    expect(sideWord('pixel')).toBe('Pixels');
    expect(sideWord('vector')).toBe('Vectors');
  });

  it('says which side to press in its words', () => {
    expect(modeLine('pixel', '', []).desc).toContain('Press Vectors to go to a vector layer.');
    expect(modeLine('vector', '', []).desc).toContain('Press Pixels to go to a pixel layer.');
    expect(modeLine('tilemap', '', []).desc).toContain('Press Pixels or Vectors');
  });
});

describe('pressing a side', () => {
  it('does nothing on the side you are already on', () => {
    expect(planPress(layersOf('vector', 'pixel'), 'pixel', 'pixel')).toEqual({ do: 'stay' });
  });

  it('goes to the top layer of that kind', () => {
    const layers = layersOf('vector', 'pixel', 'pixel', 'vector');
    expect(planPress(layers, 'vector', 'pixel')).toMatchObject({ do: 'go', name: 'P2' });
    expect(planPress(layers, 'pixel', 'vector')).toMatchObject({ do: 'go', name: 'V3' });
  });

  it('with no layer of that kind, says to make one', () => {
    expect(planPress(layersOf('vector'), 'vector', 'pixel')).toEqual({ do: 'make' });
    expect(planPress(layersOf('pixel'), 'pixel', 'vector')).toEqual({ do: 'make' });
  });

  it('from a tile layer both sides go somewhere', () => {
    expect(planPress(layersOf('vector', 'pixel'), 'tilemap', 'pixel')).toMatchObject({ do: 'go' });
    expect(planPress(layersOf('vector', 'pixel'), 'tilemap', 'vector')).toMatchObject({ do: 'go' });
  });
});

describe('which tools flip the switch', () => {
  it('Shade, Dither, Spray, Magic wand and Slices flip it to Pixels from a vector layer', () => {
    for (const id of ['shade', 'dither', 'spray', 'pixel-select-wand', 'slice']) {
      expect(flipSideFor(getTool(id)!.layers, 'vector'), id).toBe('pixel');
      expect(flipSideFor(getTool(id)!.layers, 'pixel'), id).toBeNull();
    }
  });

  it('Edit points and Shape hints flip it to Vectors from a pixel layer', () => {
    expect(flipSideFor(getTool('points')!.layers, 'pixel')).toBe('vector');
    expect(flipSideFor(['vector'], 'pixel')).toBe('vector');
    expect(flipSideFor(['vector'], 'vector')).toBeNull();
  });

  it('tools that work on both leave it alone', () => {
    for (const id of ['brush', 'pencil', 'fill', 'eraser']) {
      const t = getTool(id);
      if (!t) continue;
      expect(flipSideFor(t.layers, 'vector'), id).toBeNull();
      expect(flipSideFor(t.layers, 'pixel'), id).toBeNull();
    }
    expect(flipSideFor(['vector', 'pixel'], 'tilemap')).toBeNull();
  });

  it('tile and camera tools are not a side of the switch', () => {
    expect(flipSideFor(['tilemap'], 'pixel')).toBeNull();
    expect(flipSideFor(['camera'], 'vector')).toBeNull();
    expect(flipSideFor(['pixel'], null)).toBeNull();
  });
});

describe('the size of a layer made from the switch', () => {
  it('copies the top pixel layer', () => {
    expect(sizeForNewPixelLayer(layersOf('pixel', 'vector', 'pixel'), 8)).toEqual({ size: 6, from: 'layer' });
  });

  it('else a tile layer\'s size, since tiles sit on a pixel grid', () => {
    const tiles = newTilemapLayer('Tiles', 12);
    expect(sizeForNewPixelLayer([...layersOf('vector'), tiles], 8)).toEqual({ size: 12, from: 'tiles' });
  });

  it('else comes from the preference, kept to a whole number of at least one', () => {
    expect(sizeForNewPixelLayer(layersOf('vector'), 16)).toEqual({ size: 16, from: 'prefs' });
    expect(sizeForNewPixelLayer(layersOf('vector'), 0)).toEqual({ size: 1, from: 'prefs' });
    expect(sizeForNewPixelLayer(layersOf('vector'), 2.6)).toEqual({ size: 3, from: 'prefs' });
  });

  it('the preference is kept between 1 and 64 and starts at 8', async () => {
    const { migratePrefs, DEFAULT_PREFS } = await import('../../src/ui/prefs');
    expect(DEFAULT_PREFS.newPixelSize).toBe(8);
    expect(migratePrefs({}).newPixelSize).toBe(8);
    expect(migratePrefs({ newPixelSize: 500 }).newPixelSize).toBe(64);
    expect(migratePrefs({ newPixelSize: -2 }).newPixelSize).toBe(1);
    expect(migratePrefs({ newPixelSize: 'big' }).newPixelSize).toBe(8);
  });
});

describe('pressing a side with no layer of that kind: asked once, then remembered', () => {
  beforeEach(() => {
    resetChoices();
    resetPrefs();
    setChoiceAsker(null);
    toasts.set([]);
  });

  const vectorOnly = () => {
    const d = newDoc({ width: 100, height: 100 });
    resetStore(d);
    store().setUi({ activeLayerId: d.layers[0].id });
    return d;
  };

  it('makes the layer by default, above the one you are on, and says what size it chose', () => {
    setPrefs({ newPixelSize: 16 });
    const d = vectorOnly();
    pressSide('pixel');
    const layers = store().get().doc.layers;
    expect(layers.length).toBe(d.layers.length + 1);
    const made = layers.find((l) => l.kind === 'pixel');
    expect(made?.kind === 'pixel' && made.pixelSize).toBe(16);
    expect(store().get().ui.activeLayerId).toBe(made?.id);
    expect(toasts.get().some((t) => /squares are 16 wide, from your Preferences/.test(t.message))).toBe(true);
  });

  it('makes a vector layer when asked from a pixel layer', () => {
    const d = newDoc({ width: 100, height: 100 });
    d.layers = [newPixelLayer('Sprite', 8)];
    resetStore(d);
    store().setUi({ activeLayerId: d.layers[0].id });
    pressSide('vector');
    const now = store().get();
    expect(now.doc.layers.find((l) => l.id === now.ui.activeLayerId)?.kind).toBe('vector');
  });

  it('with "Just tell me how" remembered, makes nothing and says how', () => {
    setChoice(MAKE_LAYER_CHOICE, 'tell');
    const d = vectorOnly();
    let declined = false;
    pressSide('pixel', { declined: () => (declined = true) });
    expect(store().get().doc.layers.length).toBe(d.layers.length);
    expect(declined).toBe(true);
    expect(toasts.get().some((t) => /no pixel layer yet/.test(t.message))).toBe(true);
  });

  it('is one choice, listed with its answers, and makes the layer when nothing can ask', () => {
    expect(currentChoice(MAKE_LAYER_CHOICE)).toBe('make');
    expect(rememberedChoice(MAKE_LAYER_CHOICE)).toBeUndefined();
  });

  it('a layer that is there is just gone to, with the tool that sent you named', () => {
    const d = newDoc({ width: 100, height: 100 });
    d.layers.push(newPixelLayer('Sprite', 8));
    resetStore(d);
    store().setUi({ activeLayerId: d.layers[0].id });
    pressSide('pixel', { because: 'Shade' });
    expect(store().get().ui.activeLayerId).toBe(d.layers[1].id);
    expect(toasts.get().some((t) => t.message === 'Shade works on pixel layers, so you are now on "Sprite".')).toBe(true);
  });
});
