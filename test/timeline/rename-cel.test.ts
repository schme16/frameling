// Naming a drawing: one undo step, an empty name takes it off, a locked layer can still be named.
import { describe, expect, it } from 'vitest';
import { renameCel } from '../../src/timeline/ops';
import { storeWith } from './helpers';

describe('naming a drawing', () => {
  it('sets a tidy name as one undo step', () => {
    const s = storeWith([[0, 2], [2, 2]]);
    const [a, b] = s.get().doc.layers[0].cels;
    expect(renameCel(s.get().doc.layers[0].id, b.id, '  eyes   sad ').ok).toBe(true);
    expect(s.get().doc.layers[0].cels.map((c) => c.name)).toEqual([undefined, 'eyes sad']);
    s.undo();
    expect(s.get().doc.layers[0].cels.map((c) => c.name)).toEqual([undefined, undefined]);
    expect(a.id).not.toBe(b.id);
  });
  it('takes the name off with an empty one, leaving no empty field behind', () => {
    const s = storeWith([[0, 2]]);
    const l = s.get().doc.layers[0];
    renameCel(l.id, l.cels[0].id, 'arm up');
    expect(renameCel(l.id, l.cels[0].id, '  ').ok).toBe(true);
    expect('name' in s.get().doc.layers[0].cels[0]).toBe(false);
  });
  it('does nothing, and says so, when the name is the same or the drawing is gone', () => {
    const s = storeWith([[0, 2]]);
    const l = s.get().doc.layers[0];
    renameCel(l.id, l.cels[0].id, 'arm up');
    expect(renameCel(l.id, l.cels[0].id, 'arm up').ok).toBe(false);
    expect(renameCel(l.id, 'nope', 'x').ok).toBe(false);
    expect(renameCel('nope', l.cels[0].id, 'x').reason).toBe('no-layer');
  });
  it('works on a locked layer: a name is not a change to the picture', () => {
    const s = storeWith([[0, 2]]);
    s.update('Lock', (d) => void (d.layers[0].locked = true));
    const l = s.get().doc.layers[0];
    expect(renameCel(l.id, l.cels[0].id, 'arm up').ok).toBe(true);
  });
});
