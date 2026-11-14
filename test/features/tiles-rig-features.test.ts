// @vitest-environment jsdom
// Tiles and Rig as switchable features: what goes when they are off (commands, panels, tools, help, choice, lesson,
// templates, Properties entries), what a file keeps (a level still draws, exports and saves, a puppet still moves,
// exports and saves), that Delete is given back as it was, and the question when a file uses one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChoiceDef } from '../../src/core/choices';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, PathShape, VectorLayer } from '../../src/core/format';
import { bindLayer, flattenDrawing } from '../../src/core/layerKinds';
import { getCommand, getHelp, getPanel, getTool, registerCommand } from '../../src/core/registry';
import { renderFrame } from '../../src/core/render';
import { resetStore, store } from '../../src/core/store';
import { isPosed, poseAt } from '../../src/core/symbols';
import { hiddenHelp, hiddenTemplateIds, _resetFeaturesForTests, offFeaturesUsedBy, registerFeatures, setFeatureOn, isFeatureOn } from '../../src/features/host';
import { offerTurnOn } from '../../src/features/prompt';
import { questFeaturesOn } from '../../src/features/sync';
import { frameToSvg } from '../../src/export/svg';
import { loadFile, saveFile } from '../../src/io/file';
import { QUESTS } from '../../src/quests/library';
import { addBone, attachLayer, ensureRig, setPose } from '../../src/rig/ops';
import { rigFeature } from '../../src/rig';
import { tilesFeature } from '../../src/tiles';
import { getTileUi, setTileUi } from '../../src/tiles/state';
import { PANEL_INFO } from '../../src/ui/panelInfo';
import { installFakeCanvas, mainCtx, removeFakeCanvas } from '../perf/fakeCanvas';
import { sampleTileDoc } from '../tiles/helpers';
import { clearTilemapCache, tilemapStats } from '../../src/tiles/map';

const off = (id: string) => expect(setFeatureOn(id, false, { remember: false }).ok, id).toBe(true);
const on = (id: string) => expect(setFeatureOn(id, true, { remember: false }).ok, id).toBe(true);

const deleteBefore = { id: 'edit.delete', label: 'Delete', category: 'Edit', enabled: () => true, run: () => {} } as const;

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
  registerCommand({ ...deleteBefore });
  registerFeatures([tilesFeature, rigFeature]);
});

describe('Tiles', () => {
  it('both are switchable and on to begin with', () => {
    for (const f of [tilesFeature, rigFeature]) {
      expect(f.optional && !f.legacy, f.id).toBe(true);
      expect(isFeatureOn(f.id), f.id).toBe(true);
    }
  });

  it('adds its commands, panel, tools, help and Properties entry, and goes with them when off', () => {
    expect(getCommand('tiles.tileMode')).toBeTruthy();
    expect(getCommand('tiles.export')).toBeTruthy();
    expect(getPanel('tileset')).toBeTruthy();
    expect(getTool('tile-brush')).toBeTruthy();
    expect(getHelp('tileset')).toBeTruthy();
    expect(PANEL_INFO.tileset).toBeTruthy();
    expect(hiddenTemplateIds().has('tileset')).toBe(false);
    off('tiles');
    expect(getCommand('tiles.tileMode')).toBeUndefined();
    expect(getCommand('tiles.export')).toBeUndefined();
    expect(getPanel('tileset')).toBeUndefined();
    for (const t of ['tile-brush', 'tile-eraser', 'tile-rect', 'tile-fill', 'tile-picker']) expect(getTool(t), t).toBeUndefined();
    expect(getHelp('tileset')).toBeUndefined();
    expect(PANEL_INFO.tileset).toBeUndefined();
    expect(hiddenHelp().some((x) => x.topic.id === 'tileset' && x.feature.id === 'tiles')).toBe(true);
    expect([...hiddenTemplateIds()].sort()).toEqual(['blank-level', 'tileset']);
    on('tiles');
    expect(getTool('tile-brush')).toBeTruthy();
    expect(PANEL_INFO.tileset).toBeTruthy();
  });

  it('hides its lesson while off', () => {
    const q = QUESTS.find((x) => x.id === 'tiles')!;
    expect(questFeaturesOn(q)).toBe(true);
    off('tiles');
    expect(questFeaturesOn(q)).toBe(false);
    on('tiles');
    expect(questFeaturesOn(q)).toBe(true);
  });

  it('leaves tile mode when it goes', () => {
    setTileUi({ tileMode: true, sizeForm: true });
    off('tiles');
    expect(getTileUi().tileMode).toBe(false);
    expect(getTileUi().sizeForm).toBe(false);
  });

  describe('a level, with it off', () => {
    beforeEach(() => {
      installFakeCanvas();
      clearTilemapCache();
      tilemapStats.builds = 0;
    });
    afterEach(() => removeFakeCanvas());

    it('still draws, exports and saves the same', () => {
      const { doc } = sampleTileDoc();
      const svgOn = frameToSvg(doc, 0);
      off('tiles');
      renderFrame(mainCtx(), doc, 0);
      expect(tilemapStats.builds).toBe(1);
      expect(frameToSvg(doc, 0)).toBe(svgOn);
      expect(svgOn).toContain('fill="#50b43c"');
      const map = doc.drawings[doc.layers[doc.layers.length - 1].cels[0].drawingId];
      expect(flattenDrawing(doc, map, 0)?.width).toBe(64);
      const back = loadFile(saveFile(doc, 't')).doc;
      const was = map.kind === 'tilemap' ? [...map.cells] : [];
      const now = back.drawings[map.id];
      expect(now.kind === 'tilemap' ? [...now.cells] : []).toEqual(was);
      expect(back.tileset?.tiles.length).toBe(doc.tileset?.tiles.length);
    });

    it('asks to turn Tiles on when a file that uses it opens, and does so on a yes', async () => {
      const { doc } = sampleTileDoc();
      off('tiles');
      expect(offFeaturesUsedBy(doc).map((f) => f.id)).toEqual(['tiles']);
      expect(offFeaturesUsedBy(newDoc()).map((f) => f.id)).toEqual([]);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      expect(await offerTurnOn(doc)).toEqual(['tiles']);
      expect(getTool('tile-brush')).toBeTruthy();
    });
  });
});

// A stage with an "arm" layer (a bar) and a bones layer with one bone along it, the arm attached to it, posed a quarter turn.
function puppet(): { doc: Doc; armId: string } {
  const doc = newDoc({ width: 200, height: 200, length: 20 });
  const d = newVectorDrawing();
  const bar: PathShape = { id: 'bar', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: -5 }, { x: 100, y: -5 }, { x: 100, y: 5 }, { x: 0, y: 5 }] }], fill: '#ff0000', stroke: null, opacity: 1 };
  d.shapes.push(bar);
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 20, drawingId: d.id });
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  const rigId = ensureRig();
  addBone(rigId, { x: 0, y: 0 }, { x: 100, y: 0 }, null, 'Arm');
  attachLayer(doc.layers[0].id, rigId, (store().get().doc.layers.find((l) => l.id === rigId) as VectorLayer).rig!.bones[0].id);
  setPose(rigId, { [(store().get().doc.layers.find((l) => l.id === rigId) as VectorLayer).rig!.bones[0].id]: { r: 90 } });
  return { doc: store().get().doc, armId: doc.layers[0].id };
}

describe('Rig', () => {
  it('adds its commands, panel, tools, help, choice and Properties entry, and goes with them when off', () => {
    expect(getCommand('rig.addBones')).toBeTruthy();
    expect(getPanel('rig')).toBeTruthy();
    for (const t of ['bone', 'pose', 'weights']) expect(getTool(t), t).toBeTruthy();
    expect(getHelp('rig')).toBeTruthy();
    expect(getChoiceDef('rig.newPose')).toBeTruthy();
    expect(PANEL_INFO.rig).toBeTruthy();
    expect(hiddenTemplateIds().has('puppet')).toBe(false);
    off('rig');
    expect(getCommand('rig.addBones')).toBeUndefined();
    expect(getPanel('rig')).toBeUndefined();
    for (const t of ['bone', 'pose', 'weights']) expect(getTool(t), t).toBeUndefined();
    expect(getHelp('rig')).toBeUndefined();
    expect(getChoiceDef('rig.newPose')).toBeUndefined();
    expect(PANEL_INFO.rig).toBeUndefined();
    expect(hiddenHelp().some((x) => x.topic.id === 'rig' && x.feature.id === 'rig')).toBe(true);
    expect(hiddenTemplateIds().has('puppet')).toBe(true);
    on('rig');
    expect(getTool('pose')).toBeTruthy();
  });

  it('hides its lesson while off', () => {
    const q = QUESTS.find((x) => x.id === 'bones-and-pose')!;
    off('rig');
    expect(questFeaturesOn(q)).toBe(false);
    on('rig');
    expect(questFeaturesOn(q)).toBe(true);
  });

  it('takes Delete over while on and gives it back as it was when off', () => {
    const mine = getCommand('edit.delete')!;
    expect(mine.run).not.toBe(deleteBefore.run);
    off('rig');
    const after = getCommand('edit.delete')!;
    expect(after.id).toBe('edit.delete');
    expect(after.run).toBe(deleteBefore.run);
    on('rig');
    expect(getCommand('edit.delete')!.run).not.toBe(deleteBefore.run);
    off('rig');
    expect(getCommand('edit.delete')!.run).toBe(deleteBefore.run);
  });

  it('a puppet with it off still moves, exports and saves the same', () => {
    const { doc, armId } = puppet();
    const arm = doc.layers.find((l) => l.id === armId)!;
    const drawing = poseAt(doc, arm, 0)!;
    const svgOn = frameToSvg(doc, 0);
    off('rig');
    // The pose the bone gives is still applied: the arm is a posed group, not its plain drawing.
    const still = poseAt(doc, arm, 0)!;
    const group = still.kind === 'vector' ? still.shapes[0] : undefined;
    expect(group && isPosed(group)).toBe(true);
    expect(still).toBe(drawing);
    expect(bindLayer(doc, arm, 0, doc.drawings[arm.cels[0].drawingId])).toBe(drawing);
    expect(frameToSvg(doc, 0)).toBe(svgOn);
    const back = loadFile(saveFile(doc, 'p')).doc;
    expect((back.layers.find((l) => l.id === armId) as { bind?: unknown }).bind).toEqual((arm as { bind?: unknown }).bind);
    expect(back.layers.some((l) => 'rig' in l && !!l.rig)).toBe(true);
    // Drawing it does not stumble either.
    installFakeCanvas();
    try {
      expect(() => renderFrame(mainCtx(), doc, 0, { background: false })).not.toThrow();
    } finally {
      removeFakeCanvas();
    }
  });

  it('asks to turn Rig on when a file that uses it opens', async () => {
    const { doc } = puppet();
    off('rig');
    expect(offFeaturesUsedBy(doc).map((f) => f.id)).toEqual(['rig']);
    expect(offFeaturesUsedBy(newDoc()).map((f) => f.id)).toEqual([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await offerTurnOn(doc)).toEqual(['rig']);
    expect(getTool('pose')).toBeTruthy();
  });
});
