// @vitest-environment jsdom
// The import boundary: core must not reach into feature folders, and a feature that has moved onto a descriptor is
// only imported by the places that are meant to. Today's back-imports are listed on purpose; the list may only
// shrink (a stale entry fails too). Only core/render.ts -> effects is left: the effects stay core by nature.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allFeatures, registerFeatures } from '../../src/features/host';
import type { FeatureDescriptor } from '../../src/features/feature';
import { audioFeature } from '../../src/audio';
import { cameraFeature } from '../../src/camera';
import { godotFeature } from '../../src/export/godot';
import { flowFeature } from '../../src/flow';
import { interactivesFeature } from '../../src/interactives';
import { lipsyncFeature } from '../../src/lipsync';
import { particlesFeature } from '../../src/particles';
import { rigFeature } from '../../src/rig';
import { textFeature } from '../../src/text';
import { tilesFeature } from '../../src/tiles';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/** Folders of features that are, or will be, optional. `effects` is core by nature but is watched like them. */
const FEATURE_FOLDERS = ['audio', 'particles', 'text', 'tiles', 'rig', 'flow', 'interactives', 'lipsync', 'effects'];

/** Core files that still import a feature folder (to burn down: core should call a registry instead). */
const CORE_BACK_IMPORTS = ['core/render.ts -> effects'];

/** Who may import a folder whose feature has moved onto a descriptor. */
const CONVERTED: Record<string, { importers: string[] }> = {
  // The video exporters read sound data by name to mix and mux it (it stays in the file whether or not the feature is on).
  audio: { importers: ['renderer/features.ts', 'lipsync/commands.tsx', 'lipsync/run.ts', 'export/formats/video-prep.ts', 'export/formats/video.ts'] },
  // The camera's helpers (is it looked through, where is it) are used by the canvas, the tools and artboards: it keeps working on a drawing that holds a camera.
  camera: { importers: ['renderer/features.ts', 'artboards/Underlay.tsx', 'artboards/ops.ts', 'artboards/variationOps.ts', 'canvas/engine.ts', 'quests/library.ts', 'text/TextEditor.tsx', 'tools/eyedropper.ts', 'tools/view-size.ts'] },
  // Sprite sheet engine, add-on and help: no folder of its own, and nothing imports it but the feature list.
  'godot-export': { importers: [] },
  flow: { importers: ['renderer/features.ts'] },
  interactives: { importers: ['renderer/features.ts'] },
  lipsync: { importers: ['renderer/features.ts', 'templates/lip-sync.ts'] },
  // Templates that use its shapes, the lessons, and (for text) the canvas, which opens the editor on a double click, and plugins, whose text items become text shapes.
  particles: { importers: ['quests/library.ts', 'renderer/features.ts', 'templates/explosion.ts'] },
  // Pure bone maths and posing, which the canvas, the timeline, the exporters, the templates and the Godot/Lottie/PDF writers use on any puppet (it keeps working with the feature off); plus the lesson and the debug hook.
  rig: { importers: ['canvas/engine.ts', 'canvas/pipeline.ts', 'export/bonesExtrasDoc.ts', 'export/godot-bones-scope.ts', 'export/godot-bones.ts', 'export/kitchenSink.ts', 'quests/library.ts', 'renderer/debug.ts', 'renderer/features.ts', 'templates/puppet.ts', 'timeline/propKeys.ts', 'timeline/tracks.ts'] },
  // Tile mode and tile editing are read by the canvas, the pixel tools, artboards and symbols (a level keeps drawing and editing with the feature off); the templates that build levels; the lesson and the debug hook.
  tiles: { importers: ['artboards/Underlay.tsx', 'artboards/ops.ts', 'artboards/player.tsx', 'artboards/variationOps.ts', 'canvas/CanvasView.tsx', 'canvas/controller.ts', 'canvas/engine.ts', 'export/ExportDialog.tsx', 'export/kitchenSink.ts', 'pixel/PixelBar.tsx', 'quests/library.ts', 'renderer/debug.ts', 'renderer/features.ts', 'symbols/ops.ts', 'templates/blank.ts', 'templates/tileset.ts', 'timeline/Layers.tsx', 'tools/fill.ts', 'tools/pixelSession.ts'] },
  text: { importers: ['canvas/CanvasView.tsx', 'plugins/drawlist.ts', 'plugins/fonts.ts', 'quests/library.ts', 'renderer/features.ts', 'templates/spinner.ts', 'templates/title-card.ts'] },
};
const DESCRIPTORS: Record<string, FeatureDescriptor> = { audio: audioFeature, camera: cameraFeature, 'godot-export': godotFeature, flow: flowFeature, interactives: interactivesFeature, lipsync: lipsyncFeature, particles: particlesFeature, rig: rigFeature, text: textFeature, tiles: tilesFeature };

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+)['"]/g;

/** The folder under src/ each relative import of `source` (a file at `rel`) points into, with its count. */
export function importedFolders(rel: string, source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT)) {
    const target = path.normalize(path.join(path.dirname(rel), m[1]));
    out.push(target.split(path.sep)[0].replace(/\.(ts|tsx)$/, ''));
  }
  return out;
}

const imports: { file: string; folder: string }[] = [];
for (const f of walk(SRC)) {
  const rel = path.relative(SRC, f).split(path.sep).join('/');
  for (const folder of importedFolders(rel, readFileSync(f, 'utf8'))) imports.push({ file: rel, folder });
}
const pairs = (pick: (i: { file: string; folder: string }) => boolean) => [...new Set(imports.filter(pick).map((i) => `${i.file} -> ${i.folder}`))].sort();

describe('the scanner', () => {
  it('reads static, dynamic and re-exported imports, and walks up out of a folder', () => {
    expect(importedFolders('core/a.ts', `import x from '../text/y';\nexport * from '../rig';\nconst z = import('../tiles/q');\nimport './b';`)).toEqual(['text', 'rig', 'tiles', 'core']);
    expect(importedFolders('timeline/deep/a.ts', `import x from '../../lipsync/apply'`)).toEqual(['lipsync']);
  });
});

describe('core does not import feature folders', () => {
  const found = pairs((i) => i.file.startsWith('core/') && FEATURE_FOLDERS.includes(i.folder));

  it('only the listed back-imports exist', () => {
    expect(found.filter((p) => !CORE_BACK_IMPORTS.includes(p))).toEqual([]);
  });
  it('and every listed one is still there (remove entries as they are fixed)', () => {
    expect(CORE_BACK_IMPORTS.filter((p) => !found.includes(p))).toEqual([]);
  });
});

describe('a feature that has a descriptor', () => {
  const converted = Object.keys(CONVERTED);

  it('the list here matches what the app has converted', () => {
    registerFeatures(Object.values(DESCRIPTORS));
    const real = allFeatures().filter((d) => d.optional && !d.legacy).map((d) => d.id);
    expect(real.sort()).toEqual([...converted].sort());
  });

  for (const id of converted) {
    it(`${id}: only the allowed files import it`, () => {
      const who = pairs((i) => i.folder === id && !i.file.startsWith(`${id}/`)).map((p) => p.split(' -> ')[0]);
      expect(who.filter((f) => !CONVERTED[id].importers.includes(f))).toEqual([]);
      expect(CONVERTED[id].importers.filter((f) => !who.includes(f))).toEqual([]);
    });

    it(`${id}: imports no other feature folder except what it requires`, () => {
      const desc = DESCRIPTORS[id];
      const allowed = new Set([id, ...(desc?.requires ?? [])]);
      const bad = pairs((i) => i.file.startsWith(`${id}/`) && FEATURE_FOLDERS.includes(i.folder) && !allowed.has(i.folder));
      expect(bad).toEqual([]);
    });
  }
});
