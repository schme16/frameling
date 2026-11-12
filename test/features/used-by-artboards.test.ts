// A file that uses camera, sound or clip flow only inside another artboard, a symbol or a variation still prompts to turn them on.
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Artboard, AudioClip, CameraLayer, Doc } from '../../src/core/format';
import { audioFeature } from '../../src/audio';
import { cameraFeature } from '../../src/camera';
import { flowFeature } from '../../src/flow';
import { rigFeature } from '../../src/rig';

const cameraLayer = (): CameraLayer => ({ ...newVectorLayer('Cam'), kind: 'camera', cels: [] }) as unknown as CameraLayer;
const clip = (): AudioClip => ({ id: 'a1', name: 's', start: 0, data: new Uint8Array(1), mime: 'audio/wav' });
const content = (d: Doc, over: Partial<NonNullable<Artboard['content']>> = {}) => ({ width: d.width, height: d.height, background: null, length: d.length, layers: [], clips: [], markers: [], ...over });
const withBoards = (boards: Partial<Artboard>[]): Doc => {
  const d = newDoc({ width: 20, height: 20, length: 2 });
  d.artboards = [{ id: 'main', name: 'Main', x: 0, y: 0 } as Artboard, ...boards.map((b, i) => ({ id: 'b' + i, name: 'B', x: 0, y: 0, ...b }) as Artboard)];
  d.activeArtboard = 'main';
  return d;
};

describe('features used somewhere other than the open artboard', () => {
  const plain = withBoards([]);
  it('a plain document uses none of them', () => {
    for (const f of [cameraFeature, audioFeature, flowFeature]) expect(f.usedBy!(plain), f.id).toBe(false);
  });

  it('camera: a closed artboard, a variation that adds one, or a symbol', () => {
    const d = newDoc({ width: 20, height: 20 });
    expect(cameraFeature.usedBy!(withBoards([{ content: content(d, { layers: [cameraLayer()] }) }]))).toBe(true);
    expect(cameraFeature.usedBy!(withBoards([{ variationOf: 'main', overrides: { layers: { added: [cameraLayer()] } } }]))).toBe(true);
    const s = newDoc({ width: 20, height: 20 });
    s.symbols = { sy: { id: 'sy', name: 'S', width: 20, height: 20, length: 1, layers: [cameraLayer()] } as never };
    expect(cameraFeature.usedBy!(s)).toBe(true);
  });

  it('sound: a closed artboard or a variation that adds a clip', () => {
    const d = newDoc({ width: 20, height: 20 });
    expect(audioFeature.usedBy!(withBoards([{ content: content(d, { audio: [clip()] }) }]))).toBe(true);
    expect(audioFeature.usedBy!(withBoards([{ variationOf: 'main', overrides: { audio: { added: [clip()] } } }]))).toBe(true);
  });

  it('flow: a closed artboard or a variation that sets a flow', () => {
    const d = newDoc({ width: 20, height: 20 });
    expect(flowFeature.usedBy!(withBoards([{ content: content(d, { flow: { transitions: [] } }) }]))).toBe(true);
    expect(flowFeature.usedBy!(withBoards([{ variationOf: 'main', overrides: { stage: { set: { flow: { transitions: [] } } } } }]))).toBe(true);
  });

  it('rig still sees layers in artboards', () => {
    const d = newDoc({ width: 20, height: 20 });
    const l = { ...newVectorLayer('R'), bind: { bone: 'x' } } as never;
    expect(rigFeature.usedBy!(withBoards([{ content: content(d, { layers: [l] }) }]))).toBe(true);
  });
});
