// @vitest-environment jsdom
// Turning the pet off leaves the mascot alone. The panel, the command and the watching all go, and Quill himself,
// his lines, his animations and the Show Quill switch carry on exactly as before.
import { beforeEach, describe, expect, it } from 'vitest';
import { allCommands, allHelp, allPanels, getPanel } from '../../src/core/registry';
import { isFeatureOn, setFeatureOn, switchableFeatures } from '../../src/features/host';
import { line, lineIds } from '../../src/ui/mascot/lines';
import { toBeats } from '../../src/ui/mascot/timing';
import { getPrefs, setPrefs } from '../../src/ui/prefs';
import { petStore, setPet, tellQuill } from '../../src/quillpet/store';
import { FRESH_PET } from '../../src/quillpet/model';
import { store } from '../../src/core/store';
import '../../src/renderer/features';

const ids = () => ({
  commands: allCommands().map((c) => c.id),
  panels: allPanels().map((p) => p.id),
  help: allHelp().map((h) => h.id),
});

beforeEach(() => {
  setFeatureOn('quill-pet', true);
  setPet(FRESH_PET);
});

describe('the pet is a feature you can switch off', () => {
  it('is in the switchable list, so it shows in Preferences > Features', () => {
    expect(switchableFeatures().map((f) => f.id)).toContain('quill-pet');
  });

  it('brings a panel, two commands and a help topic while it is on', () => {
    const on = ids();
    expect(on.panels).toContain('quill-pet');
    expect(on.commands).toEqual(expect.arrayContaining(['quillPet.open', 'quillPet.pat']));
    expect(on.help).toContain('quill-pet');
    expect(getPanel('quill-pet')?.title).toBe('Quill');
  });

  it('takes all of it away again when it is off, and puts it back when it is on', () => {
    setFeatureOn('quill-pet', false);
    const off = ids();
    expect(isFeatureOn('quill-pet')).toBe(false);
    expect(off.panels).not.toContain('quill-pet');
    expect(off.commands).not.toContain('quillPet.open');
    expect(off.commands).not.toContain('quillPet.pat');
    expect(off.help).not.toContain('quill-pet');
    setFeatureOn('quill-pet', true);
    const back = ids();
    expect(back.panels).toContain('quill-pet');
    expect(back.commands).toEqual(expect.arrayContaining(['quillPet.open', 'quillPet.pat']));
    expect(back.help).toContain('quill-pet');
  });
});

describe('with the pet off, Quill is still the mascot', () => {
  beforeEach(() => setFeatureOn('quill-pet', false));

  it('still has all his lines, the pet ones included, for the review page', () => {
    expect(lineIds()).toContain('onboarding.hello');
    expect(line('onboarding.hello')).toBeTruthy();
    expect(lineIds()).toContain('pet.petted');
  });

  it('still animates: his beats are worked out the same way', () => {
    expect(toBeats('wave', 'idle')).toEqual([{ anim: 'wave' }, { anim: 'idle' }]);
  });

  it('leaves Show Quill alone, which is the other switch', () => {
    const was = getPrefs().showQuill;
    expect(was).toBe(true);
    setPrefs({ showQuill: false });
    expect(getPrefs().showQuill).toBe(false);
    setPrefs({ showQuill: was });
  });

  it('stops watching, so drawing no longer counts towards anything', () => {
    const before = petStore.get().closeness;
    store().update('Draw stroke', (d) => {
      d.name = 'Changed';
    });
    expect(petStore.get().closeness).toBe(before);
  });
});

describe('with the pet on, he notices', () => {
  it('counts a stroke towards how close you are', () => {
    const before = petStore.get().closeness;
    tellQuill({ kind: 'petted' });
    expect(petStore.get().closeness).toBeGreaterThan(before);
  });
});

describe('getting closer is announced once', () => {
  it('says it when you reach a step, and never says it twice', async () => {
    const { clearToasts, toasts } = await import('../../src/ui/toast');
    // The feature is on (beforeEach), so its watcher is the one listening.
    setPet(FRESH_PET);
    clearToasts();
    // Enough to get from Just met to Friends (30).
    for (let i = 0; i < 4; i++) tellQuill({ kind: 'quest' });
    const said = toasts.get().filter((t) => t.message.includes('Look at us'));
    expect(said).toHaveLength(1);
    expect(said[0].message).toContain('friends');
    // Nothing more, however much fuss is made.
    for (let i = 0; i < 10; i++) tellQuill({ kind: 'petted' });
    expect(toasts.get().filter((t) => t.message.includes('Look at us'))).toHaveLength(1);
  });

  it('says nothing at all with the pet switched off', async () => {
    const { clearToasts, toasts } = await import('../../src/ui/toast');
    setFeatureOn('quill-pet', false);
    setPet(FRESH_PET);
    clearToasts();
    for (let i = 0; i < 4; i++) tellQuill({ kind: 'quest' });
    expect(toasts.get()).toEqual([]);
  });
});
