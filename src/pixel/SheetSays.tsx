// In Export, Sprite sheet: Quill says in one sentence how the sheet is built, with a link to change how the sprite
// is built (see src/pixel/ChangeWay.tsx). The footer of the dialog tells the truth about size and frames.
import { useStore } from '../core/store';
import { artboardExport, currentArtboardExport, effectiveMode } from '../artboards/export';
import type { ExportSettings } from '../export/types';
import { QuillSays } from '../ui/mascot';
import { openChangeWay } from './ChangeWay';
import { isPixelDoc, sheetSentence, wayInfo, wayOf } from './way';
import './way.css';

export function SheetSays({ settings }: { settings: ExportSettings }) {
  const doc = useStore((s) => s.doc);
  artboardExport.use((c) => c);
  if (settings.format !== 'sheet' || !isPixelDoc(doc) || doc.editing?.length) return null;
  const mode = effectiveMode(doc, settings);
  const sentence = sheetSentence(doc, mode, currentArtboardExport(doc).ids);
  const way = wayOf(doc);
  return (
    <div data-help="pixel-ways">
    <QuillSays side="left" anim="talk" then="idle" size={48} className="px-sheet-says">
      <span aria-live="polite">{sentence}</span>
      <span className="px-sheet-says-row">
        <span className="px-way-tag">{wayInfo(way).name}</span>
        <button type="button" className="px-link" onClick={openChangeWay}>
          Change how it is built...
        </button>
      </span>
    </QuillSays>
    </div>
  );
}
