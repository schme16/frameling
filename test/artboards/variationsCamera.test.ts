import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { addCamera, lookingThrough, throughCameraOf, toggleThroughCamera } from '../../src/camera/ops';
import { activeId, artboardsOf } from '../../src/artboards/model';
import { goToArtboard, installArtboards } from '../../src/artboards/ops';
import { makeVariationOf } from '../../src/artboards/variationOps';
import { setChoice } from '../../src/core/choices';

const doc = () => store().get().doc;

beforeEach(() => {
  setViewSettings({ throughCamera: false, throughBy: {} });
  setChoice('variations.frame', 'fill');
  const d = newDoc({ name: 'Hero', width: 200, height: 100, length: 4, fps: 12 });
  d.layers = [{ ...newVectorLayer('Body'), id: 'L1' }];
  resetStore(d);
});

describe('variations: looking through the camera is per artboard', () => {
  it('a sized variation looks through its camera, and the original does not', async () => {
    installArtboards();
    const orig = activeId(doc());
    const v = await makeVariationOf(orig, 'square');
    expect(v).toBeTruthy();
    expect(activeId(doc())).toBe(v);
    expect(throughCameraOf(doc())).toBe(true);
    expect(lookingThrough()).toBe(true);
    goToArtboard(orig);
    expect(throughCameraOf(doc())).toBe(false);
    expect(lookingThrough()).toBe(false);
    goToArtboard(v!);
    expect(throughCameraOf(doc())).toBe(true);
  });

  it('each artboard keeps what it was told, including when it is turned off again', async () => {
    installArtboards();
    const orig = activeId(doc());
    const v = (await makeVariationOf(orig, 'wide'))!;
    toggleThroughCamera(false);
    goToArtboard(orig);
    toggleThroughCamera(true);
    addCamera();
    expect(lookingThrough()).toBe(true);
    goToArtboard(v);
    expect(throughCameraOf(doc())).toBe(false);
    goToArtboard(orig);
    expect(throughCameraOf(doc())).toBe(true);
    expect(artboardsOf(doc())).toHaveLength(2);
  });
});
