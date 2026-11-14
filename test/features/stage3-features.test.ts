// @vitest-environment jsdom
// Godot exports, Camera, Particles and Text as switchable features: what goes when they are off (commands, panels,
// tools, help, choices, quest, templates, the Godot engine card), what a drawing keeps (the data, and how it draws
// and exports), and the question when a file uses one.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cameraFeature } from '../../src/camera';
import { godotFeature } from '../../src/export/godot';
import { particlesFeature } from '../../src/particles';
import { textFeature } from '../../src/text';
import { audioFeature } from '../../src/audio';
import { flowFeature } from '../../src/flow';
import { interactivesFeature } from '../../src/interactives';
import { lipsyncFeature } from '../../src/lipsync';
import { getChoiceDef } from '../../src/core/choices';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { VectorDrawing } from '../../src/core/format';
import { getCommand, getHelp, getPanel, getTool } from '../../src/core/registry';
import { renderFrame } from '../../src/core/render';
import { addCamera } from '../../src/camera/ops';
import { resetStore, store } from '../../src/core/store';
import { allEngines, hasEngine, normalizeSheet, DEFAULT_SHEET } from '../../src/export/types';
import { hiddenHelp, hiddenTemplateIds, _resetFeaturesForTests, isFeatureOn, offFeaturesUsedBy, registerFeatures, setFeatureOn } from '../../src/features/host';
import { offerTurnOn } from '../../src/features/prompt';
import { questFeaturesOn } from '../../src/features/sync';
import { loadFile, saveFile } from '../../src/io/file';
import { newParticles } from '../../src/particles/model';
import { QUESTS } from '../../src/quests/library';
import { rigFeature } from '../../src/rig';
import { tilesFeature } from '../../src/tiles';
import { newTextShape } from '../../src/text/model';
import { frameToSvg } from '../../src/export/svg';
import { _forceInteractivesForTests } from '../../src/features/flags';

// These tests are about Interactives itself (and what goes with it), so they run with its switch (src/features/flags.json) on.
beforeAll(() => _forceInteractivesForTests(true));
afterAll(() => _forceInteractivesForTests(undefined));

const ALL = [rigFeature, tilesFeature, audioFeature, cameraFeature, flowFeature, godotFeature, interactivesFeature, lipsyncFeature, particlesFeature, textFeature];
const off = (id: string) => expect(setFeatureOn(id, false, { remember: false }).ok, id).toBe(true);
const on = (id: string) => expect(setFeatureOn(id, true, { remember: false }).ok, id).toBe(true);

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
  registerFeatures(ALL);
});
afterEach(() => {
  vi.restoreAllMocks();
  _resetFeaturesForTests();
});

const docWithText = () => {
  const doc = newDoc({ width: 200, height: 100, length: 2 });
  const layer = newVectorLayer('L');
  doc.drawings.d = { id: 'd', kind: 'vector', shapes: [newTextShape('t1', { x: 20, y: 40 }, { text: 'Hello' })] } as VectorDrawing;
  layer.cels = [{ id: 'c', start: 0, length: 2, drawingId: 'd' }];
  doc.layers = [layer];
  return doc;
};
const docWithEmitter = () => {
  const doc = docWithText();
  (doc.drawings.d as VectorDrawing).shapes = [newParticles('p1', 'confetti', { x: 100, y: 40 })];
  return doc;
};

describe('every optional feature is switchable now', () => {
  it('lists Godot exports, Camera, Particles, Text, Tiles and Rig as switchable, on to begin with', () => {
    for (const f of [godotFeature, cameraFeature, particlesFeature, textFeature, tilesFeature, rigFeature]) {
      expect(f.optional && !f.legacy, f.id).toBe(true);
      expect(isFeatureOn(f.id), f.id).toBe(true);
    }
  });
});

describe('Godot exports', () => {
  it('adds the Godot card, the add-on command and its help, and takes them away when off', () => {
    expect(hasEngine('godot')).toBe(true);
    expect(allEngines().map((e) => e.id)).toEqual(['godot', 'unity', 'phaser', 'pixi', 'css', 'json', 'none']);
    expect(getCommand('file.exportGodotAddon')).toBeTruthy();
    for (const h of ['export-godot', 'export-godot-bones', 'godot-addon']) expect(getHelp(h), h).toBeTruthy();
    off('godot-export');
    expect(hasEngine('godot')).toBe(false);
    expect(allEngines().map((e) => e.id)).toEqual(['unity', 'phaser', 'pixi', 'css', 'json', 'none']);
    expect(getCommand('file.exportGodotAddon')).toBeUndefined();
    for (const h of ['export-godot', 'export-godot-bones', 'godot-addon']) expect(getHelp(h), h).toBeUndefined();
    expect(hiddenHelp().filter((x) => x.feature.id === 'godot-export').map((x) => x.topic.id).sort()).toEqual(['export-godot', 'export-godot-bones', 'godot-addon']);
    on('godot-export');
    expect(hasEngine('godot')).toBe(true);
    expect(getHelp('export-godot')).toBeTruthy();
  });

  it('a sheet saved for Godot falls back to the engine it would have been without it', () => {
    const godot = normalizeSheet({ ...DEFAULT_SHEET, engine: 'godot' });
    expect(godot.engine).toBe('godot');
    off('godot-export');
    expect(normalizeSheet({ ...DEFAULT_SHEET, engine: 'godot' }).engine).toBe('json');
    expect(normalizeSheet({ ...DEFAULT_SHEET, json: false, godot: true, godotScene: true }).engine).toBe('none');
  });

  it('has no document data, so opening a file never asks about it', () => {
    expect(godotFeature.usedBy).toBeUndefined();
  });
});

describe('Camera', () => {
  it('adds its commands, panel, tool, help, choices of template and goes with them when off', () => {
    expect(getCommand('camera.add')).toBeTruthy();
    expect(getPanel('camera')).toBeTruthy();
    expect(getTool('camera')).toBeTruthy();
    expect(getHelp('camera')).toBeTruthy();
    expect(hiddenTemplateIds().has('camera-parallax')).toBe(false);
    off('camera');
    expect(getCommand('camera.add')).toBeUndefined();
    expect(getCommand('camera.lookThrough')).toBeUndefined();
    expect(getPanel('camera')).toBeUndefined();
    expect(getTool('camera')).toBeUndefined();
    expect(getHelp('camera')).toBeUndefined();
    expect(hiddenHelp().some((x) => x.topic.id === 'camera' && x.feature.id === 'camera')).toBe(true);
    expect(hiddenTemplateIds().has('camera-parallax')).toBe(true);
    on('camera');
    expect(getTool('camera')).toBeTruthy();
  });

  it('hides its lesson while off', () => {
    const q = QUESTS.find((x) => x.id === 'camera-move')!;
    expect(questFeaturesOn(q)).toBe(true);
    off('camera');
    expect(questFeaturesOn(q)).toBe(false);
  });

  it('is used by a drawing with a camera layer, which keeps it (and is still looked through) when off', async () => {
    const doc = newDoc({ width: 200, height: 100, length: 2 });
    expect(cameraFeature.usedBy!(doc)).toBe(false);
    resetStore(doc);
    await addCamera();
    const withCamera = store().get().doc;
    expect(cameraFeature.usedBy!(withCamera)).toBe(true);
    off('camera');
    expect(loadFile(saveFile(withCamera, 't')).doc.layers.some((l) => l.kind === 'camera')).toBe(true);
    expect(offFeaturesUsedBy(withCamera).map((f) => f.id)).toEqual(['camera']);
  });
});

describe('Particles', () => {
  it('adds its commands, panel, help, choice and template and takes them away when off', () => {
    expect(getCommand('particles.add.confetti')).toBeTruthy();
    expect(getPanel('particles')).toBeTruthy();
    expect(getHelp('particles')).toBeTruthy();
    expect(getChoiceDef('particles.where')).toBeTruthy();
    off('particles');
    expect(getCommand('particles.add.confetti')).toBeUndefined();
    expect(getCommand('particles.shuffle')).toBeUndefined();
    expect(getPanel('particles')).toBeUndefined();
    expect(getHelp('particles')).toBeUndefined();
    expect(getChoiceDef('particles.where')).toBeUndefined();
    expect(hiddenTemplateIds().has('explosion-fx')).toBe(true);
    expect(questFeaturesOn(QUESTS.find((x) => x.id === 'particle-party')!)).toBe(false);
  });

  it('a drawing with an emitter still reads, draws and exports with it off, and asks to turn it on', async () => {
    const doc = docWithEmitter();
    expect(particlesFeature.usedBy!(doc)).toBe(true);
    expect(particlesFeature.usedBy!(newDoc())).toBe(false);
    off('particles');
    const opened = loadFile(saveFile(doc, 't')).doc;
    expect((opened.drawings.d as VectorDrawing).shapes.map((s) => s.type)).toEqual(['particles']);
    expect(frameToSvg(opened, 1)).toContain('<g>');
    expect(offFeaturesUsedBy(opened).map((f) => f.id)).toEqual(['particles']);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await offerTurnOn(opened)).toEqual(['particles']);
    expect(getCommand('particles.add.confetti')).toBeTruthy();
  });
});

describe('Text', () => {
  it('adds its tool, commands, panel and help, and takes them away when off', () => {
    expect(getTool('text')).toBeTruthy();
    expect(getCommand('text.toShapes')).toBeTruthy();
    expect(getCommand('text.animate.typewriter')).toBeTruthy();
    expect(getPanel('text')).toBeTruthy();
    expect(getHelp('text')).toBeTruthy();
    off('text');
    expect(getTool('text')).toBeUndefined();
    expect(getCommand('text.toShapes')).toBeUndefined();
    expect(getPanel('text')).toBeUndefined();
    expect(getHelp('text')).toBeUndefined();
    expect(hiddenTemplateIds().has('title-card')).toBe(true);
    expect(questFeaturesOn(QUESTS.find((x) => x.id === 'text-lesson' || x.features?.includes('text'))!)).toBe(false);
  });

  it('a drawing with text still reads, draws and exports with it off, and asks to turn it on', async () => {
    const doc = docWithText();
    expect(textFeature.usedBy!(doc)).toBe(true);
    off('text');
    const opened = loadFile(saveFile(doc, 't')).doc;
    expect((opened.drawings.d as VectorDrawing).shapes.map((s) => s.type)).toEqual(['text']);
    expect(frameToSvg(opened, 0)).toContain('Hello');
    // A context that accepts any call and any setting, to show that drawing it does not stumble.
    const g = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : vi.fn()), set: () => true }) as unknown as CanvasRenderingContext2D;
    expect(() => renderFrame(g, opened, 0, { background: false })).not.toThrow();
    expect(offFeaturesUsedBy(opened).map((f) => f.id)).toEqual(['text']);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await offerTurnOn(opened)).toEqual(['text']);
    expect(getTool('text')).toBeTruthy();
  });

  it('a plugin shape (a path with a text shape beside it, data in ext) keeps its ext and its text with Text off', () => {
    const doc = docWithText();
    const d = doc.drawings.d as VectorDrawing;
    d.shapes = [{ ...d.shapes[0], ext: { 'plugin.star-kit': { kind: 'label', inst: 'i1', part: 1 } } } as never];
    off('text');
    const back = loadFile(saveFile(doc, 't')).doc.drawings.d as VectorDrawing;
    expect(back.shapes[0].type).toBe('text');
    expect((back.shapes[0] as { ext?: unknown }).ext).toEqual({ 'plugin.star-kit': { kind: 'label', inst: 'i1', part: 1 } });
  });
});
