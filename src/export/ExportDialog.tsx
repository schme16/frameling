import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useStore } from '../core/store';
import { desktop } from '../io/desktop';
import { Modal, mountModal } from '../io/mount';
import { Icon } from '../ui/icons';
import { detectCapabilities, type Capabilities } from './capabilities';
import { describeError, exportDocument, loadLastSettings, loadSheetExtras, saveSheetExtras } from './exporter';
import { setChoice, useChoice, getChoiceDef } from '../core/choices';
import './choices';
import { defaultSettings, hasPixelLayers, planExport, scaleChoices } from './plan';
import { godotTexturePath } from './sheet';
import type { Progress } from './run';
import { GIF_MAX_FPS } from './gif';
import { DEFAULT_SHEET, FORMATS, formatInfo, type ExportSettings, type FormatId } from './types';
import './export.css';

/** Last time's settings, repaired so they still make sense for this document. */
function startingSettings(): ExportSettings {
  const { doc } = store().get();
  const base = defaultSettings(doc);
  const extras = loadSheetExtras();
  if (extras) base.sheet = { ...base.sheet, ...extras };
  const last = loadLastSettings();
  if (!last || !FORMATS.some((f) => f.id === last.format)) return base;
  const s: ExportSettings = { ...base, ...last, sheet: { ...DEFAULT_SHEET, ...last.sheet, ...extras } };
  if (s.range === 'clip' && !doc.clips.some((c) => c.id === s.clipId)) {
    s.range = 'all';
    s.clipId = null;
  }
  if (!scaleChoices(doc).includes(s.scale)) s.scale = base.scale;
  return s;
}

function Check({ checked, onChange, disabled, children, hint }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className={`ex-check${disabled ? ' ex-off' : ''}`} title={disabled ? hint : undefined}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
      {disabled && hint && <small className="ex-why">{hint}</small>}
    </label>
  );
}

function ExportDialog({ close, initial, autoStart }: { close: () => void; initial: ExportSettings; autoStart: boolean }) {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const [s, setS] = useState<ExportSettings>(initial);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const abort = useRef<AbortController | null>(null);
  const running = progress !== null;
  const pixel = hasPixelLayers(doc);
  const set = (p: Partial<ExportSettings>) => setS((x) => ({ ...x, ...p }));
  const setSheet = (p: Partial<ExportSettings['sheet']>) =>
    setS((x) => {
      const sheet = { ...x.sheet, ...p };
      // JSON and Godot ticks are remembered the moment they change, even if this export is cancelled.
      if ('json' in p || 'godot' in p || 'godotScene' in p) saveSheetExtras(sheet);
      return { ...x, sheet };
    });
  const webmPref = useChoice<string>('export.webmCodec');

  const info = formatInfo(s.format);
  const plan = useMemo(() => planExport(doc, s, frame), [doc, s, frame]);
  const video = s.format === 'mp4' || s.format === 'webm';
  const videoSize = useMemo(() => planExport(doc, { ...s, format: 'mp4' }, frame), [doc, s, frame]);

  // Ask what this computer can encode, at the size that matters.
  useEffect(() => {
    let live = true;
    void detectCapabilities(videoSize.width, videoSize.height).then((c) => live && setCaps(c));
    return () => void (live = false);
  }, [videoSize.width, videoSize.height, webmPref]);

  const support = (f: FormatId) => (f === 'mp4' || f === 'webm') && caps ? caps[f] : null;
  const unavailable = (f: FormatId): string | null => {
    const sp = support(f);
    return sp && !sp.ok ? sp.reason : null;
  };

  // If the chosen video format turns out to be unavailable, move to one that works.
  useEffect(() => {
    if (!caps || !unavailable(s.format)) return;
    const next = FORMATS.find((f) => !unavailable(f.id) && f.animated && f.id !== 'sheet');
    if (next) set({ format: next.id });
  }, [caps]);

  const alphaOk = s.format === 'webm' ? !!caps?.webm.alpha : info.alpha;
  const alphaWhy = s.format === 'mp4' ? "MP4 videos can't be see-through. Try WebM, GIF or PNG." : s.format === 'webm' ? "This computer can't make see-through WebM. Try GIF, APNG or PNG sequence." : '';

  const start = async () => {
    setError(null);
    const ac = new AbortController();
    abort.current = ac;
    setProgress({ done: 0, total: plan.count, label: 'Getting ready' });
    try {
      const outcome = await exportDocument(s, ac.signal, setProgress);
      if (outcome === 'done' || autoStart) return close();
    } catch (e) {
      setError(describeError(e));
    }
    setProgress(null);
  };

  // "Export again" starts as soon as the dialog opens.
  useEffect(() => {
    if (autoStart) void start();
  }, []);

  const scales = scaleChoices(doc);
  const frames = plan.count;
  const summary = `${frames} frame${frames === 1 ? '' : 's'}, ${plan.width} × ${plan.height} px`;
  const noClips = doc.clips.length === 0;

  if (running) {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <Modal title={`Exporting ${info.title}`} onClose={() => abort.current?.abort()} canClose={false} className="ex-running">
        <div className="ex-body ex-progress">
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
          {FORMATS.map((f) => {
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
                onClick={() => set({ format: f.id, ...((f.id === 'mp4' || f.id === 'webm') && s.range === 'frame' ? { range: 'all' as const } : {}) })}
              >
                <Icon name={f.icon} size={22} />
                <span className="ex-card-title">
                  {f.title} <small>{f.tag}</small>
                </span>
                <span className="ex-card-good">{why ?? f.goodFor}</span>
              </button>
            );
          })}
        </div>

        <div className="ex-options">
          {info.animated ? (
            <fieldset>
              <legend>What to export</legend>
              <div className="ex-seg">
                <button type="button" className={s.range === 'all' ? 'ex-on' : ''} aria-pressed={s.range === 'all'} onClick={() => set({ range: 'all' })}>
                  Whole animation
                </button>
                <button type="button" className={s.range === 'clip' ? 'ex-on' : ''} aria-pressed={s.range === 'clip'} disabled={noClips} title={noClips ? 'No clips yet. Make one in the timeline.' : undefined} onClick={() => set({ range: 'clip', clipId: s.clipId ?? doc.clips[0]?.id ?? null })}>
                  A clip
                </button>
                <button type="button" className={s.range === 'frame' ? 'ex-on' : ''} aria-pressed={s.range === 'frame'} disabled={video} title={video ? 'A video needs more than one frame.' : undefined} onClick={() => set({ range: 'frame' })}>
                  This frame
                </button>
              </div>
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
            <p className="ex-note">Exports frame {plan.range.start + 1}, the one you are looking at.</p>
          )}

          <fieldset>
            <legend>Size</legend>
            <div className="ex-seg">
              {scales.map((n) => (
                <button key={n} type="button" className={s.scale === n ? 'ex-on' : ''} aria-pressed={s.scale === n} onClick={() => set({ scale: n })}>
                  {n < 1 ? `${n}×` : `${n}×`}
                </button>
              ))}
            </div>
            <p className="ex-note">{pixel ? 'Whole numbers keep every pixel sharp and square.' : 'Bigger is sharper but makes a bigger file.'}</p>
          </fieldset>

          <fieldset>
            <legend>Background</legend>
            <Check checked={s.transparent} onChange={(v) => set({ transparent: v })} disabled={!alphaOk} hint={alphaWhy}>
              Transparent background
            </Check>
          </fieldset>

          {s.format === 'webm' && (
            <fieldset>
              <legend>Video codec</legend>
              <div className="ex-seg">
                {(getChoiceDef('export.webmCodec')?.options ?? []).map((o) => (
                  <button key={o.value} type="button" className={webmPref === o.value ? 'ex-on' : ''} aria-pressed={webmPref === o.value} title={o.detail} onClick={() => setChoice('export.webmCodec', o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="ex-note">{caps?.webm.ok ? `Making this one with ${caps.webm.codec === 'av1' ? 'AV1' : caps.webm.codec === 'vp9' ? 'VP9' : 'VP8'}${s.transparent && caps.webm.alphaCodec && caps.webm.alphaCodec !== caps.webm.codec ? ` (${caps.webm.alphaCodec.toUpperCase()} for the see-through background)` : ''}.` : 'Also in Preferences > Behaviour.'}</p>
            </fieldset>
          )}

          {(s.format === 'gif' || s.format === 'apng') && (
            <fieldset>
              <legend>Playback</legend>
              <Check checked={s.loop} onChange={(v) => set({ loop: v })}>
                Loop forever
              </Check>
              {s.format === 'gif' && (
                <Check checked={s.dither} onChange={(v) => set({ dither: v })}>
                  Smooth colours (dither), for gradients and soft shading
                </Check>
              )}
              {s.format === 'gif' && doc.fps > GIF_MAX_FPS && <p className="ex-note">GIFs can&apos;t go faster than {GIF_MAX_FPS} frames per second, so this one will play a little slower.</p>}
              {s.format === 'gif' && <p className="ex-note">GIFs use up to 256 colours, chosen from your whole animation.</p>}
            </fieldset>
          )}

          {s.format === 'sheet' && (
            <fieldset>
              <legend>Sheet</legend>
              <div className="ex-grid2">
                <label>
                  Columns
                  <input type="number" min={0} max={64} value={s.sheet.columns} onChange={(e) => setSheet({ columns: Math.max(0, Math.min(64, Math.round(+e.target.value || 0))) })} />
                  <small>{s.sheet.columns === 0 ? 'Auto' : ' '}</small>
                </label>
                <label>
                  Padding
                  <input type="number" min={0} max={32} value={s.sheet.padding} onChange={(e) => setSheet({ padding: Math.max(0, Math.min(32, Math.round(+e.target.value || 0))) })} />
                  <small>pixels between frames</small>
                </label>
              </div>
              <Check checked={s.sheet.trim} onChange={(v) => setSheet({ trim: v })}>
                Trim empty space around each frame
              </Check>
              <Check checked={s.sheet.pot} onChange={(v) => setSheet({ pot: v })}>
                Make the sheet a power-of-two size (64, 128, 256...)
              </Check>
              <Check checked={s.sheet.dedupe} onChange={(v) => setSheet({ dedupe: v })}>
                Store repeated frames once
              </Check>
              <p className="ex-sub">Also save</p>
              <Check checked={s.sheet.json} onChange={(v) => setSheet({ json: v })}>
                JSON file with where every frame is
              </Check>
              <Check checked={s.sheet.godot} onChange={(v) => setSheet({ godot: v })}>
                Godot sprite frames (.tres)
              </Check>
              <Check checked={s.sheet.godotScene} onChange={(v) => setSheet({ godotScene: v })}>
                Godot scene with an animated sprite (.tscn)
              </Check>
              {(s.sheet.godot || s.sheet.godotScene) && (
                <label className="ex-path">
                  Where the picture will live in your Godot project
                  <input type="text" spellCheck={false} placeholder={godotTexturePath('', doc.name)} value={s.sheet.godotPath} onChange={(e) => setSheet({ godotPath: e.target.value })} />
                </label>
              )}
            </fieldset>
          )}
        </div>
      </div>

      {error && (
        <p className="ex-error" role="alert">
          <Icon name="warning" size={16} /> {error}
        </p>
      )}
      <div className="io-foot ex-foot">
        <span className={`ex-summary${plan.problem ? ' ex-problem' : ''}`} aria-live="polite">
          {plan.problem ?? summary}
        </span>
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary ex-go" disabled={!!plan.problem || !desktop()} title={!desktop() ? 'Exporting works in the Frameling desktop app.' : undefined} onClick={() => void start()}>
          <Icon name="export" size={16} /> Export
        </button>
      </div>
    </Modal>
  );
}

export function openExportDialog(): void {
  mountModal((close) => <ExportDialog close={close} initial={startingSettings()} autoStart={false} />);
}

/** Runs the last export again with the same settings, showing progress. Opens the dialog instead when there is no last one. */
export function exportAgain(): void {
  const last = loadLastSettings();
  if (!last) return openExportDialog();
  mountModal((close) => <ExportDialog close={close} initial={startingSettings()} autoStart />);
}
