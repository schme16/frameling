import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc } from '../core/format';
import { sceneOf } from '../core/symbols';
import { store, useStore } from '../core/store';
import { desktop } from '../io/desktop';
import { Modal, mountModal } from '../io/mount';
import { Icon } from '../ui/icons';
import { Quill, QuillSays } from '../ui/mascot';
import { describeError, exportDocument, loadLastSettings, loadSheetExtras, saveSheetExtras } from './exporter';
import { useChoice } from '../core/choices';
import './choices';
import { artScale, defaultSettings, drawnFrames, hasPixelLayers, planExport, scaleAllowed, scaleChoices } from './plan';
import { setDocLength } from '../timeline/ops';
import type { Progress } from './run';
import { CarryNotes } from './CarryNotes';
import { allExporters, exporterOf, exportUiOf, hasExporter, loadExportUis, type ExportUiProps, type FormatSupport } from './registry';
import { Check } from './options/controls';
import { DEFAULT_SHEET, formatInfo, splitFormats, type ExportSettings, type FormatId, type FormatInfo } from './types';
import './export.css';
import { leaveTileEdit } from '../tiles/tileEdit';
import { inOutRange } from '../timeline/inout';
import { docDpi, formatSize } from '../core/units';
import { usePrefs } from '../ui/prefs';
import { useFeaturesVersion } from '../features/use';
import { templateExport } from '../templates/setup';
import { ArtboardExportPicker } from '../artboards/ExportPicker';
import { artboardExport, artboardSummary, planArtboards, singleFrameNote } from '../artboards/export';
import { customPicture } from '../artboards/fit';
import { pixelExportStart } from '../pixel/workspace';
import { followWay } from '../pixel/sheetMode';
import { SheetSays } from '../pixel/SheetSays';
import { emitPluginEvent } from '../plugins/bus';

/** The formats on offer: the built-in ones and those of the features that are on (Interactives goes while it is off, in Preferences > Features). */
export function availableFormats(): FormatInfo[] {
  return allExporters().map((d) => d.info);
}

/** Last time's settings, repaired so they still make sense for this document. */
function startingSettings(): ExportSettings {
  const { doc } = sceneOf(store().get().doc, 0);
  const base = defaultSettings(doc);
  const extras = loadSheetExtras();
  if (extras) base.sheet = { ...base.sheet, ...extras };
  const last = loadLastSettings();
  if (!last || !availableFormats().some((f) => f.id === last.format)) return base;
  const s: ExportSettings = { ...base, ...last, sheet: { ...DEFAULT_SHEET, ...last.sheet, ...extras } };
  if (s.range === 'clip' && !doc.clips.some((c) => c.id === s.clipId)) {
    s.range = 'all';
    s.clipId = null;
  }
  if (s.range === 'inOut' && !inOutRange(doc)) s.range = 'all';
  if (!scaleAllowed(doc, s.scale)) s.scale = base.scale;
  // Whether the loop was chosen by hand is not remembered: a clip sets it again next time.
  delete s.loopTouched;
  for (const d of allExporters()) d.repair?.(s);
  return s;
}

function ExportDialog({ close, initial, autoStart }: { close: () => void; initial: ExportSettings; autoStart: boolean }) {
  const open = useStore((s) => s.doc);
  const openFrame = useStore((s) => s.ui.frame);
  const { doc, frame } = sceneOf(open, openFrame);
  const [s, setS] = useState<ExportSettings>(initial);
  const units = usePrefs((p) => p.units);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const running = progress !== null;
  const pixel = hasPixelLayers(doc);
  const set = (p: Partial<ExportSettings>) => setS((x) => ({ ...x, ...p }));
  const setSheet = (p: Partial<ExportSettings['sheet']>) =>
    setS((x) => {
      const sheet = { ...x.sheet, ...p };
      // The engine, ticks and layout are remembered the moment they change, even if this export is cancelled.
      if (['json', 'godot', 'godotScene', 'engine', 'layout', 'content', 'separateFiles', 'jsonStyle', 'unityScript', 'godotRig'].some((k) => k in p)) saveSheetExtras(sheet);
      return { ...x, sheet };
    });
  const webmPref = useChoice<string>('export.webmCodec');

  // The popular formats first; the rest open under "More formats" (and stay open while one of them is chosen).
  const featuresVersion = useFeaturesVersion();
  const groups = useMemo(() => splitFormats(availableFormats()), [featuresVersion]);
  const moreChosen = groups.more.some((f) => f.id === s.format);
  const [more, setMore] = useState(false);
  const showMore = more || moreChosen;
  const info = formatInfo(s.format);
  const plan = useMemo(() => planExport(doc, s, frame), [doc, s, frame]);
  // Exporting several artboards: the footer tells about all of them (for "as one", the whole joined film).
  const abChoice = artboardExport.use((c) => c);
  // The fit and the picture size change what comes out, so the footer follows them too.
  const abLook = [useChoice<string>('artboards.fit'), useChoice<string>('artboards.pictureSize'), customPicture.use((c) => c)];
  const abPlan = useMemo(() => planArtboards(store().rootDoc(), s, frame), [open, s, frame, abChoice, ...abLook]);
  const def = exporterOf(s.format);
  const video = !!def?.video;
  const aiOne = !!def?.singleFrame?.(s);
  const videoSize = useMemo(() => planExport(doc, { ...s, format: 'mp4' }, frame), [doc, s, frame]);

  // Ask what this computer can make, at the size that matters (a video is made at an even size, which is what the plan gives).
  const [supports, setSupports] = useState<Record<string, FormatSupport>>({});
  const firstAsk = useRef(true);
  useEffect(() => {
    let live = true;
    const fresh = firstAsk.current;
    firstAsk.current = false;
    for (const d of allExporters()) {
      if (!d.support) continue;
      void d.support({ width: videoSize.width, height: videoSize.height }, fresh).then((r) => live && setSupports((x) => ({ ...x, [d.info.id]: r })));
    }
    return () => void (live = false);
  }, [videoSize.width, videoSize.height, webmPref, featuresVersion]);
  const unavailable = (f: FormatId): string | null => supports[f]?.why ?? null;

  // If the chosen format turns out to be unavailable, move to one that works.
  useEffect(() => {
    if (!unavailable(s.format)) return;
    const next = allExporters().find((d) => !unavailable(d.info.id) && d.info.animated && !d.folderTitle);
    if (next) set({ format: next.info.id });
  }, [supports]);

  const support = supports[s.format] ?? null;
  const alphaOk = def?.support ? (support ? (support.alpha ?? info.alpha) : info.alpha) : info.alpha;
  const alphaWhy = alphaOk ? '' : (def?.noAlphaWhy ?? '');
  // What the format adds to the dialog (its options are loaded before the dialog opens).
  const ui = exportUiOf(s.format);
  const uiProps: ExportUiProps = { s, set, setSheet, doc, plan, support };

  const start = async () => {
    setError(null);
    const ac = new AbortController();
    abort.current = ac;
    setProgress({ done: 0, total: abPlan?.frames ?? plan.count, label: 'Getting ready' });
    const heard = { format: s.format, name: doc.name };
    emitPluginEvent('export.started', heard);
    try {
      const outcome = await exportDocument(s, ac.signal, setProgress);
      if (outcome === 'done') ui?.exported?.({ ...uiProps, abPlan });
      emitPluginEvent('export.finished', { ...heard, ok: outcome === 'done', cancelled: outcome !== 'done' });
      if (outcome === 'done' || autoStart) return close();
    } catch (e) {
      emitPluginEvent('export.finished', { ...heard, ok: false, error: describeError(e).slice(0, 200) });
      setError(describeError(e));
    }
    setProgress(null);
  };

  // "Export again" starts as soon as the dialog opens.
  useEffect(() => {
    if (autoStart) void start();
  }, []);

  const scales = scaleChoices(doc);
  const art = artScale(doc);
  const artPx = art ? `${Math.round(doc.width * art)} × ${Math.round(doc.height * art)}` : '';
  const frames = plan.count;
  // With units other than pixels, also say how big it prints: the same size at any scale, just more dots per inch.
  const outDpi = Math.round(docDpi(doc) * s.scale);
  const printed = units === 'px' ? '' : `, ${formatSize(plan.width, plan.height, units, outDpi)} at ${outDpi} DPI`;
  const joinedPrinted = abPlan?.size && units !== 'px' ? `, ${formatSize(abPlan.size.width, abPlan.size.height, units, outDpi)} at ${outDpi} DPI` : '';
  const summary = ui?.summary?.({ ...uiProps, abPlan }) ?? (abPlan ? artboardSummary(abPlan, joinedPrinted) : `${frames} frame${frames === 1 ? '' : 's'}, ${plan.width} × ${plan.height} px${printed}`);
  const problem = abPlan ? abPlan.problem : plan.problem;
  const noClips = doc.clips.length === 0;
  const io = inOutRange(doc);
  // Only for the top level: inside a symbol the length is the symbol's.
  const drawn = open === doc ? drawnFrames(doc) : null;

  if (running) {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <Modal title={`Exporting ${info.title}`} onClose={() => abort.current?.abort()} canClose={false} className="ex-running">
        <div className="ex-body ex-progress">
          <Quill anim="think" size={96} className="ex-quill" />
          <div className="ex-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Export progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p>{progress.label}</p>
          <p className="io-muted">{summary}</p>
        </div>
        <div className="io-foot">
          <button type="button" className="io-btn" data-autofocus onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Export" onClose={close} wide>
      <div className="ex-body">
        <div className="ex-cards" role="radiogroup" aria-label="Format">
          {[...groups.popular, ...(showMore ? groups.more : [])].map((f: FormatInfo) => {
            const why = unavailable(f.id);
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={s.format === f.id}
                className={`ex-card${s.format === f.id ? ' ex-chosen' : ''}`}
                disabled={!!why}
                data-autofocus={s.format === f.id ? '' : undefined}
                onClick={() => set({ format: f.id, ...exporterOf(f.id)?.picked?.(s, { art }) })}
              >
                <Icon name={f.icon} size={22} />
                <span className="ex-card-title">
                  {f.title} <small>{f.tag}</small>
                </span>
                <span className="ex-card-good">{why ?? f.goodFor}</span>
              </button>
            );
          })}
          {!moreChosen && (
            <button type="button" className="ex-more" aria-expanded={showMore} onClick={() => setMore((m) => !m)}>
              <Icon name={showMore ? 'chevron-up' : 'chevron-down'} size={16} />
              {showMore ? 'Fewer formats' : `More formats (${groups.more.length})`}
              {!showMore && <small>WebM, PNG picture, SVG, Lottie, PSD, PDF and more</small>}
            </button>
          )}
        </div>

        <div className="ex-options">
          <SheetSays settings={s} />
          <ArtboardExportPicker settings={s} />
          {ui?.Before && <ui.Before {...uiProps} />}
          {info.animated && !aiOne ? (
            <fieldset>
              <legend>What to export</legend>
              <div className="ex-seg">
                <button type="button" className={s.range === 'all' ? 'ex-on' : ''} aria-pressed={s.range === 'all'} onClick={() => set({ range: 'all' })}>
                  Whole animation
                </button>
                <button type="button" className={s.range === 'clip' ? 'ex-on' : ''} aria-pressed={s.range === 'clip'} disabled={noClips} title={noClips ? 'No clips yet. Make one in the timeline.' : undefined} onClick={() => set({ range: 'clip', clipId: s.clipId ?? doc.clips[0]?.id ?? null })}>
                  A clip
                </button>
                {io ? (
                  <button type="button" className={s.range === 'inOut' ? 'ex-on' : ''} aria-pressed={s.range === 'inOut'} title={`The play range you set on the timeline: frames ${io.start + 1} to ${io.end + 1}`} onClick={() => set({ range: 'inOut' })}>
                    Play range
                  </button>
                ) : null}
                <button type="button" className={s.range === 'frame' ? 'ex-on' : ''} aria-pressed={s.range === 'frame'} disabled={video} title={video ? 'A video needs more than one frame.' : undefined} onClick={() => set({ range: 'frame' })}>
                  This frame
                </button>
              </div>
              {s.range === 'all' && drawn !== null && (
                <p className="ex-note">
                  Nothing is drawn after frame {drawn}, so frames {drawn + 1} to {doc.length} would come out empty.{' '}
                  <button type="button" className="ex-link" onClick={() => setDocLength(drawn)}>
                    Make the animation {drawn} frame{drawn === 1 ? '' : 's'} long
                  </button>
                </p>
              )}
              {s.range === 'inOut' && io && <p className="ex-note">Frames {io.start + 1} to {io.end + 1}: the play range you set on the timeline.</p>}
              {s.range === 'clip' && !noClips && (
                <select aria-label="Clip" value={s.clipId ?? ''} onChange={(e) => set({ clipId: e.target.value })}>
                  {doc.clips.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (frames {Math.min(c.start, c.end) + 1} to {Math.max(c.start, c.end) + 1})
                    </option>
                  ))}
                </select>
              )}
            </fieldset>
          ) : (
            <p className="ex-note">{singleFrameNote(abPlan, plan.range.start)}</p>
          )}

          {ui?.Size ? (
            <ui.Size {...uiProps} />
          ) : (
          <fieldset>
            <legend>Size</legend>
            <div className="ex-seg">
              {art && (
                <button type="button" className={s.scale === art ? 'ex-on' : ''} aria-pressed={s.scale === art} title={`One art pixel becomes one pixel (${artPx}). Best for game engines, which scale it up themselves.`} onClick={() => set({ scale: art })}>
                  Art size
                </button>
              )}
              {scales.map((n) => (
                <button key={n} type="button" className={s.scale === n ? 'ex-on' : ''} aria-pressed={s.scale === n} onClick={() => set({ scale: n })}>
                  {n < 1 ? `${n}×` : `${n}×`}
                </button>
              ))}
            </div>
            <p className="ex-note">{s.scale === art ? `Real size: one art pixel is one pixel (${artPx}).` : pixel ? 'Whole numbers keep every pixel sharp and square.' : 'Bigger is sharper but makes a bigger file.'}</p>
          </fieldset>
          )}

          <fieldset>
            <legend>Background</legend>
            <Check checked={s.transparent} onChange={(v) => set({ transparent: v })} disabled={!alphaOk} hint={alphaWhy}>
              Transparent background
            </Check>
          </fieldset>

          {ui?.Notes && <ui.Notes {...uiProps} />}
          <CarryNotes format={s.format} doc={doc} own={!!ui?.Notes} />
          {ui?.After && <ui.After {...uiProps} />}
        </div>
      </div>

      {error && (
        <QuillSays anim="oops" then="idle" size={48} className="ex-error-row" bubbleClassName="ex-error">
          <span role="alert">
            <Icon name="warning" size={16} /> {error}
          </span>
        </QuillSays>
      )}
      <div className="io-foot ex-foot">
        <span className={`ex-summary${problem ? ' ex-problem' : ''}`} aria-live="polite">
          {problem ?? summary}
        </span>
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary ex-go" disabled={!!problem || !desktop()} title={!desktop() ? 'Exporting works in the Frameling desktop app.' : undefined} onClick={() => void start()}>
          <Icon name="export" size={16} /> Export
        </button>
      </div>
    </Modal>
  );
}

export async function openExportDialog(format?: FormatId): Promise<void> {
  // The options of every format come in first, so the dialog opens complete.
  await loadExportUis();
  // Exports are of the whole animation, so a tile open on the canvas goes back first.
  leaveTileEdit();
  // A template's own export choice (GIF for a spinner, separate sprites for icons) the first time it is exported.
  const start = startingSettings();
  const docId = store().get().doc.id;
  const artSize = artScale(sceneOf(store().get().doc, 0).doc);
  const fromTemplate = templateExport(docId, start, artSize);
  // No template choice: in the Pixel workspace, pixel art starts on a sprite sheet at art size.
  const initial = fromTemplate === start ? pixelExportStart(docId, start, artSize) : fromTemplate;
  // A format whose feature is off is not on offer: start from the usual one instead.
  if (!hasExporter(initial.format)) initial.format = defaultSettings(sceneOf(store().get().doc, 0).doc).format;
  followWay(store().rootDoc());
  if (format && format !== initial.format && hasExporter(format)) {
    const { doc } = store().get();
    initial.format = format;
    Object.assign(initial, exporterOf(format)?.opened?.({ art: artScale(doc) }));
  }
  mountModal((close) => <ExportDialog close={close} initial={initial} autoStart={false} />);
}

/** Runs the last export again with the same settings, showing progress. Opens the dialog instead when there is no last one. */
export async function exportAgain(): Promise<void> {
  await loadExportUis();
  leaveTileEdit();
  const last = loadLastSettings();
  if (!last || !availableFormats().some((f) => f.id === last.format)) return openExportDialog();
  mountModal((close) => <ExportDialog close={close} initial={startingSettings()} autoStart />);
}
