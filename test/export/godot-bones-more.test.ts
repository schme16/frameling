import { describe, expect, it } from 'vitest';
import { uid } from '../../src/core/doc';
import { bonesExtrasDoc } from '../../src/export/bonesExtrasDoc';
import { bonesNotes } from '../../src/export/godot-bones';

describe('Godot bones notes: hidden layers inside symbols with effects', () => {
  it('says so only when the symbol has effects and a hidden or reference layer', () => {
    const doc = bonesExtrasDoc();
    const sym = Object.values(doc.symbols!)[0];
    expect(bonesNotes(doc).skipped.join('|')).not.toContain('Hidden or reference');
    const hand = sym.layers.find((l) => l.name === 'Hand')!;
    hand.effects = [{ id: uid('e'), kind: 'blur', values: { radius: 2 } }];
    // Effects alone: nothing is dropped.
    expect(bonesNotes(doc).skipped.join('|')).not.toContain('Hidden or reference');
    sym.layers.find((l) => l.name === 'Lower arm')!.visible = false;
    expect(bonesNotes(doc).skipped.join('|')).toContain('Hidden or reference layers inside symbols with effects are left out of the pictures on Hero');
    // A reference layer counts too.
    sym.layers.find((l) => l.name === 'Lower arm')!.visible = true;
    sym.layers.find((l) => l.name === 'Upper arm')!.reference = true;
    expect(bonesNotes(doc).skipped.join('|')).toContain('Hidden or reference layers inside symbols with effects');
    // Without effects it is plain behaviour and not worth a note.
    hand.effects = [];
    expect(bonesNotes(doc).skipped.join('|')).not.toContain('Hidden or reference');
  });
});
