// Floats over the canvas while a tile is open, so it's always clear what you're drawing and how to get back.
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { finishTileEdit } from './tileEdit';
import './tiles.css';

export function TileEditBanner() {
  const tag = useStore(() => store().nestedTag());
  const name = useStore((s) => (tag ? s.doc.name : ''));
  if (!tag || !tag.startsWith('tile:')) return null;
  return (
    <div className="tz-banner" role="status">
      <Icon name="tiles" size={16} />
      <span>
        Drawing the tile <b>{name}</b>. It repeats around itself so you can see the seams.
      </span>
      <button type="button" className="cv-action tz-done" onClick={() => finishTileEdit()} title="Back to your drawing (Ctrl+Enter)" data-command="tiles.done">
        <Icon name="check" size={14} /> Done
      </button>
    </div>
  );
}
