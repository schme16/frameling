// The Artboard tool's options: what it does, and the open artboard's settings.
import { useStore } from '../core/store';
import { ActionButton, Tip } from '../canvas/controls';
import { activeId, hasArtboards } from './model';
import { fitAllArtboards, newArtboard } from './ops';
import { ArtboardFields } from './fields';

export function ArtboardToolOptions() {
  const id = useStore((s) => activeId(s.doc));
  const many = useStore((s) => hasArtboards(s.doc));
  return (
    <div className="ab-tool-options">
      <Tip>Drag on the empty space to make an artboard. Drag one to move it, its edges to resize it. Alt+drag copies it.</Tip>
      <ArtboardFields id={id} />
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => newArtboard()}>New artboard</ActionButton>
        {many && <ActionButton onClick={() => fitAllArtboards()}>Fit all</ActionButton>}
      </div>
    </div>
  );
}
