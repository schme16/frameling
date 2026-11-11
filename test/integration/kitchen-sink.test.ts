import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/toast', () => ({ toast: vi.fn() }));

import type { Doc, VectorDrawing, VectorLayer } from '../../src/core/format';
import { renderFrame } from '../../src/core/render';
import { resetStore, store } from '../../src/core/store';
import { rootDoc } from '../../src/core/symbols';
import { clearTilemapCache, tilemapStats } from '../../src/core/tilemap';
import { kitchenSinkDoc } from '../../src/export/kitchenSink';
import { frameToSvg } from '../../src/export/svg';
import { loadFile, saveFile } from '../../src/io/file';
import { editSymbol, leaveSymbol, setEase } from '../../src/symbols/ops';
import { editTile, finishTileEdit } from '../../src/tiles/tileEdit';
import { installFakeCanvas, mainCtx, removeFakeCanvas } from '../perf/fakeCanvas';

// Typed arrays compare by content once turned into plain lists.
function plain(doc: Doc): unknown {
  return JSON.parse(JSON.stringify(doc, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v)));
}

const roundTrip = (doc: Doc) => loadFile(saveFile(doc, 'test')).doc;

describe('kitchen sink document', () => {
  it('uses every feature', () => {
    const d = kitchenSinkDoc();
    expect(Object.keys(d.symbols ?? {})).toHaveLength(1);
    expect(d.layers.some((l) => l.cels.some((c) => c.tween?.path))).toBe(true);
    expect(d.layers.some((l) => l.effects?.length && l.bind?.mesh)).toBe(true);
    expect(d.layers.some((l) => l.bind && !l.bind.mesh)).toBe(true);
    expect(d.layers.some((l) => l.mask)).toBe(true);
    expect(d.layers.some((l) => l.clipToBelow)).toBe(true);
    expect(d.layers.some((l) => l.kind === 'tilemap')).toBe(true);
    expect(d.symbols!.ball.layers.some((l) => l.kind === 'tilemap')).toBe(true);
    expect(d.tileset!.tiles.some((t) => t.frames.length > 1)).toBe(true);
    expect(d.audio).toHaveLength(1);
    expect(Object.keys(d.folders ?? {})).toHaveLength(1);
  });

  it('saves and opens without losing anything', () => {
    const d = kitchenSinkDoc();
    const back = roundTrip(d);
    expect(plain(back)).toEqual(plain(d));
    // And a second trip changes nothing either.
    expect(plain(roundTrip(back))).toEqual(plain(d));
  });

  it('saves the whole thing while a symbol is open, and while a tile is open inside it', () => {
    const d = kitchenSinkDoc();
    resetStore(d);
    editSymbol('ball');
    expect(plain(roundTrip(store().rootDoc()))).toEqual(plain(d));
    editTile(d.tileset!.tiles[0].key);
    expect(plain(roundTrip(store().rootDoc()))).toEqual(plain(d));
    finishTileEdit();
    leaveSymbol();
    expect(store().get().doc.editing).toBeUndefined();
  });

  describe('drawing', () => {
    beforeEach(() => {
      installFakeCanvas();
      clearTilemapCache();
    });
    afterEach(() => removeFakeCanvas());

    it('draws every frame, before and after a save, with the tiles inside the symbol too', () => {
      for (const d of [kitchenSinkDoc(), roundTrip(kitchenSinkDoc())]) {
        tilemapStats.builds = 0;
        for (let f = 0; f < d.length; f++) renderFrame(mainCtx(), d, f);
        // The stage map and the map inside the ball.
        expect(tilemapStats.builds).toBeGreaterThanOrEqual(2);
      }
    });

  });

  it('makes SVG for every frame', () => {
    const d = kitchenSinkDoc();
    for (let f = 0; f < d.length; f += 5) {
      const svg = frameToSvg(d, f);
      expect(svg).toMatch(/^<\?xml|^<svg/);
      // The ball's own tiles come out inside its group.
      expect(svg.slice(svg.indexOf('id="Bouncing-ball"'))).toMatch(/<rect[^>]*fill="#(3c78e6|78aafa)"/);
    }
  });

  it('undo and redo work across features after opening the saved file', () => {
    const d = roundTrip(kitchenSinkDoc());
    resetStore(d);
    const s = store();
    const before = plain(s.get().doc);
    const balls = d.layers.find((l) => l.name === 'Bouncing ball')!;
    s.setUi({ activeLayerId: balls.id, frame: 0 });
    setEase('bounceOut');
    s.update('Change glow', (x) => void (x.layers.find((l) => l.name === 'Sun')!.effects![0].values.size = 20));
    s.update('Turn arm', (x) => {
      const b = x.layers.find((l) => l.kind === 'vector' && l.rig) as VectorLayer;
      (x.drawings[b.cels[1].drawingId] as VectorDrawing).pose = { [b.rig!.bones[0].id]: { r: 45 } };
    });
    s.update('Quieter', (x) => void (x.audio![0].volume = 0.3));
    s.update('Folder fade', (x) => void (x.folders!.f1.opacity = 0.2));
    editSymbol('ball');
    s.update('Hide tiles inside', (x) => void (x.layers[0].visible = false));
    leaveSymbol();
    const after = plain(rootDoc(s.get().doc));
    expect(after).not.toEqual(before);
    // Saving and opening keeps the edits.
    expect(plain(roundTrip(rootDoc(s.get().doc)))).toEqual(after);
    while (s.canUndo()) s.undo();
    expect(plain(s.get().doc)).toEqual(before);
    while (s.canRedo()) s.redo();
    expect(plain(rootDoc(s.get().doc))).toEqual(after);
  });
});

describe('room for sound rows', () => {
  it('grows the timeline only when the sounds and two layers would not fit', async () => {
    const { timelineRoomFor } = await import('../../src/audio/SoundRows');
    // Header and scrollbar 82, one sound 36, two layers 72: 190 needed.
    expect(timelineRoomFor(1, 10, 80, 230)).toBe(340);
    expect(timelineRoomFor(1, 10, 190, 230)).toBeNull();
    expect(timelineRoomFor(2, 1, 150, 230)).toBe(230 + (82 + 72 + 36 - 150));
  });
});
