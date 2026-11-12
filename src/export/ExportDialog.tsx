import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc } from '../core/format';
import { sceneOf } from '../core/symbols';
import { store, useStore } from '../core/store';
import { desktop } from '../io/desktop';
import { Modal, mountModal } from '../io/mount';
import { Icon } from '../ui/icons';
import { Quill, QuillSays } from '../ui/mascot';
import { detectCapabilities, type Capabilities } from './capabilities';
import { describeError, exportDocument, loadLastSettings, loadSheetExtras, saveSheetExtras } from './exporter';
import { setChoice, useChoice, getChoiceDef, withChoice } from '../core/choices';
import './choices';
import { artScale, clipLoopWords, defaultSettings, drawnFrames, hasPixelLayers, planExport, scaleAllowed, scaleChoices, type Plan } from './plan';
import { setDocLength } from '../timeline/ops';
import { EnginePicker } from './EnginePicker';
import { openHelp } from '../ui/overlays';
import { godotTexturePath } from './sheet';
import { hasBonesToExport } from './godot-bones-scope';
import { BonesLookNotes } from './BonesLookNotes';
import type { Progress } from './run';
import { GIF_MAX_FPS } from './gif';
import { proresSupport, type ProresSupport } from './prores';
import { LayeredNotes } from './LayeredNotes';
import { CarryNotes } from './CarryNotes';
import { bakesEffects, docFeatures, hasSoftOrShadow } from './carries';
import { aiFramesOf, DEFAULT_SHEET, engineInfo, FORMATS, formatInfo, normalizeSheet, splitFormats, type AiFrames, type EngineId, type ExportSettings, type FormatId, type FormatInfo } from './types';
import './export.css';
import { leaveTileEdit } from '../tiles/tileEdit';
import { inOutRange } from '../timeline/inout';
import { docDpi, formatSize } from '../core/units';
import { usePrefs } from '../ui/prefs';
import { isFeatureOn } from '../features/host';
import { useFeaturesVersion } from '../features/use';
import { templateExport } from '../templates/setup';
import { ArtboardExportPicker } from '../artboards/ExportPicker';
import { artboardExport, artboardSummary, planArtboards } from '../artboards/export';
import { customPicture } from '../artboards/fit';
import { pixelExportStart } from '../pixel/workspace';

/** The ways an Illustrator file can hold an animation's frames. */
const AI_FRAMES: { id: AiFrames; label: string; title: string; note: string }[] = [
  { id: 'one', label: 'This frame', title: 'Only the frame you are looking at', note: 'Illustrator opens the frame you are looking at, with your layers and folders as real Illustrator layers.' },
  { id: 'files', label: 'One file per frame', title: 'A zip with a .ai file for every frame', note: 'A zip with a .ai file for every frame, each with real layers.' },
  { id: 'artboards', label: 'One artboard per frame', title: 'Every frame side by side as an artboard in one file', note: 'Every frame sits side by side as an artboard in one Illustrator file, with the same layers all the way through.' },
  { id: 'pages', label: 'Pages', title: 'One PDF page per frame', note: 'One PDF page per frame in a single file. Illustrator asks which page to open and brings it in as groups, without the layer names.' },
];

/** Last time's settings, repaired so they still make sense for this document. */
/** The formats on offer: Export for Interactives goes while that feature is off (Preferences > Features). */
export function availableFormats(): FormatInfo[] {
  return isFeatureOn('interactives') ? FORMATS : FORMATS.filter((f) => f.id !== 'interactives');
}

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
  if (s.lottiePictures && !PICTURE_CHOICES.some((c) => c.id === s.lottiePictures)) delete s.lottiePictures;
  if (s.lottieFile && !FILE_CHOICES.some((c) => c.id === s.lottieFile)) delete s.lottieFile;
  if (s.lottieSoft && s.lottieSoft !== 'pictures') delete s.lottieSoft;
  if (s.dotLottieVersion !== 1) delete s.dotLottieVersion;
  return s;
}

/** How a Lottie file stores pictures made from effects (see PICTURE_LOOKS in lottie.ts). */
const PICTURE_CHOICES: { id: NonNullable<ExportSettings['lottiePictures']>; label: string; note: string }[] = [
  { id: 'balanced', label: 'Balanced', note: 'Sharp on high density screens and about half the size of Sharpest. Saved as WebP, which every current browser and phone plays.' },
  { id: 'sharp', label: 'Sharpest', note: 'Every pixel kept, saved as PNG. The biggest file, and it plays in the oldest players too.' },
  { id: 'small', label: 'Smallest', note: 'Half the detail, so the smallest file. Edges look a little soft on high density screens.' },
];

/** The two kinds of Lottie file. */
const FILE_CHOICES: { id: NonNullable<ExportSettings['lottieFile']>; label: string; note: string }[] = [
  { id: 'json', label: 'Lottie (.json)', note: 'One plain file that every Lottie player opens.' },
  { id: 'dotlottie', label: 'dotLottie (.lottie)', note: 'One smaller file that holds the animation and its pictures. Plays in the dotLottie players (LottieFiles, web, iOS, Android), which not every older Lottie player is.' },
];

/** The two layouts of a dotLottie file. */
const LAYOUT_CHOICES: { id: 1 | 2; label: string; note: string }[] = [
  { id: 2, label: 'Current', note: 'The layout the dotLottie players and LottieFiles use today. It has no place for "loop", so the player decides whether it repeats.' },
  { id: 1, label: 'Older', note: 'The first layout, for older dotLottie players. It also carries the loop setting.' },
];

/** Says that the clip being exported sets the loop, and lets a hand-made choice go back to following it. */
function LoopNote({ doc, s, plan, onFollow }: { doc: Doc; s: ExportSettings; plan: Plan; onFollow: () => void }) {
  const clip = clipLoopWords(doc, s);
  if (!clip) return null;
  if (plan.loopFromClip) return <p className="ex-note">Set by the clip &ldquo;{clip.name}&rdquo;, which {clip.plays}. Tick or untick to choose another way.</p>;
  return (
    <p className="ex-note">
      The clip &ldquo;{clip.name}&rdquo; {clip.plays}.{' '}
      <button type="button" className="ex-link" onClick={onFollow}>
        Follow the clip
      </button>
    </p>
  );
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
  const open = useStore((s) => s.doc);
  const openFrame = useStore((s) => s.ui.frame);
  const { doc, frame } = sceneOf(open, openFrame);
  const [s, setS] = useState<ExportSettings>(initial);
  const units = usePrefs((p) => p.units);
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
  const video = s.format === 'mp4' || s.format === 'webm' || s.format === 'prores';
  const videoSize = useMemo(() => planExport(doc, { ...s, format: 'mp4' }, frame), [doc, s, frame]);

  // Ask what this computer can encode, at the size that matters.
  useEffect(() => {
    let live = true;
    void detectCapabilities(videoSize.width, videoSize.height).then((c) => live && setCaps(c));
    return () => void (live = false);
  }, [videoSize.width, videoSize.height, webmPref]);

  const [prores, setProres] = useState<ProresSupport | null>(null);
  useEffect(() => {
    let live = true;
    void proresSupport(true).then((p) => live && setProres(p));
    return () => void (live = false);
  }, []);
  const support = (f: FormatId) => (f === 'mp4' || f === 'webm') && caps ? caps[f] : null;
  const unavailable = (f: FormatId): string | null => {
    if (f === 'prores') return prores && !prores.ok ? (prores.reason ?? 'ProRes is not available here.') : null;
    const sp = support(f);
    return sp && !sp.ok ? sp.reason : null;
  };

  // If the chosen video format turns out to be unavailable, move to one that works.
  useEffect(() => {
    if (!caps || !unavailable(s.format)) return;
    const next = availableFormats().find((f) => !unavailable(f.id) && f.animated && f.id !== 'sheet');
    if (next) set({ format: next.id });
  }, [caps, prores]);

  const alphaOk = s.format === 'webm' ? !!caps?.webm.alpha : info.alpha;
  const alphaWhy = s.format === 'mp4' ? "MP4 videos can't be see-through. Try WebM, GIF or PNG." : s.format === 'webm' ? "This computer can't make see-through WebM. Try GIF, APNG or PNG sequence." : '';

  const start = async () => {
    setError(null);
    const ac = new AbortController();
    abort.current = ac;
    setProgress({ done: 0, total: abPlan?.frames ?? plan.count, label: 'Getting ready' });
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
  const art = artScale(doc);
  const sheet = normalizeSheet(s.sheet);
  const engine = engineInfo(sheet.engine);
  const separate = sheet.content === 'separate';
  const hasBones = hasBonesToExport(doc);
  const godotBones = sheet.engine === 'godot' && hasBones && !separate && sheet.godotRig === 'bones';
  const artPx = art ? `${Math.round(doc.width * art)} × ${Math.round(doc.height * art)}` : '';
  const pickEngine = (id: EngineId) => {
    setSheet({ engine: id, ...(id === 'godot' ? { godot: true } : {}) });
    // Pixel art for a game: offer the real size once, then remember the answer.
    if (art && engineInfo(id).game && s.scale !== art) withChoice<string>('export.gameArtSize', (v) => v === 'art' && set({ scale: art }));
  };
  const frames = plan.count;
  // With units other than pixels, also say how big it prints: the same size at any scale, just more dots per inch.
  const outDpi = Math.round(docDpi(doc) * s.scale);
  const printed = units === 'px' ? '' : `, ${formatSize(plan.width, plan.height, units, outDpi)} at ${outDpi} DPI`;
  const joinedPrinted = abPlan?.size && units !== 'px' ? `, ${formatSize(abPlan.size.width, abPlan.size.height, units, outDpi)} at ${outDpi} DPI` : '';
  const summary = abPlan ? artboardSummary(abPlan, joinedPrinted) : `${frames} frame${frames === 1 ? '' : 's'}, ${plan.width} × ${plan.height} px${printed}`;
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
                onClick={() =>
                  set({
                    format: f.id,
                    ...((f.id === 'mp4' || f.id === 'webm' || f.id === 'prores') && s.range === 'frame' ? { range: 'all' as const } : {}),
                    // Sprites for games nearly always want a see-through background.
                    ...((f.id === 'sheet' || f.id === 'interactives') && s.format !== f.id ? { transparent: true } : {}),
                    // Interactives scales pixel art up itself, crisply, so the art's own size keeps the file small.
                    ...(f.id === 'interactives' && s.format !== f.id && art ? { scale: art } : {}),
                  })
                }
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
          <ArtboardExportPicker settings={s} />
          {s.format === 'sheet' && (
            <fieldset>
              <legend>Where it's going</legend>
              <EnginePicker value={sheet.engine} onPick={pickEngine} />
              <p className="ex-note">
                {engine.files}.{' '}
                <button type="button" className="ex-link" onClick={() => openHelp(engine.help)}>
                  {engine.game ? `How to use it in ${engine.title}` : 'How to use it'}
                </button>
              </p>
              {sheet.engine === 'godot' && hasBones && !separate && (
                <div className="ex-seg" role="group" aria-label="What Godot gets">
                  <button type="button" className={sheet.godotRig !== 'bones' ? 'ex-on' : ''} aria-pressed={sheet.godotRig !== 'bones'} title="Every frame drawn onto a sprite sheet. Plays exactly as it looks here." onClick={() => setSheet({ godotRig: 'frames' })}>
                    Baked frames
                  </button>
                  <button type="button" className={sheet.godotRig === 'bones' ? 'ex-on' : ''} aria-pressed={sheet.godotRig === 'bones'} title="The skeleton, the parts and an AnimationPlayer with every clip, so you can change poses and timing in Godot (Skeleton2D)." onClick={() => setSheet({ godotRig: 'bones' })}>
                    Bones (editable in Godot)
                  </button>
                </div>
              )}
              {sheet.engine === 'godot' && hasBones && !separate && sheet.godotRig === 'bones' && (
                <p className="ex-note">
                  A scene with the skeleton, a picture for each part and every clip as an animation.{' '}
                  <button type="button" className="ex-link" onClick={() => openHelp('export-godot-bones')}>
                    How it works
                  </button>
                </p>
              )}
              {godotBones && <BonesLookNotes doc={doc} />}
              {sheet.engine === 'godot' && (
                <>
                  {!separate && !godotBones && (
                    <Check checked={s.sheet.godotScene} onChange={(v) => setSheet({ godotScene: v })}>
                      Also make a ready-to-play scene (.tscn)
                    </Check>
                  )}
                  <label className="ex-path">
                    Where the picture will live in your Godot project
                    <input type="text" spellCheck={false} placeholder={godotTexturePath('', doc.name)} value={s.sheet.godotPath} onChange={(e) => setSheet({ godotPath: e.target.value })} />
                  </label>
                </>
              )}
              {sheet.engine === 'unity' && (
                <Check checked={sheet.unityScript} onChange={(v) => setSheet({ unityScript: v })}>
                  Include the importer script (only needed once per project)
                </Check>
              )}
              {sheet.engine === 'json' && (
                <div className="ex-seg" role="group" aria-label="JSON frames">
                  <button type="button" className={sheet.jsonStyle === 'array' ? 'ex-on' : ''} aria-pressed={sheet.jsonStyle === 'array'} title="Frames in a list, in order (often called JSON array)" onClick={() => setSheet({ jsonStyle: 'array' })}>
                    Frames as a list
                  </button>
                  <button type="button" className={sheet.jsonStyle === 'hash' ? 'ex-on' : ''} aria-pressed={sheet.jsonStyle === 'hash'} title="Frames looked up by name (often called JSON hash)" onClick={() => setSheet({ jsonStyle: 'hash' })}>
                    Frames by name
                  </button>
                </div>
              )}
              {((sheet.engine === 'godot' && !godotBones) || sheet.engine === 'css') && (
                <Check checked={s.sheet.json} onChange={(v) => setSheet({ json: v })}>
                  Also save a JSON file with where every frame is
                </Check>
              )}
            </fieldset>
          )}
          {s.format === 'interactives' && (
            <fieldset>
              <legend>For Interactives</legend>
              <p className="ex-note">
                One file to drop onto an Interactives page. Your clips and markers come with it, so a click can play "run" or wait for "hit".{' '}
                <button type="button" className="ex-link" onClick={() => openHelp('export-interactives')}>
                  How to use it in Interactives
                </button>
              </p>
              <Check checked={s.includeSource !== false} onChange={(v) => set({ includeSource: v })}>
                Include the editable drawing, so it can come back to Frameling
              </Check>
            </fieldset>
          )}
          {s.format === 'ai' && doc.length > 1 && (
            <fieldset>
              <legend>Several frames in Illustrator</legend>
              <div className="ex-seg">
                {AI_FRAMES.map((o) => (
                  <button key={o.id} type="button" className={aiFramesOf(s) === o.id ? 'ex-on' : ''} aria-pressed={aiFramesOf(s) === o.id} title={o.title} onClick={() => set({ aiFrames: o.id })}>
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="ex-note">{AI_FRAMES.find((o) => o.id === aiFramesOf(s))?.note}</p>
            </fieldset>
          )}
          {info.animated && !(s.format === 'ai' && aiFramesOf(s) === 'one') ? (
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
            <p className="ex-note">Exports frame {plan.range.start + 1}, the one you are looking at.</p>
          )}

          {s.format === 'lottie' ? (
            <>
              <p className="ex-note">No size to pick: shapes stay shapes, so a Lottie player draws it sharp at whatever size it's shown.</p>
              <fieldset>
                <legend>File type</legend>
                <div className="ex-seg">
                  {FILE_CHOICES.map((c) => (
                    <button key={c.id} type="button" className={(s.lottieFile ?? 'json') === c.id ? 'ex-on' : ''} aria-pressed={(s.lottieFile ?? 'json') === c.id} onClick={() => set({ lottieFile: c.id })}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="ex-note">{FILE_CHOICES.find((c) => c.id === (s.lottieFile ?? 'json'))!.note}</p>
              </fieldset>
              {s.lottieFile === 'dotlottie' && (
                <fieldset>
                  <legend>dotLottie layout</legend>
                  <div className="ex-seg">
                    {LAYOUT_CHOICES.map((c) => (
                      <button key={c.id} type="button" className={(s.dotLottieVersion ?? 2) === c.id ? 'ex-on' : ''} aria-pressed={(s.dotLottieVersion ?? 2) === c.id} onClick={() => set({ dotLottieVersion: c.id === 2 ? undefined : c.id })}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <p className="ex-note">{LAYOUT_CHOICES.find((c) => c.id === (s.dotLottieVersion ?? 2))!.note}</p>
                </fieldset>
              )}
              {hasSoftOrShadow(docFeatures(doc)) && (
                <Check checked={s.lottieSoft === 'pictures'} onChange={(v) => set({ lottieSoft: v ? 'pictures' : undefined })}>
                  Draw Soften and Shadow as pictures, so every player shows them (a bigger file)
                </Check>
              )}
              {(bakesEffects(doc, 'lottie') || (s.lottieSoft === 'pictures' && hasSoftOrShadow(docFeatures(doc)))) && (
                <fieldset>
                  <legend>Pictures from effects</legend>
                  <div className="ex-seg">
                    {PICTURE_CHOICES.map((c) => (
                      <button key={c.id} type="button" className={(s.lottiePictures ?? 'balanced') === c.id ? 'ex-on' : ''} aria-pressed={(s.lottiePictures ?? 'balanced') === c.id} onClick={() => set({ lottiePictures: c.id })}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <p className="ex-note">{PICTURE_CHOICES.find((c) => c.id === (s.lottiePictures ?? 'balanced'))!.note}</p>
                </fieldset>
              )}
            </>
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

          <LayeredNotes format={s.format} doc={doc} />
          <CarryNotes format={s.format} doc={doc} />
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

          {s.format === 'svganim' && (
            <fieldset>
              <legend>Playback</legend>
              <Check checked={plan.loop} onChange={(v) => set({ loop: v, loopTouched: true })}>
                Loop forever
              </Check>
              <LoopNote doc={doc} s={s} plan={plan} onFollow={() => set({ loopTouched: false })} />
              <p className="ex-note">
                It plays by itself in any browser, also in an image tag.{' '}
                <button type="button" className="ex-link" onClick={() => openHelp('export-svg-animated')}>
                  How it works
                </button>
              </p>
            </fieldset>
          )}

          {(s.format === 'gif' || s.format === 'apng') && (
            <fieldset>
              <legend>Playback</legend>
              <Check checked={plan.loop} onChange={(v) => set({ loop: v, loopTouched: true })}>
                Loop forever
              </Check>
              <LoopNote doc={doc} s={s} plan={plan} onFollow={() => set({ loopTouched: false })} />
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
            <>
              <fieldset>
                <legend>What's on it</legend>
                <div className="ex-seg">
                  <button type="button" className={!separate ? 'ex-on' : ''} aria-pressed={!separate} title="Your clips become animations that play" onClick={() => setSheet({ content: 'animation' })}>
                    An animation
                  </button>
                  <button type="button" className={separate ? 'ex-on' : ''} aria-pressed={separate} title="Each frame is its own sprite: icons, tiles, items" onClick={() => setSheet({ content: 'separate' })}>
                    Separate sprites
                  </button>
                </div>
                {separate && (
                  <>
                    <div className="ex-seg">
                      <button type="button" className={!sheet.separateFiles ? 'ex-on' : ''} aria-pressed={!sheet.separateFiles} onClick={() => setSheet({ separateFiles: false })}>
                        All on one sheet
                      </button>
                      <button type="button" className={sheet.separateFiles ? 'ex-on' : ''} aria-pressed={sheet.separateFiles} onClick={() => setSheet({ separateFiles: true })}>
                        One PNG each
                      </button>
                    </div>
                    <p className="ex-note">Each frame is one sprite. Put a marker on a frame to name it, or it is named after its clip.</p>
                  </>
                )}
              </fieldset>

              {!(separate && sheet.separateFiles) && !godotBones && (
                <fieldset>
                  <legend>Sheet</legend>
                  <div className="ex-seg">
                    <button type="button" className={sheet.layout === 'grid' ? 'ex-on' : ''} aria-pressed={sheet.layout === 'grid'} title="Every frame in a slot of the same size" onClick={() => setSheet({ layout: 'grid' })}>
                      Tidy grid
                    </button>
                    <button type="button" className={sheet.layout === 'packed' ? 'ex-on' : ''} aria-pressed={sheet.layout === 'packed'} title="Frames fitted together as tightly as possible (packed atlas). Smallest picture, best with trimming." onClick={() => setSheet({ layout: 'packed' })}>
                      Packed tight
                    </button>
                  </div>
                  <div className="ex-grid3">
                    {sheet.layout === 'grid' && (
                      <label>
                        Columns
                        <input type="number" min={0} max={64} value={s.sheet.columns} onChange={(e) => setSheet({ columns: Math.max(0, Math.min(64, Math.round(+e.target.value || 0))) })} />
                        <small>{s.sheet.columns === 0 ? 'Auto' : ' '}</small>
                      </label>
                    )}
                    <label>
                      Padding
                      <input type="number" min={0} max={32} value={s.sheet.padding} onChange={(e) => setSheet({ padding: Math.max(0, Math.min(32, Math.round(+e.target.value || 0))) })} />
                      <small>space between</small>
                    </label>
                    <label title="Repeats each frame's edge pixels outward, so scaled or moving sprites never show a thin seam (extrude)">
                      Edge bleed
                      <input type="number" min={0} max={8} value={sheet.extrude} onChange={(e) => setSheet({ extrude: Math.max(0, Math.min(8, Math.round(+e.target.value || 0))) })} />
                      <small>extrude, pixels</small>
                    </label>
                  </div>
                  <Check checked={s.sheet.trim} onChange={(v) => setSheet({ trim: v })} disabled={sheet.engine === 'css' && !separate} hint="CSS animations show every frame in the same box, so frames stay whole.">
                    Trim empty space around each frame
                  </Check>
                  <Check checked={s.sheet.pot} onChange={(v) => setSheet({ pot: v })}>
                    Make the sheet a power-of-two size (64, 128, 256...)
                  </Check>
                  {!separate && (
                    <Check checked={s.sheet.dedupe} onChange={(v) => setSheet({ dedupe: v })}>
                      Store repeated frames once
                    </Check>
                  )}
                </fieldset>
              )}
              {separate && sheet.separateFiles && (
                <Check checked={s.sheet.trim} onChange={(v) => setSheet({ trim: v })}>
                  Trim empty space around each sprite
                </Check>
              )}
            </>
          )}
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

export function openExportDialog(format?: FormatId): void {
  // Exports are of the whole animation, so a tile open on the canvas goes back first.
  leaveTileEdit();
  // A template's own export choice (GIF for a spinner, separate sprites for icons) the first time it is exported.
  const start = startingSettings();
  const docId = store().get().doc.id;
  const artSize = artScale(sceneOf(store().get().doc, 0).doc);
  const fromTemplate = templateExport(docId, start, artSize);
  // No template choice: in the Pixel workspace, pixel art starts on a sprite sheet at art size.
  const initial = fromTemplate === start ? pixelExportStart(docId, start, artSize) : fromTemplate;
  if (format && format !== initial.format && availableFormats().some((f) => f.id === format)) {
    const { doc } = store().get();
    const art = artScale(doc);
    initial.format = format;
    if (format === 'interactives') {
      initial.transparent = true;
      if (art) initial.scale = art;
    }
  }
  mountModal((close) => <ExportDialog close={close} initial={initial} autoStart={false} />);
}

/** Runs the last export again with the same settings, showing progress. Opens the dialog instead when there is no last one. */
export function exportAgain(): void {
  leaveTileEdit();
  const last = loadLastSettings();
  if (!last || !availableFormats().some((f) => f.id === last.format)) return openExportDialog();
  mountModal((close) => <ExportDialog close={close} initial={startingSettings()} autoStart />);
}
