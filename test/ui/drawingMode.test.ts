// The layer line, the way back to a layer, and the one question about hiding or greying the tools that do not work.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { resetChoices, currentChoice, rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import '../../src/ui/dockCommands';
import { goToLayerKind, layerWord, modeLine, OFF_LAYER_CHOICE, offInGroup, tellAboutOffLayer, topLayerOf } from '../../src/ui/drawingMode';
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
    expect(m.desc).toBe('Shade, Dither, Spray and 2 more need a pixel layer. Press to go to one.');
    expect(m.label).toContain('You are drawing on a vector layer "Layer 2". 5 tools are off the rail');
  });

  it('says one tool in the singular, and greyed out when they are greyed', () => {
    expect(modeLine('pixel', '', [W('text', 'Text', 'vector')]).off).toBe('1 tool off');
    expect(modeLine('pixel', '', [W('text', 'Text', 'vector')]).desc).toBe('Text needs a vector layer. Press to go to one.');
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
