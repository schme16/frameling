// Name, export name, size and background of one artboard, for the Artboards panel and the Artboard tool's options.
import type { Id } from '../core/format';
import { useStore } from '../core/store';
import { Num } from '../symbols/PropertiesPanel';
import { exportNameOf, findArtboard, sizeOf } from './model';
import { renameArtboardById, resizeArtboard, setArtboardBackgroundById, setExportNameById } from './ops';
import './artboards.css';

/** Name, export name, size and background of one artboard. Used by the panel and the Artboard tool's options. */
export function ArtboardFields({ id }: { id: Id }) {
  const doc = useStore((s) => s.doc);
  const a = findArtboard(doc, id);
  if (!a) return null;
  const { w, h } = sizeOf(doc, a);
  const bg = a.content ? a.content.background : doc.background;
  return (
    <div className="ab-fields">
      <label className="ab-field">
        <span>Name</span>
        <input key={`n-${a.id}-${a.name}`} type="text" defaultValue={a.name} maxLength={120} onBlur={(e) => renameArtboardById(a.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </label>
      <label className="ab-field" title="The file name its exports get. Leave it empty to use the name.">
        <span>Export as</span>
        <input key={`e-${a.id}`} type="text" placeholder={exportNameOf(doc, a.id)} defaultValue={a.exportName ?? ''} maxLength={120} spellCheck={false} onBlur={(e) => setExportNameById(a.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </label>
      <div className="sy-grid">
        <Num label="W" value={w} onChange={(v) => resizeArtboard(a.id, v, h)} title="Width in pixels. The drawing stays put at the top-left." />
        <Num label="H" value={h} onChange={(v) => resizeArtboard(a.id, w, v)} title="Height in pixels. The drawing stays put at the top-left." />
      </div>
      <div className="ab-bg">
        <span>Background</span>
        <input type="color" value={bg ?? '#ffffff'} disabled={bg === null} aria-label="Background colour" onChange={(e) => setArtboardBackgroundById(a.id, e.target.value)} />
        <label className="ab-check">
          <input
            type="checkbox"
            checked={bg === null}
            onChange={(e) => setArtboardBackgroundById(a.id, e.target.checked ? null : '#ffffff')}
          />
          <span>See-through</span>
        </label>
      </div>
    </div>
  );
}

