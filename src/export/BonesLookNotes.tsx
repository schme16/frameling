// Under "Bones (editable in Godot)": what Godot does itself, what gets baked into the part pictures and what can't go,
// so nobody finds out after exporting.
import { useMemo } from 'react';
import type { Doc } from '../core/format';
import { bonesNotes } from './godot-bones-scope';

export function BonesLookNotes({ doc }: { doc: Doc }) {
  const n = useMemo(() => bonesNotes(doc), [doc]);
  if (!n.native.length && !n.baked.length && !n.skipped.length) return null;
  return (
    <div className="ex-bones-look">
      {n.native.length > 0 && (
        <p className="ex-note">
          <b>Godot does these itself:</b> {n.native.join('; ')}.
        </p>
      )}
      {n.baked.length > 0 && (
        <p className="ex-note">
          <b>Baked into the part pictures:</b> {n.baked.join('; ')}. Godot has no blur, glow or shadow of its own, and an effect that changes over time gets a picture for each step.
        </p>
      )}
      {n.skipped.length > 0 && (
        <p className="ex-note ex-warn">
          <b>Not carried over:</b> {n.skipped.join('; ')}.
        </p>
      )}
    </div>
  );
}
