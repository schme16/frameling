// @vitest-environment jsdom
// The export format registry: every built-in format is there in the order the cards have always had, the plan rules
// come from the registered formats, a feature's format goes when the feature is turned off, and Audio owns the
// sound question while the sound itself still goes into a video.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioFeature } from '../../src/audio';
import { getChoiceDef, setChoice } from '../../src/core/choices';
import { newDoc } from '../../src/core/doc';
import { _resetFeaturesForTests, registerFeatures, setFeatureOn } from '../../src/features/host';
import { PLANNED_FEATURES } from '../../src/features/planned';
import { interactivesFeature } from '../../src/interactives';
import { settleMp4Sound } from '../../src/export/formats/video-prep';
import { extensionFor, filtersFor } from '../../src/export/plan';
import { allExporters, exporterOf, exportUiOf, hasExporter, loadExportUis, registerExporter, splitExporters } from '../../src/export/registry';
import { allFormats, splitFormats } from '../../src/export/types';
import { defaultSettings } from '../../src/export/plan';

vi.mock('../../src/io/desktop', async (orig) => ({ ...(await orig<object>()), desktop: () => ({ media: { aacAvailable: async () => false } }) }));
vi.mock('../../src/audio/export', async (orig) => ({ ...(await orig<object>()), canMakeAac: async () => false }));

const BUILT_IN = ['mp4', 'webm', 'gif', 'apng', 'png', 'pngseq', 'svg', 'sheet', 'lottie', 'svganim', 'prores', 'psd', 'pdf', 'ai'];

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
  registerFeatures([...PLANNED_FEATURES, audioFeature, interactivesFeature]);
});
afterEach(() => _resetFeaturesForTests());

describe('the registered formats', () => {
  it('are the built-in ones in the card order, then the feature ones', () => {
    expect(allFormats().map((f) => f.id)).toEqual([...BUILT_IN, 'interactives']);
  });

  it('put the popular ones first, in their order, and the rest under More formats', () => {
    expect(splitFormats().popular.map((f) => f.id)).toEqual(['gif', 'mp4', 'pngseq', 'sheet', 'interactives']);
    expect(splitFormats().more.map((f) => f.id)).toEqual(['webm', 'apng', 'png', 'svg', 'lottie', 'svganim', 'prores', 'psd', 'pdf', 'ai']);
  });

  it('every format loads its making and its options', async () => {
    await loadExportUis();
    for (const d of allExporters()) {
      if (d.info.id !== 'prores') expect(typeof (await d.load()).run, d.info.id).toBe('function');
      if (d.ui) expect(exportUiOf(d.info.id), d.info.id).toBeTruthy();
    }
  });

  it('say how their files are named and what the save dialog offers', () => {
    const base = defaultSettings(newDoc());
    expect(extensionFor({ ...base, format: 'lottie', lottieFile: 'dotlottie' })).toBe('lottie');
    expect(extensionFor({ ...base, format: 'ai', aiFrames: 'files' })).toBe('zip');
    expect(extensionFor({ ...base, format: 'ai' })).toBe('ai');
    expect(filtersFor('pngseq')).toEqual([{ name: 'Zip file', extensions: ['zip'] }]);
    expect(filtersFor('mp4')).toEqual([{ name: 'MP4 video', extensions: ['mp4'] }]);
    expect(filtersFor('lottie', 'dotlottie')).toEqual([{ name: 'dotLottie animation', extensions: ['lottie'] }]);
    expect(filtersFor('interactives')).toEqual([{ name: 'Interactives package', extensions: ['flplay'] }]);
  });

  it('only a sprite sheet saves into a folder', () => {
    expect(allExporters().filter((d) => d.folderTitle).map((d) => d.info.id)).toEqual(['sheet']);
  });
});

describe('a format that belongs to a feature', () => {
  it('goes with the feature and comes back with it', () => {
    expect(hasExporter('interactives')).toBe(true);
    expect(setFeatureOn('interactives', false, { remember: false }).ok).toBe(true);
    expect(hasExporter('interactives')).toBe(false);
    expect(allFormats().map((f) => f.id)).toEqual(BUILT_IN);
    expect(splitExporters().popular.map((f) => f.id)).toEqual(['gif', 'mp4', 'pngseq', 'sheet']);
    expect(setFeatureOn('interactives', true, { remember: false }).ok).toBe(true);
    expect(exporterOf('interactives')?.info.ext).toBe('flplay');
    expect(allFormats().at(-1)?.id).toBe('interactives');
  });

  it('a later registration of the same id is taken away without losing the first', () => {
    const first = exporterOf('png')!;
    registerExporter({ ...first, info: { ...first.info, title: 'Other' } });
    expect(exporterOf('png')!.info.title).toBe('Other');
    registerExporter(first);
    expect(exporterOf('png')).toBe(first);
  });
});

describe('sound in a video', () => {
  const sound = { id: 'a', name: 'v', start: 0, data: new Uint8Array([1]), mime: 'audio/wav', duration: 1 };

  it('the question about it belongs to Audio', () => {
    expect(getChoiceDef('export.mp4Sound')).toBeTruthy();
    expect(setFeatureOn('audio', false, { remember: false }).ok).toBe(true);
    expect(getChoiceDef('export.mp4Sound')).toBeUndefined();
    setFeatureOn('audio', true, { remember: false });
    expect(getChoiceDef('export.mp4Sound')).toBeTruthy();
  });

  it('with Audio on, a computer that cannot make AAC asks, and the answer can turn the video into a WebM', async () => {
    const doc = Object.assign(newDoc(), { audio: [sound] });
    const s = { ...defaultSettings(doc), format: 'mp4' };
    setChoice('export.mp4Sound', 'webm');
    expect((await settleMp4Sound(doc, s)).format).toBe('webm');
    setChoice('export.mp4Sound', undefined);
  });

  it('with Audio off nothing is asked and the video stays an MP4 (the sound still goes in)', async () => {
    const doc = Object.assign(newDoc(), { audio: [sound] });
    const s = { ...defaultSettings(doc), format: 'mp4' };
    setChoice('export.mp4Sound', 'webm');
    setFeatureOn('audio', false, { remember: false });
    expect(await settleMp4Sound(doc, s)).toBe(s);
    setChoice('export.mp4Sound', undefined);
  });
});
