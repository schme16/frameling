// @vitest-environment jsdom
// Lip sync as the first optional feature: switching it, the marker it leaves in a file, opening a file with it off,
// the question on open, and nothing of the drawing lost either way.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { getCommand, getHelp, getPanel } from '../../src/core/registry';
import { _resetFeaturesForTests, isFeatureOn, hiddenTemplateIds, registerFeatures, setFeatureOn } from '../../src/features/host';
import { offerTurnOn, promptText } from '../../src/features/prompt';
import { loadFile, saveFile } from '../../src/io/file';
import { applyMouths, mouthLayers } from '../../src/lipsync/apply';
import { lipsyncFeature } from '../../src/lipsync';
import { CHART } from '../../src/lipsync/chart';
import { makeLipSync } from '../../src/templates/lip-sync';
import { audioFeatureStub } from './stub';

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
  registerFeatures([audioFeatureStub, lipsyncFeature]);
});
afterEach(() => {
  vi.restoreAllMocks();
  _resetFeaturesForTests();
});

describe('Lip sync feature', () => {
  it('is optional and registers its command, panel, help and template', () => {
    expect(lipsyncFeature.optional).toBe(true);
    expect(getCommand('lipsync.auto')).toBeTruthy();
    expect(getCommand('lipsync.nameFrames')).toBeTruthy();
    expect(getPanel('lipsync')).toBeTruthy();
    expect(getHelp('lip-sync')).toBeTruthy();
  });

  it('goes away when turned off and comes back when turned on', () => {
    expect(setFeatureOn('lipsync', false, { remember: false }).ok).toBe(true);
    expect(getCommand('lipsync.auto')).toBeUndefined();
    expect(getPanel('lipsync')).toBeUndefined();
    expect(getHelp('lip-sync')).toBeUndefined();
    expect(hiddenTemplateIds().has('lip-sync')).toBe(true);
    expect(setFeatureOn('lipsync', true, { remember: false }).ok).toBe(true);
    expect(getCommand('lipsync.auto')).toBeTruthy();
    expect(getPanel('lipsync')).toBeTruthy();
    expect(hiddenTemplateIds().size).toBe(0);
  });

  it('marks a document it was used on, and only then', () => {
    const doc = makeLipSync();
    expect(lipsyncFeature.usedBy!(doc)).toBe(true);
    expect(lipsyncFeature.usedBy!(newDoc())).toBe(false);
    const fresh = makeLipSync();
    delete fresh.ext;
    expect(lipsyncFeature.usedBy!(fresh)).toBe(false);
    const layer = mouthLayers(fresh)[0];
    applyMouths(fresh, layer.id, 0, [CHART[0].id, CHART[1].id]);
    expect(lipsyncFeature.usedBy!(fresh)).toBe(true);
  });
});

describe('a drawing that uses Lip sync, with it turned off', () => {
  it('opens, keeps its mouths and its marker, and saves them back', () => {
    const doc = makeLipSync();
    const before = mouthLayers(doc).length;
    setFeatureOn('lipsync', false, { remember: false });
    const opened = loadFile(saveFile(doc, 't')).doc;
    expect(mouthLayers(opened).length).toBe(before);
    expect(opened.ext).toEqual({ lipsync: { used: true } });
    const saved = loadFile(saveFile(opened, 't')).doc;
    expect(saved.ext).toEqual({ lipsync: { used: true } });
    expect(saved.layers.map((l) => l.cels.length)).toEqual(doc.layers.map((l) => l.cels.length));
    expect(saved.symbols).toEqual(doc.symbols);
  });
});

describe('the question when opening', () => {
  const asks = (answer: boolean) => vi.spyOn(window, 'confirm').mockReturnValue(answer);

  it('words it plainly', () => {
    expect(promptText(['Particles']).message).toBe('This drawing uses Particles, which is turned off. Turn it on?');
    expect(promptText(['Lip sync', 'Text']).message).toBe('This drawing uses Lip sync and Text, which are turned off. Turn them on?');
    expect(promptText(['A', 'B', 'C']).message).toBe('This drawing uses A, B and C, which are turned off. Turn them on?');
    for (const t of [promptText(['X']), promptText(['X', 'Y'])]) expect(JSON.stringify(t)).not.toContain('—');
  });

  it('does not ask when the feature is on, or the drawing does not use it', async () => {
    const confirm = asks(true);
    expect(await offerTurnOn(makeLipSync())).toEqual([]);
    setFeatureOn('lipsync', false, { remember: false });
    expect(await offerTurnOn(newDoc())).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('turns the feature on when they say yes', async () => {
    const confirm = asks(true);
    setFeatureOn('lipsync', false, { remember: false });
    expect(await offerTurnOn(makeLipSync())).toEqual(['lipsync']);
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain('This drawing uses Lip sync, which is turned off. Turn it on?');
    expect(isFeatureOn('lipsync')).toBe(true);
    expect(getCommand('lipsync.auto')).toBeTruthy();
  });

  it('leaves it off and changes nothing when they say no', async () => {
    asks(false);
    setFeatureOn('lipsync', false, { remember: false });
    const doc = makeLipSync();
    const before = JSON.stringify(doc);
    expect(await offerTurnOn(doc)).toEqual([]);
    expect(isFeatureOn('lipsync')).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
