// The Export dialog's "Which artboards" row. Only shows when the document has more than one artboard.
import type { Id } from '../core/format';
import { useStore } from '../core/store';
import { setChoice, useChoice } from '../core/choices';
import type { FitMode } from './fit';
import type { ExportSettings } from '../export/types';
import { artboardsOf, hasArtboards, activeArtboard, sizeOf } from './model';
import { artboardExport, currentArtboardExport, modeOff, setArtboardExport, type ArtboardExportMode } from './export';

export function ArtboardExportPicker({ settings }: { settings: ExportSettings }) {
  const doc = useStore((s) => s.doc);
  artboardExport.use((c) => c);
  const fit = useChoice<FitMode>('artboards.fit');
  if (!hasArtboards(doc) || doc.editing?.length) return null;
  const c = currentArtboardExport(doc);
  const list = artboardsOf(doc);
  const chosen = new Set(c.ids ?? list.map((a) => a.id));
  const modes: { id: ArtboardExportMode; label: string; title: string; off?: string }[] = [
    { id: 'one', label: `This artboard (${activeArtboard(doc).name})`, title: 'Just the artboard you have open' },
    { id: 'each', label: 'Each as its own file', title: 'One file per artboard, named after it' },
    { id: 'joined', label: 'All in order, as one', title: 'The artboards one after another, like shots in a film', off: modeOff('joined', settings) ?? undefined },
    { id: 'atlas', label: 'Packed onto one sheet', title: 'Every frame of every artboard on one picture, with a JSON atlas', off: modeOff('atlas', settings) ?? undefined },
  ];
  const toggle = (id: Id, on: boolean) => {
    const next = list.map((a) => a.id).filter((x) => (x === id ? on : chosen.has(x)));
    setArtboardExport({ ids: next.length === list.length ? null : next });
  };
  const mode = modes.find((m) => m.id === c.mode && !m.off) ? c.mode : 'one';
  const total = list.filter((a) => chosen.has(a.id)).reduce((t, a) => t + (a.content ? a.content.length : doc.length), 0);
  const firstPick = list.find((a) => chosen.has(a.id));
  const firstSize = firstPick ? `${sizeOf(doc, firstPick).w} x ${sizeOf(doc, firstPick).h}` : '';
  const sizes = new Set(list.filter((a) => chosen.has(a.id)).map((a) => Object.values(sizeOf(doc, a)).join('x')));
  return (
    <fieldset className="ab-export">
      <legend>Which artboards</legend>
      <div className="ex-seg ab-export-modes" role="group" aria-label="Which artboards">
        {modes.map((m) => (
          <button key={m.id} type="button" className={mode === m.id ? 'ex-on' : ''} aria-pressed={mode === m.id} disabled={!!m.off} title={m.off ?? m.title} onClick={() => setArtboardExport({ mode: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      {mode !== 'one' && (
        <div className="ab-export-list" role="group" aria-label="Artboards to export">
          {list.map((a) => (
            <label key={a.id} className="ex-check">
              <input type="checkbox" checked={chosen.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} />
              <span>{a.name}</span>
            </label>
          ))}
        </div>
      )}
      {mode === 'joined' && sizes.size > 1 && (
        <div className="ab-export-fit">
          <div className="ex-seg" role="group" aria-label="Shots of different sizes">
            <button type="button" className={fit === 'bars' ? 'ex-on' : ''} aria-pressed={fit === 'bars'} title="Show the whole shot, with bars at the sides or top and bottom" onClick={() => setChoice('artboards.fit', 'bars')}>
              Fit (bars)
            </button>
            <button type="button" className={fit === 'fill' ? 'ex-on' : ''} aria-pressed={fit === 'fill'} title="Cover the whole picture and crop what hangs over" onClick={() => setChoice('artboards.fit', 'fill')}>
              Fill (crop)
            </button>
          </div>
          <p className="ex-note">
            These artboards are different sizes, so the picture is the first one's size ({firstSize}). {fit === 'bars' ? 'Each shot is shown whole, with bars where it does not fill the picture.' : 'Each shot covers the picture and what hangs over is cropped.'} {total} frames in all.
          </p>
        </div>
      )}
      {mode === 'joined' && sizes.size <= 1 && <p className="ex-note">{total} frames in all, one artboard after another. The size and summary below are for one artboard.</p>}
      {mode === 'atlas' && <p className="ex-note">Each artboard becomes an animation in the JSON, named after it; its clips come along as "artboard/clip".</p>}
      {mode === 'each' && <p className="ex-note">{chosen.size} files, each named after its artboard (or its export name).</p>}
    </fieldset>
  );
}
