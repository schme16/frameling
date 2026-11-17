// onChoiceChange tells each listener about a change once, even when the listener changes another choice while it runs.
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, onChoiceChange, registerChoice, setChoice } from '../../src/core/choices';
import { removeOwned, withOwner } from '../../src/core/owners';

describe('onChoiceChange', () => {
  beforeEach(() => _resetChoicesForTests());

  it('says each change once when the listener sets another choice', () => {
    const heard: string[] = [];
    const off = onChoiceChange((id, value) => {
      heard.push(`${id}=${value}`);
      // What tucking the streaming tools does: switching features off changes other remembered answers on the way.
      if (id === 'a') {
        setChoice('b', '1');
        setChoice('c', '1');
        setChoice('d', '1');
      }
    });
    setChoice('a', 'no');
    off();
    expect(heard.filter((h) => h === 'a=no')).toHaveLength(1);
    expect(heard.sort()).toEqual(['a=no', 'b=1', 'c=1', 'd=1']);
  });

  it('still hears a change made inside the listener to the same choice', () => {
    const heard: string[] = [];
    const off = onChoiceChange((id, value) => {
      heard.push(`${id}=${value}`);
      if (id === 'a' && value === 'no') setChoice('a', 'yes');
    });
    setChoice('a', 'no');
    off();
    expect(heard).toEqual(['a=no', 'a=yes']);
  });

  it('says a change once when the listener switches off features that own choices (the four toasts)', () => {
    // Three streaming features, each with a remembered choice of its own, as streamboard, audience and OBS have.
    const feats = ['f1', 'f2', 'f3'];
    for (const f of feats) withOwner(f, () => registerChoice({ id: `${f}.q`, title: f, question: f, options: [{ value: 'x', label: 'x' }], default: 'x', category: 'Streaming' }));
    let tucks = 0;
    const on = new Set(feats);
    const off = onChoiceChange((id, value) => {
      if (id !== 'streaming.offer' || value !== 'no') return;
      // tuckStreaming: switch off whatever is still on; a toast when something went.
      const went = [...on];
      for (const f of went) {
        on.delete(f);
        removeOwned(f);
      }
      if (went.length) tucks++;
    });
    setChoice('streaming.offer', 'no');
    off();
    expect(tucks).toBe(1);
  });
});
