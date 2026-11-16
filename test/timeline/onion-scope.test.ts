// @vitest-environment jsdom
// The first time a clip's edge hides a ghost, a toast says the onion skin stays in the clip, with Change; the answer
// reaches the canvas through ui.onion.acrossClips, and the Timeline menu can flip it.
import { beforeEach, describe, expect, it } from 'vitest';
import { getCommand } from '../../src/core/registry';
import { rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { resetStore } from '../../src/core/store';
import '../../src/timeline';
import '../../src/ui/ChoiceDialog';
import { ONION_CLIPS, installOnionScope, shouldTellOnionScope, syncOnionScope } from '../../src/timeline/onionScope';
import { clearToasts, toasts } from '../../src/ui/toast';
import { docWith } from './helpers';

const setup = () => {
  const doc = docWith(Array.from({ length: 20 }, (_, f) => [f, 1] as [number, number]), 20);
  doc.clips = [{ id: 'run', name: 'run', start: 0, end: 9, loop: true }, { id: 'jump', name: 'jump', start: 10, end: 19, loop: true }];
  const s = resetStore(doc);
  s.setUi((ui) => ({ onion: { ...ui.onion, enabled: true, before: 2, after: 2 }, frame: 5 }));
  return s;
};

beforeEach(() => {
  clearToasts();
  setChoice(ONION_CLIPS, undefined);
  setChoiceAsker(async () => null);
});

describe('onion skin and clips: the choice', () => {
  it('stays inside the clip until someone says otherwise, and the canvas reads it from ui.onion', () => {
    const s = setup();
    syncOnionScope();
    expect(s.get().ui.onion.acrossClips).toBeUndefined();
    setChoice(ONION_CLIPS, 'across');
    syncOnionScope();
    expect(s.get().ui.onion.acrossClips).toBe(true);
    setChoice(ONION_CLIPS, 'inside');
    syncOnionScope();
    expect(s.get().ui.onion.acrossClips).toBeUndefined();
  });

  it('is only told when an edge is hiding a ghost, the onion skin is on and still, and nobody has answered', () => {
    const s = setup();
    expect(shouldTellOnionScope(s.get(), false)).toBe(false); // mid-clip: nothing hidden
    s.setUi({ frame: 9 });
    expect(shouldTellOnionScope(s.get(), false)).toBe(true);
    expect(shouldTellOnionScope(s.get(), true)).toBe(false);
    s.setUi({ playing: true });
    expect(shouldTellOnionScope(s.get(), false)).toBe(false);
    s.setUi({ playing: false, onion: { ...s.get().ui.onion, enabled: false } });
    expect(shouldTellOnionScope(s.get(), false)).toBe(false);
    s.setUi({ onion: { ...s.get().ui.onion, enabled: true } });
    setChoice(ONION_CLIPS, 'inside');
    expect(shouldTellOnionScope(s.get(), false)).toBe(false);
  });

  it('says so once, with a Change button, when the playhead reaches an edge', () => {
    const s = setup();
    const off = installOnionScope();
    s.setUi({ frame: 7 });
    expect(toasts.get()).toHaveLength(0);
    s.setUi({ frame: 9 });
    expect(toasts.get().map((t) => t.message)).toEqual(['The onion skin stays inside the clip you are in, so you draw against your own animation.']);
    expect(toasts.get()[0].action?.label).toBe('Change');
    expect(rememberedChoice(ONION_CLIPS)).toBe('inside');
    s.setUi({ frame: 10 });
    s.setUi({ frame: 9 });
    expect(toasts.get()).toHaveLength(1);
    off();
  });

  it('the Timeline command flips it, and turns the onion skin on when it carries on', () => {
    const s = setup();
    const off = installOnionScope();
    s.setUi((ui) => ({ onion: { ...ui.onion, enabled: false } }));
    const cmd = getCommand('timeline.onionAcrossClips')!;
    cmd.run();
    expect(rememberedChoice(ONION_CLIPS)).toBe('across');
    expect(s.get().ui.onion.acrossClips).toBe(true);
    expect(s.get().ui.onion.enabled).toBe(true);
    expect(cmd.checked?.(s.get())).toBe(true);
    cmd.run();
    expect(rememberedChoice(ONION_CLIPS)).toBe('inside');
    expect(s.get().ui.onion.acrossClips).toBeUndefined();
    off();
  });
});
