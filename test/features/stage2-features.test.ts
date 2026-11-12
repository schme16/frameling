// @vitest-environment jsdom
// Audio, Clip flow and Interactives as switchable features: what goes when they are off, what a file keeps, the question
// when a file uses one, and Lip sync needing Audio.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioFeature } from '../../src/audio';
import { flowFeature } from '../../src/flow';
import { startTrying, tryingClip } from '../../src/flow/ops';
import { interactivesFeature } from '../../src/interactives';
import { lipsyncFeature } from '../../src/lipsync';
import { getChoiceDef } from '../../src/core/choices';
import { newDoc } from '../../src/core/doc';
import type { AudioClip } from '../../src/core/format';
import { getCommand, getHelp, getPanel } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { _resetFeaturesForTests, isFeatureOn, offFeatureOpening, offFeaturesUsedBy, registerFeatures, setFeatureOn } from '../../src/features/host';
import { offerTurnOn, offerTurnOnForFile } from '../../src/features/prompt';
import { loadFile, saveFile } from '../../src/io/file';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';
import { paletteItems } from '../../src/ui/palette';
import { timelineParts } from '../../src/timeline/slots';
import { rigFeature } from '../../src/rig';
import { tilesFeature } from '../../src/tiles';

const all = () => registerFeatures([rigFeature, tilesFeature, audioFeature, flowFeature, interactivesFeature, lipsyncFeature]);
const clip = (): AudioClip => ({ id: 'a1', name: 'Voice', start: 0, data: new Uint8Array([1, 2, 3]), mime: 'audio/wav', duration: 1 });
const withSound = () => Object.assign(newDoc(), { audio: [clip()] });

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
  resetStore(newDoc());
  all();
});
afterEach(() => {
  vi.restoreAllMocks();
  _resetFeaturesForTests();
});

describe('Audio', () => {
  it('is switchable and adds commands, help, choices and timeline rows', () => {
    expect(audioFeature.optional && !audioFeature.legacy).toBe(true);
    expect(getCommand('audio.import')).toBeTruthy();
    expect(getHelp('sound')).toBeTruthy();
    expect(getChoiceDef('audio.scrub')).toBeTruthy();
    expect(timelineParts('side').map((p) => p.id)).toEqual(['audio-side']);
    expect(timelineParts('main').map((p) => p.id)).toEqual(['audio-main']);
    expect(timelineParts('header').map((p) => p.id)).toEqual(['audio-button']);
  });

  it('takes all of that away when off (Lip sync first, it needs Audio), and brings it back', () => {
    expect(setFeatureOn('audio', false, { remember: false })).toEqual({ ok: false, reason: 'Lip sync needs Audio. Turn off Lip sync first.' });
    expect(isFeatureOn('audio')).toBe(true);
    expect(setFeatureOn('lipsync', false, { remember: false }).ok).toBe(true);
    expect(setFeatureOn('audio', false, { remember: false }).ok).toBe(true);
    expect(getCommand('audio.import')).toBeUndefined();
    expect(getHelp('sound')).toBeUndefined();
    expect(getChoiceDef('audio.scrub')).toBeUndefined();
    for (const slot of ['side', 'main', 'header'] as const) expect(timelineParts(slot)).toEqual([]);
    expect(setFeatureOn('audio', true, { remember: false }).ok).toBe(true);
    expect(getCommand('audio.import')).toBeTruthy();
    expect(timelineParts('side')).toHaveLength(1);
  });

  it('turning Lip sync on turns Audio on first', () => {
    setFeatureOn('lipsync', false, { remember: false });
    setFeatureOn('audio', false, { remember: false });
    expect(setFeatureOn('lipsync', true, { remember: false }).ok).toBe(true);
    expect(isFeatureOn('audio')).toBe(true);
    expect(getCommand('lipsync.auto')).toBeTruthy();
  });

  it('a saved choice of Audio off keeps Lip sync off at start-up too', () => {
    _resetFeaturesForTests();
    localStorage.setItem('frameling.features.v1', JSON.stringify(['audio']));
    all();
    expect(isFeatureOn('audio')).toBe(false);
    expect(isFeatureOn('lipsync')).toBe(false);
    expect(getCommand('lipsync.auto')).toBeUndefined();
  });

  it('keeps the sounds in a file while it is off, and asks to turn it on when a file has sound', async () => {
    setFeatureOn('lipsync', false, { remember: false });
    setFeatureOn('audio', false, { remember: false });
    const opened = loadFile(saveFile(withSound(), 't')).doc;
    expect(opened.audio).toHaveLength(1);
    expect(saveFile(opened, 't').length).toBeGreaterThan(0);
    expect(loadFile(saveFile(opened, 't')).doc.audio![0].name).toBe('Voice');
    expect(offFeaturesUsedBy(opened).map((f) => f.id)).toEqual(['audio']);
    expect(offFeaturesUsedBy(newDoc())).toEqual([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await offerTurnOn(opened)).toEqual(['audio']);
    expect(getCommand('audio.import')).toBeTruthy();
  });

  it('stops sound that is playing when it is turned off', async () => {
    const { voiceCount } = await import('../../src/audio/engine');
    setFeatureOn('lipsync', false, { remember: false });
    setFeatureOn('audio', false, { remember: false });
    expect(voiceCount()).toBe(0);
  });
});

describe('Clip flow', () => {
  it('is switchable and adds its commands, panel and help', () => {
    expect(getCommand('flow.open')).toBeTruthy();
    expect(getPanel('clip-flow')).toBeTruthy();
    expect(getHelp('clip-flow')).toBeTruthy();
    setFeatureOn('flow', false, { remember: false });
    expect(getCommand('flow.open')).toBeUndefined();
    expect(getPanel('clip-flow')).toBeUndefined();
    expect(getHelp('clip-flow')).toBeUndefined();
  });

  it('is used by a drawing with a flow, which keeps it either way', () => {
    const doc = newDoc();
    doc.clips = [
      { id: 'c1', name: 'idle', start: 0, end: 3, loop: true },
      { id: 'c2', name: 'jump', start: 4, end: 7, loop: false },
    ];
    doc.flow = { start: 'c1', transitions: [{ id: 't1', from: 'c1', to: 'c2', trigger: 'jump' }] } as never;
    expect(flowFeature.usedBy!(doc)).toBe(true);
    expect(flowFeature.usedBy!(newDoc())).toBe(false);
    setFeatureOn('flow', false, { remember: false });
    expect(loadFile(saveFile(doc, 't')).doc.flow?.start).toBe('c1');
  });

  it('stops trying the flow when it is turned off', () => {
    const doc = newDoc();
    doc.clips = [{ id: 'c1', name: 'idle', start: 0, end: 3, loop: true }];
    doc.flow = { start: 'c1', transitions: [] } as never;
    resetStore(doc);
    startTrying();
    expect(tryingClip()).toBe('c1');
    setFeatureOn('flow', false, { remember: false });
    expect(tryingClip()).toBeNull();
    expect(store().get().ui.playing).toBe(false);
  });
});

describe('Interactives', () => {
  it('is switchable and adds its commands, help, choice and file hooks', () => {
    expect(getCommand('file.openPlayable')).toBeTruthy();
    expect(getHelp('edit-in-frameling')).toBeTruthy();
    expect(getChoiceDef('interactives.saveTarget')).toBeTruthy();
    expect(offFeatureOpening('x.flplay')).toBeUndefined();
    setFeatureOn('interactives', false, { remember: false });
    expect(getCommand('file.openPlayable')).toBeUndefined();
    expect(getChoiceDef('interactives.saveTarget')).toBeUndefined();
    expect(offFeatureOpening('x.flplay')?.id).toBe('interactives');
    expect(offFeatureOpening('x.frameling')).toBeUndefined();
  });

  it('marks a drawing that came out of an Interactives file, through ext', () => {
    const doc = newDoc();
    expect(interactivesFeature.usedBy!(doc)).toBe(false);
    doc.ext = { interactives: { used: true } };
    expect(interactivesFeature.usedBy!(doc)).toBe(true);
    expect(loadFile(saveFile(doc, 't')).doc.ext).toEqual({ interactives: { used: true } });
  });

  it('asks to turn it on for a .flplay, and says nothing more when they decline', async () => {
    setFeatureOn('interactives', false, { remember: false });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(await offerTurnOnForFile(interactivesFeature, 'art.flplay')).toBe(false);
    expect(confirm.mock.calls[0][0]).toContain('"art.flplay" needs Interactives, which is turned off. Turn it on?');
    expect(isFeatureOn('interactives')).toBe(false);
    confirm.mockReturnValue(true);
    expect(await offerTurnOnForFile(interactivesFeature, 'art.flplay')).toBe(true);
    expect(isFeatureOn('interactives')).toBe(true);
  });
});

describe('defaults', () => {
  it('every feature, switchable or planned, is on when nothing was ever chosen', () => {
    for (const f of [rigFeature, tilesFeature, audioFeature, flowFeature, interactivesFeature, lipsyncFeature]) expect(isFeatureOn(f.id), f.id).toBe(true);
  });
});

describe('Export for Interactives goes with the feature', () => {
  const flat = (items: MenuItem[]): string[] => items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? flat(i.items) : []));
  const inMenus = () => resolveMenus().flatMap((m) => flat(m.items)).includes('file.exportInteractives');

  it('is a command of the feature, so the menu and the palette lose it while it is off', () => {
    expect(getCommand('file.exportInteractives')).toBeTruthy();
    expect(inMenus()).toBe(true);
    expect(paletteItems().some((i) => i.kind === 'command' && i.id === 'file.exportInteractives')).toBe(true);
    setFeatureOn('interactives', false, { remember: false });
    expect(getCommand('file.exportInteractives')).toBeUndefined();
    expect(inMenus()).toBe(false);
    expect(paletteItems().some((i) => i.kind === 'command' && i.id === 'file.exportInteractives')).toBe(false);
    setFeatureOn('interactives', true, { remember: false });
    expect(getCommand('file.exportInteractives')).toBeTruthy();
    expect(inMenus()).toBe(true);
  });

  it('is left out of the formats in the Export dialog while it is off', async () => {
    const { availableFormats } = await import('../../src/export/ExportDialog');
    expect(availableFormats().some((f) => f.id === 'interactives')).toBe(true);
    setFeatureOn('interactives', false, { remember: false });
    expect(availableFormats().some((f) => f.id === 'interactives')).toBe(false);
    expect(availableFormats().length).toBeGreaterThan(5);
    setFeatureOn('interactives', true, { remember: false });
  });
});
