// @vitest-environment jsdom
// Commands run: "on in some state" only says the command is not greyed. This runs every command that used to sit on
// NEVER_SEEN_WORKING (tiles, rig, flow, particles, pixel text) in the state that switches it on, and checks that it
// does not throw and that something really changed: the document, a picked thing, a dialog, a message. A command that
// is on and does nothing is the thing this exists to catch.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allCommands, type Command } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { getTileUi } from '../../src/tiles/state';
import { rigUi } from '../../src/rig/state';
import { tl } from '../../src/timeline/state';
import { getPixelText } from '../../src/text/pixel/settings';
import { editingTileKey } from '../../src/tiles/tileEdit';
import { currentChoice } from '../../src/core/choices';
import { AUTO_EDGES } from '../../src/tiles/choices';
import { clearToasts, toasts } from '../../src/ui/toast';
import { commandEnabled } from '../../src/ui/palette';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { FEATURE_STATES, loadApp, quietWorld, SITUATIONS, type FeatureState } from './app';

/** Like inFeatureState, but waits for an async body: inFeatureState puts the world back as soon as the body first awaits. */
async function inState(state: FeatureState, fn: () => Promise<void>): Promise<void> {
  quietWorld();
  state.set();
  syncDynamicCommands();
  try {
    await fn();
  } finally {
    quietWorld();
    syncDynamicCommands();
  }
}

type Snap = ReturnType<typeof snap>;
const snap = () => {
  const s = store().get();
  const root = store().rootDoc();
  return {
    doc: s.doc,
    rootDoc: root,
    docJson: JSON.stringify(root),
    ui: JSON.stringify({ ...s.ui, selection: [...s.ui.selection] }),
    tile: JSON.stringify(getTileUi()),
    rig: JSON.stringify(rigUi()),
    clip: tl().clipId,
    text: JSON.stringify(getPixelText()),
    editing: editingTileKey(),
    autoEdges: String(currentChoice(AUTO_EDGES)),
    toasts: toasts.get().length,
    dialogs: document.querySelectorAll('[role="dialog"], .modal, .dialog').length,
  };
};
const tileKeys = (d: Snap['rootDoc']) => (d.tileset?.tiles ?? []).map((t) => t.key);
const layerOf = (d: Snap['rootDoc'], id: string | null) => d.layers.find((l) => l.id === id);

/** What each command must do, beyond "something changed". */
const EFFECT: Record<string, (b: Snap, a: Snap) => boolean> = {
  'tiles.edit': (b, a) => b.editing === 0 && a.editing !== 0,
  'tiles.done': (b, a) => b.editing !== 0 && a.editing === 0,
  'tiles.duplicate': (b, a) => tileKeys(a.rootDoc).length === tileKeys(b.rootDoc).length + 1,
  'tiles.delete': (b, a) => tileKeys(a.rootDoc).length === tileKeys(b.rootDoc).length - 1,
  'tiles.flipX': (b, a) => a.tile !== b.tile,
  'tiles.flipY': (b, a) => a.tile !== b.tile,
  'tiles.rotate': (b, a) => a.tile !== b.tile,
  'tiles.nextTile': (b, a) => a.tile !== b.tile || tileKeys(a.rootDoc).length === 1,
  'tiles.prevTile': (b, a) => a.tile !== b.tile || tileKeys(a.rootDoc).length === 1,
  'tiles.solid': (b, a) => a.docJson !== b.docJson,
  'tiles.guessEdges': (b, a) => a.docJson !== b.docJson,
  'rig.autoAttach': (b, a) => a.docJson !== b.docJson,
  'rig.bendLayer': (b, a) => a.docJson !== b.docJson,
  'tiles.autoEdges': (b, a) => a.autoEdges !== b.autoEdges,
  'tiles.clearShapes': (b, a) => a.docJson !== b.docJson,
  'tiles.oneWay': (b, a) => a.docJson !== b.docJson,
  'tiles.showShapes': (b, a) => a.tile !== b.tile,
  'tiles.addValue': (b, a) => a.tile !== b.tile || a.docJson !== b.docJson,
  'tiles.addTerrain': (b, a) => (a.rootDoc.tileset?.terrains?.length ?? 0) === (b.rootDoc.tileset?.terrains?.length ?? 0) + 1,
  'tiles.makeEdgeTiles': (b, a) => tileKeys(a.rootDoc).length > tileKeys(b.rootDoc).length,
  'tiles.export': (_b, a) => a.dialogs > 0,
  'rig.detachLayer': (b, a) => !!layerOf(b.doc, store().get().ui.activeLayerId)?.bind && !layerOf(a.doc, store().get().ui.activeLayerId)?.bind,
  'rig.deleteBone': (b, a) => a.docJson.length < b.docJson.length,
  'rig.deleteBranch': (b, a) => a.docJson.length < b.docJson.length,
  'rig.addChildBone': (b, a) => a.docJson.length > b.docJson.length,
  'rig.pickParent': (b, a) => a.rig !== b.rig,
  'rig.pickChild': (b, a) => a.rig !== b.rig,
  'flow.fromAny': (b, a) => a.docJson !== b.docJson,
  'particles.shuffle': (b, a) => a.docJson !== b.docJson,
  'text.pixelSmaller': (b, a) => getPixelText().scale < JSON.parse(b.text).scale,
};

/** Things to do first so the command has something to change (the state already gave the tile a solid shape). */
const FIRST: Record<string, string> = { 'tiles.solid': 'tiles.clearShapes', 'rig.autoAttach': 'rig.detachLayer', 'rig.bendLayer': 'rig.detachLayer' };

/** Paints the brush tile solid all over, so there is a picture to guess edges from (an empty tile has none). */
function paintBrushTile(): void {
  store().update('Paint tile', (d) => {
    const tile = d.tileset?.tiles.find((t) => t.key === getTileUi().brush);
    const dr = tile && d.drawings[tile.frames[0].drawingId];
    if (dr && dr.kind === 'pixel') dr.pixels = new Uint8ClampedArray(dr.pixels.length).fill(255);
  });
}

/** Which state each command is run in. Any command on in a state and listed here is run there. */
const WHERE: Record<string, string[]> = {
  'tile-picked': ['tiles.edit', 'tiles.duplicate', 'tiles.delete', 'tiles.flipX', 'tiles.flipY', 'tiles.rotate', 'tiles.nextTile', 'tiles.prevTile', 'tiles.solid', 'tiles.drawBox', 'tiles.drawShape', 'tiles.clearShapes', 'tiles.oneWay', 'tiles.showShapes', 'tiles.addValue', 'tiles.addTerrain', 'tiles.makeEdgeTiles', 'tiles.guessEdges', 'tiles.autoEdges', 'tiles.export'],
  'tile-open': ['tiles.done'],
  'rig-bent-layer': ['rig.autoAttach', 'rig.bendLayer', 'rig.paintWeights', 'rig.smoothWeights', 'rig.normaliseWeights', 'rig.detachLayer', 'rig.savePose', 'rig.mirrorPose', 'rig.swapSides', 'rig.resetPose', 'rig.togglePin', 'rig.deleteBone', 'rig.deleteBranch', 'rig.addChildBone', 'rig.renameBone', 'rig.pickParent', 'rig.pickChild'],
  'clip-picked': ['flow.fromAny'],
  'particles-selected': ['particles.shuffle'],
  'pixel-text-big': ['text.pixelSmaller'],
};

const results: string[] = [];
beforeAll(async () => {
  await loadApp();
});
afterAll(() => {
  quietWorld();
  SITUATIONS[0].set();
  if (process.env.FINDABILITY_REPORT) process.stdout.write(`\nCommands run\n${results.join('\n')}\n`);
});

describe('commands run in the state that switches them on', () => {
  for (const [stateId, ids] of Object.entries(WHERE)) {
    const state = FEATURE_STATES.find((s) => s.id === stateId);
    for (const id of ids) {
      it(`${id} in ${stateId}: is on, runs, and does something`, async () => {
        expect(state, `state ${stateId} exists`).toBeDefined();
        await inState(state!, async () => {
          const cmd = allCommands().find((c: Command) => c.id === id);
          expect(cmd, `command ${id} exists`).toBeDefined();
          syncDynamicCommands();
          expect(commandEnabled(cmd!), `${id} is on in ${stateId}`).toBe(true);
          if (FIRST[id]) await allCommands().find((c: Command) => c.id === FIRST[id])!.run();
          if (id === 'tiles.guessEdges') paintBrushTile();
          clearToasts();
          const before = snap();
          await cmd!.run();
          await new Promise((r) => setTimeout(r, 80));
          const after = snap();
          const check = EFFECT[id];
          if (check) expect(check(before, after), `${id} did not do what it says`).toBe(true);
          else {
            const changed = (Object.keys(before) as (keyof Snap)[]).some((k) => before[k] !== after[k]);
            expect(changed, `${id} ran and nothing changed: not the document, not the picked tile/bone/clip, no message, no dialog`).toBe(true);
          }
          const what = (Object.keys(before) as (keyof Snap)[]).filter((k) => k !== 'doc' && k !== 'rootDoc' && before[k] !== after[k]);
          results.push(`ok ${id}${EFFECT[id] ? '' : ` (changed: ${what.join(', ')}${toasts.get().length ? `; said: ${toasts.get().map((t) => t.message).join(' / ')}` : ''})`}`);
        });
      });
    }
  }

  it('every command that was on the old never-seen list is run here', () => {
    const covered = new Set(Object.values(WHERE).flat());
    for (const id of ['tiles.edit', 'tiles.done', 'rig.autoAttach', 'rig.pickChild', 'flow.fromAny', 'particles.shuffle', 'text.pixelSmaller']) expect(covered.has(id)).toBe(true);
    expect(covered.size).toBe(41);
  });
});
