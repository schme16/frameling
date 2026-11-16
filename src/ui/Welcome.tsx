import { line } from './mascot/lines';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCommand } from '../core/registry';
import { renderFrameToCanvas } from '../core/render';
import { store } from '../core/store';
import type { Doc } from '../core/format';
import { askAboutUnsavedChanges, listRecentFiles, openPath } from '../io/document';
import { RecentPicture, useRecentPictures } from '../io/RecentPicture';
import type { RecentFile } from '../preload/api';
import { Icon, Logo } from './icons';
import { Quill, useQuillShown, useShowQuill } from './mascot';
import { Modal } from './Modal';
import { closeSheet, overlays } from './overlays';
import { runCommand } from './palette';
import { clampInt, docFromCustom, docFromPreset, isBlankDoc, PRESETS, rememberable, setPixelMode, sizeLabel, type CustomSpec } from './presets';
import { customStart, docFromFavourite, favouriteKind, favouriteSize, MAX_FAVOURITES, MAX_FAVOURITE_NAME, moveFavouriteKept, newDrawingKept, removeFavouriteKept, renameFavouriteKept, rememberCustom, saveFavourite, suggestedName } from './favourites';
import { setPrefs, usePrefs } from './prefs';
import { cleanDpi, formatSize, pxTo, roundIn, toPx, type Unit } from '../core/units';
import { getQuest, startQuest } from './quests';
import { toast } from './toast';
import { SourceCards } from '../templates/YoursSection';
import { templateSources } from '../templates/user';
import { fitThumb, tagChips } from './exampleCards';
import { paintThumbBackdrop } from '../canvas/thumbBackdrop';
import { dismissPending, recovery, restorePending, whenSaved } from '../io/recovery';
import { hiddenTemplateIds } from '../features/host';
import { openPixelChooser, PixelStarters } from '../pixel/Chooser';
import { shownRecent } from '../io/recentShown';
import { useStreamSafe } from '../core/streamSafe';

export function WelcomeSheet() {
  const mode = overlays.use((o) => o.sheet);
  if (!mode) return null;
  return <Sheet mode={mode} />;
}

function Sheet({ mode: sheetMode }: { mode: 'welcome' | 'new' | 'examples' }) {
  const mode = sheetMode === 'welcome' ? 'welcome' : 'new';
  const showWelcome = usePrefs((p) => p.showWelcome);
  const units = usePrefs((p) => p.units);
  const [custom, setCustom] = useState(() => !!overlays.get().customOpen);
  // Starts from what you used last time (the name is always Untitled), or fresh if Preferences says so.
  const [spec, setSpec] = useState<CustomSpec>(customStart);
  const favs = newDrawingKept.use((k) => k.favourites);
  const [naming, setNaming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  useStreamSafe();
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const pics = useRecentPictures(recent);
  const open = getCommand('file.open');
  const quest = getQuest('first-animation');
  const quill = useQuillShown('hello');
  const quillOn = useShowQuill();
  const found = recovery.use((r) => r);
  const firstDrawn = usePrefs((p) => p.firstDrawn);

  useEffect(() => {
    let live = true;
    void listRecentFiles().then((r) => live && setRecent(r.filter((f) => !f.missing).slice(0, 4)));
    return () => void (live = false);
  }, []);

  // A new drawing replaces the open one, so the files area asks about unsaved changes first (and may save them).
  const make = async (doc: Doc, label: string) => {
    if (!(await askAboutUnsavedChanges())) return;
    store().load(doc);
    closeSheet();
    toast(line('welcome.ready', { kind: label }), { kind: 'success' });
  };

  const num = (key: 'width' | 'height' | 'fps' | 'pixelSize') => (e: React.ChangeEvent<HTMLInputElement>) => setSpec((s) => ({ ...s, [key]: e.target.value === '' ? 0 : Number(e.target.value) }));
  const keepFavourite = () => {
    const f = saveFavourite(naming ?? '', rememberable(spec));
    setNaming(null);
    toast(f ? `Saved ${f.name}. It sits beside Doodle and Square.` : `You have ${MAX_FAVOURITES} favourites already. Remove one to make room.`, { kind: f ? 'success' : 'warn' });
  };
  const dims = spec.pixel ? { w: clampInt(spec.width, 1, 512, 64) * clampInt(spec.pixelSize, 1, 64, 8), h: clampInt(spec.height, 1, 512, 64) * clampInt(spec.pixelSize, 1, 64, 8) } : { w: clampInt(spec.width, 1, 8192, 1280), h: clampInt(spec.height, 1, 8192, 720) };

  return (
    <Modal title={mode === 'welcome' ? 'Welcome to Frameling' : 'New drawing'} size="lg" hideHeader className="ui-welcome" onClose={closeSheet} initialFocus=".ui-preset">
      <div className="ui-welcome-head">
        {quill ? <Quill surface="hello" anim={[{ anim: 'wave', hold: 2480 }, { anim: 'idle' }]} size={96} className="ui-welcome-quill" /> : <Logo size={64} />}
        <div>
          <h2>{quillOn ? line(mode === 'welcome' ? 'welcome.hello' : 'welcome.new') : mode === 'welcome' ? 'What would you like to make?' : 'Start something new'}</h2>
          <p>{line('welcome.lead')}</p>
        </div>
        <button type="button" className="ui-icon-btn ui-welcome-x" aria-label="Close" onClick={closeSheet}>
          <Icon name="close" />
        </button>
      </div>

      {/* Work found after a crash comes before everything else. */}
      {found && (
        <div className="ui-recover-card" role="group" aria-label="Unsaved work" data-help="autosave">
          <Icon name="undo" size={22} />
          <div>
            <strong>Your unsaved work from {whenSaved(found.savedAt)}</strong>
            <span>
              {found.name} was still open when Frameling closed. We kept a copy.
            </span>
          </div>
          <button type="button" className="ui-btn ui-btn-primary" data-testid="toast.restore" onClick={restorePending}>
            Restore
          </button>
          <button type="button" className="ui-btn" data-tip="It stays in File > Recover unsaved work for 7 days." onClick={dismissPending}>
            Not now
          </button>
        </div>
      )}

      {/* A newcomer's best first step sits at the top, and stays there while the sheet scrolls, until something has been drawn. */}
      {quest && mode === 'welcome' && !firstDrawn && (
        <div className="ui-quest ui-quest-pinned" data-help="quests">
          <span className="ui-quest-icon">
            <Icon name={quest.icon} size={18} />
          </span>
          <div>
            <strong>{quest.title}</strong>
            <p>{quest.summary}</p>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => {
              startQuest(quest.id);
              closeSheet();
            }}
          >
            Show me
          </button>
        </div>
      )}

      {/* First, so someone coming back finds their work without scrolling past every example. */}
      {recent.length > 0 && (
        <div className="ui-recent" data-help="saving-and-opening">
          <h3>Pick up where you left off</h3>
          <div className="ui-recent-list">
            {shownRecent(recent).map(({ file: r, name, tip }) => (
              <button
                key={r.path}
                type="button"
                className="ui-recent-item"
                data-tip={tip}
                onClick={() => {
                  closeSheet();
                  window.setTimeout(() => void openPath(r.path), 0);
                }}
              >
                <RecentPicture preview={pics[r.path]} size={44} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ui-presets" data-help="new-document">
        {PRESETS.filter((p) => !p.pixelSize).map((p, i) => (
          <button key={p.id} type="button" className="ui-preset" data-wraps data-testid={`welcome.preset.${p.id}`} style={{ animationDelay: `${i * 50}ms` }} onClick={() => void make(docFromPreset(p), p.title.toLowerCase())}>
            <span className={`ui-preset-art ${p.pixelSize ? 'is-pixel' : ''}`}>
              <span className="ui-preset-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
              <Icon name={p.icon} size={22} />
            </span>
            <strong>{p.title}</strong>
            <span className="ui-preset-size">{p.grid ? `${p.grid.width} x ${p.grid.height} pixels` : units === 'px' ? `${p.width} x ${p.height}` : formatSize(p.width, p.height, units)}</span>
            <span className="ui-preset-blurb">{p.blurb}</span>
          </button>
        ))}
        {quill && (
          <button
            type="button"
            className="ui-preset"
            data-wraps
            style={{ animationDelay: '100ms' }}
            data-help="pixel-new"
            data-testid="welcome.preset.pixel"
            onClick={() => {
              closeSheet();
              window.setTimeout(openPixelChooser, 0);
            }}
          >
            <span className="ui-preset-art is-pixel">
              <span className="ui-preset-shape" style={{ aspectRatio: '1 / 1' }} />
              <Icon name="pixel" size={22} />
            </span>
            <strong>Pixel art</strong>
            <span className="ui-preset-size">Chunky little pixels</span>
            <span className="ui-preset-blurb">One picture, an animation, frames on boards or sprites on a sheet. Quill asks which.</span>
          </button>
        )}
        {favs.map((f, i) => (
          <div key={f.id} className="ui-fav-wrap" data-testid={`welcome.favourite.${f.id}`}>
            <button type="button" className="ui-preset ui-fav" data-wraps data-testid="welcome.favourite" onClick={() => void make(docFromFavourite(f), f.name.toLowerCase())}>
              <span className={`ui-preset-art ${f.spec.pixel ? 'is-pixel' : ''}`}>
                <span className="ui-preset-shape" style={{ aspectRatio: `${f.spec.width} / ${f.spec.height}` }} />
                <Icon name="heart" size={22} />
              </span>
              <strong>{f.name}</strong>
              <span className="ui-preset-size">{favouriteSize(f, units)}</span>
              <span className="ui-preset-blurb">{favouriteKind(f)}</span>
            </button>
            {renaming === f.id && (
              <input
                className="ui-fav-rename"
                type="text"
                aria-label={`New name for ${f.name}`}
                defaultValue={f.name}
                maxLength={MAX_FAVOURITE_NAME}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => setRenaming(null)}
                onKeyDown={(e) => {
                  // Enter keeps the name; Escape only cancels the rename (preventDefault stops it closing the sheet).
                  if (e.key === 'Enter') {
                    renameFavouriteKept(f.id, e.currentTarget.value);
                    setRenaming(null);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenaming(null);
                  }
                }}
              />
            )}
            <span className="ui-fav-tools">
              <button type="button" className="ui-icon-btn" aria-label={`Rename ${f.name}`} data-tip="Rename" onClick={() => setRenaming(f.id)}>
                <Icon name="pencil" size={14} />
              </button>
              <button type="button" className="ui-icon-btn" aria-label={`Move ${f.name} earlier`} data-tip="Move earlier" disabled={i === 0} onClick={() => moveFavouriteKept(f.id, -1)}>
                <Icon name="chevron-left" size={14} />
              </button>
              <button type="button" className="ui-icon-btn" aria-label={`Move ${f.name} later`} data-tip="Move later" disabled={i === favs.length - 1} onClick={() => moveFavouriteKept(f.id, 1)}>
                <Icon name="chevron-right" size={14} />
              </button>
              <button
                type="button"
                className="ui-icon-btn"
                aria-label={`Remove ${f.name}`}
                data-tip="Remove from your favourites"
                onClick={() => {
                  const undo = removeFavouriteKept(f.id);
                  if (undo) toast(`Removed ${f.name} from your favourites.`, { action: { label: 'Undo', run: undo } });
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </span>
          </div>
        ))}
        <button type="button" data-wraps className={`ui-preset${custom ? ' is-chosen' : ''}`} style={{ animationDelay: '200ms' }} aria-expanded={custom} onClick={() => setCustom((c) => !c)}>
          <span className="ui-preset-art">
            <Icon name="settings" size={22} />
          </span>
          <strong>Custom</strong>
          <span className="ui-preset-size">Your own size</span>
          <span className="ui-preset-blurb">Choose the size, pixel art or not, and whether it moves.</span>
        </button>
      </div>

      {!quill && <PixelStarters onMade={closeSheet} />}

      {custom && (
        <form
          className="ui-custom"
          onSubmit={(e) => {
            e.preventDefault();
            rememberCustom(spec);
            void make(docFromCustom(spec), 'drawing');
          }}
        >
          <label className="ui-field ui-field-wide">
            <span>Name</span>
            <input type="text" value={spec.name} maxLength={80} onChange={(e) => setSpec((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label className="ui-field">
            <span>{spec.pixel ? 'Grid width' : units === 'px' ? 'Width' : `Width (${units})`}</span>
            {spec.pixel || units === 'px' ? <input type="number" min={1} max={spec.pixel ? 512 : 8192} value={spec.width || ''} onChange={num('width')} /> : <UnitInput px={spec.width} unit={units} dpi={spec.dpi} onPx={(width) => setSpec((s) => ({ ...s, width }))} />}
          </label>
          <label className="ui-field">
            <span>{spec.pixel ? 'Grid height' : units === 'px' ? 'Height' : `Height (${units})`}</span>
            {spec.pixel || units === 'px' ? <input type="number" min={1} max={spec.pixel ? 512 : 8192} value={spec.height || ''} onChange={num('height')} /> : <UnitInput px={spec.height} unit={units} dpi={spec.dpi} onPx={(height) => setSpec((s) => ({ ...s, height }))} />}
          </label>
          <div className="ui-custom-ticks ui-field-wide">
            <label className="ui-check ui-field">
              <input type="checkbox" checked={spec.pixel} onChange={(e) => setSpec((s) => setPixelMode(s, e.target.checked))} />
              <span>Pixel art</span>
            </label>
            <label className="ui-check ui-field" data-tip="Add animation" data-tip-desc="Tick it to make something that moves, frame by frame. Leave it off for a single picture; you can add animation later.">
              <input type="checkbox" data-testid="welcome.custom.animate" checked={!!spec.animate} onChange={(e) => setSpec((s) => ({ ...s, animate: e.target.checked }))} />
              <span>Add animation</span>
            </label>
          </div>
          {spec.animate && (
            <label className="ui-field">
              <span>Frames a second</span>
              <input type="number" min={1} max={60} value={spec.fps || ''} onChange={num('fps')} />
            </label>
          )}
          {!spec.pixel && units !== 'px' && (
            <label className="ui-field" data-tip="Dots per inch" data-tip-desc="How many pixels make an inch. 96 matches screens and the web; 300 is sharp for print.">
              <span>DPI</span>
              <input type="number" min={1} max={10000} value={spec.dpi ?? 96} onChange={(e) =>
                  // The size you typed stays the same on paper, so the pixels change with the DPI.
                  setSpec((s) => {
                    const dpi = e.target.value === '' ? undefined : Number(e.target.value);
                    const k = cleanDpi(dpi) / cleanDpi(s.dpi);
                    return { ...s, dpi, width: s.width * k, height: s.height * k };
                  })
                } />
            </label>
          )}
          {spec.pixel && (
            <label className="ui-field">
              <span>Size of one pixel</span>
              <input type="number" min={1} max={64} value={spec.pixelSize || ''} onChange={num('pixelSize')} />
            </label>
          )}
          {naming !== null && (
            <div className="ui-fav-save ui-field-wide" role="group" aria-label="Save as favourite">
              <label className="ui-field">
                <span>Name this favourite</span>
                <input
                  type="text"
                  data-testid="welcome.favourite.name"
                  value={naming}
                  maxLength={MAX_FAVOURITE_NAME}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setNaming(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter saves the favourite here; it must not start the drawing.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      keepFavourite();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setNaming(null);
                    }
                  }}
                />
              </label>
              <button type="button" className="ui-btn ui-btn-primary" data-testid="welcome.favourite.keep" onClick={keepFavourite}>
                Save
              </button>
              <button type="button" className="ui-btn" onClick={() => setNaming(null)}>
                Cancel
              </button>
            </div>
          )}
          <div className="ui-custom-end">
            <span className="ui-custom-sum">
              Makes a {dims.w} x {dims.h} drawing{!spec.pixel && units !== 'px' ? ` (${formatSize(dims.w, dims.h, units, cleanDpi(spec.dpi))})` : ''}.
            </span>
            <button
              type="button"
              className="ui-btn"
              data-testid="welcome.custom.favourite"
              disabled={favs.length >= MAX_FAVOURITES}
              data-tip={favs.length >= MAX_FAVOURITES ? `You have ${MAX_FAVOURITES} favourites. Remove one to make room.` : 'Save as favourite'}
              data-tip-desc={favs.length >= MAX_FAVOURITES ? undefined : 'Keep these settings as a card beside Doodle and Square, so next time it is one press.'}
              onClick={() => setNaming(suggestedName(rememberable(spec)))}
            >
              <Icon name="heart" size={16} />
              Save as favourite
            </button>
            <button type="submit" className="ui-btn ui-btn-primary" data-testid="welcome.custom.start">
              Start
            </button>
          </div>
        </form>
      )}

      <Examples scrollTo={sheetMode === 'examples'} onPick={(doc, name) => void make(doc, name)} />

      {quest && mode === 'welcome' && firstDrawn && (
        <div className="ui-quest">
          <span className="ui-quest-icon">
            <Icon name={quest.icon} size={22} />
          </span>
          <div>
            <strong>{quest.title}</strong>
            <p>{quest.summary}</p>
          </div>
          <button
            type="button"
            className="ui-btn"
            onClick={() => {
              startQuest(quest.id);
              closeSheet();
            }}
          >
            Show me
          </button>
        </div>
      )}

      <div className="ui-welcome-foot">
        {open && (
          <button
            type="button"
            className="ui-btn"
            onClick={() => {
              closeSheet();
              window.setTimeout(() => runCommand(open), 0);
            }}
          >
            <Icon name="open" size={16} />
            Open a drawing
          </button>
        )}
        <span className="ui-status-spacer" />
        {mode === 'welcome' && (
          <label className="ui-check">
            <input type="checkbox" checked={!showWelcome} onChange={(e) => setPrefs({ showWelcome: !e.target.checked })} />
            <span>Don't show this again</span>
          </label>
        )}
        <button type="button" className="ui-btn ui-btn-quiet" onClick={closeSheet}>
          {mode === 'welcome' ? 'Skip for now' : 'Cancel'}
        </button>
      </div>
    </Modal>
  );
}

/** A size typed in mm, cm, in or pt. Keeps its own text while typing so "12." doesn't jump; hands back pixels. */
function UnitInput({ px, unit, dpi, onPx }: { px: number; unit: Unit; dpi?: number; onPx: (px: number) => void }) {
  const shown = px ? String(roundIn(pxTo(px, unit, cleanDpi(dpi)), unit)) : '';
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={0}
      step="any"
      value={text ?? shown}
      onFocus={() => setText(shown)}
      onBlur={() => setText(null)}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        onPx(e.target.value === '' || !Number.isFinite(v) ? 0 : toPx(v, unit, cleanDpi(dpi)));
      }}
    />
  );
}

// ---------------------------------------------------------------- examples

interface TemplateLike {
  id: string;
  name: string;
  blurb: string;
  kind: 'vector' | 'pixel';
  /** Words for searching and the little chips on the card. */
  tags?: string[];
  /** The frame that makes the best picture (0 when missing). */
  thumbnail?: () => number;
  make(): Doc;
}

/** The example drawings, loaded when the sheet opens. If the templates area isn't there, the row just isn't shown. */
function useTemplates(): TemplateLike[] {
  const [list, setList] = useState<TemplateLike[]>([]);
  useEffect(() => {
    let live = true;
    // Templates that belong to a feature that is turned off are left out.
    const hidden = hiddenTemplateIds();
    import('../templates')
      .then((m) => live && setList(((m as { TEMPLATES?: TemplateLike[] }).TEMPLATES ?? []).filter((t) => t && typeof t.make === 'function' && !hidden.has(t.id))))
      .catch(() => {});
    return () => void (live = false);
  }, []);
  return list;
}

/** A small picture of frame 0, drawn when the card appears. */
function Thumb({ template }: { template: TemplateLike }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const doc = template.make();
      // Fitted whole (square and tall pages used to fill the box and run under the badge), drawn at the screen's
      // pixel density so it stays sharp.
      const fit = fitThumb(doc.width, doc.height);
      const img = renderFrameToCanvas(doc, Math.max(0, Math.min(doc.length - 1, template.thumbnail?.() ?? 0)), fit.scale * (window.devicePixelRatio || 1));
      el.width = img.width;
      el.height = img.height;
      el.style.width = `${fit.w}px`;
      el.style.height = `${fit.h}px`;
      const g = el.getContext('2d');
      if (g) {
        // Pixel art should stay chunky in the little picture.
        g.imageSmoothingEnabled = template.kind !== 'pixel';
        g.drawImage(img, 0, 0);
        paintThumbBackdrop(el);
      }
    } catch {
      // No picture is fine, the card still works.
    }
  }, [template]);
  return <canvas ref={ref} className="ui-example-thumb" aria-hidden="true" />;
}

interface Starter {
  template: TemplateLike;
  /** Nothing drawn yet: shown as a size to start from, not as a picture card. */
  blank: boolean;
  size: string;
  /** Width / height, for the little shape. */
  aspect: number;
  fps: number;
}

/** Sorts the templates into examples with something in them and blank starters, making each one once. */
function useStarters(templates: TemplateLike[]): Starter[] {
  return useMemo(
    () =>
      templates.flatMap((t) => {
        try {
          const doc = t.make();
          return [{ template: t, blank: isBlankDoc(doc), size: sizeLabel(doc), aspect: doc.width / doc.height, fps: doc.fps }];
        } catch {
          return [{ template: t, blank: false, size: '', aspect: 1, fps: 0 }];
        }
      }),
    [templates],
  );
}

/** The shape of the stage, as an outline (checked for pixel art), inside a fixed box. */
function AspectBox({ aspect, pixel }: { aspect: number; pixel: boolean }) {
  const w = aspect >= 1 ? 30 : Math.max(8, Math.round(30 * aspect));
  const h = aspect >= 1 ? Math.max(8, Math.round(30 / aspect)) : 30;
  return (
    <span className="ui-blank-shape-box" aria-hidden="true">
      <span className={`ui-blank-shape${pixel ? ' is-pixel' : ''}`} style={{ width: w, height: h }} />
    </span>
  );
}

function Examples({ onPick, scrollTo }: { onPick: (doc: Doc, name: string) => void; scrollTo: boolean }) {
  const templates = useTemplates();
  const starters = useStarters(templates);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollTo && templates.length) box.current?.scrollIntoView({ block: 'nearest' });
  }, [scrollTo, templates.length]);
  if (!templates.length) return null;
  // Blank starters sit in a compact row of sizes under the examples (picked on the board over dashed cards).
  const examples = starters.filter((s) => !s.blank);
  const blanks = starters.filter((s) => s.blank);
  const pick = (t: TemplateLike) => onPick(t.make(), t.name.toLowerCase());
  const thumb = (t: TemplateLike) => <Thumb template={t} />;
  return <TabbedExamples box={box} examples={examples} blanks={blanks} pick={pick} onPick={onPick} thumb={thumb} />;
}

/** A built-in template's tags as small chips under its blurb (the first few, then "+2"). */
function TagChips({ tags }: { tags?: string[] }) {
  const { shown, more } = tagChips(tags);
  if (!shown.length) return null;
  return (
    <span className="ui-example-tags">
      <span className="ui-sr-only">Tags: </span>
      {shown.map((tag) => (
        <span key={tag} className="ui-tag-chip">
          {tag}
        </span>
      ))}
      {more.length > 0 && (
        <>
          <span className="ui-tag-chip is-more" data-tip={more.join(', ')} aria-hidden="true">
            +{more.length}
          </span>
          <span className="ui-sr-only">{more.join(', ')}</span>
        </>
      )}
    </span>
  );
}

/** Built-in and Yours (and any other template source) as tabs: picked on the board over stacked sections. */
function TabbedExamples({
  box,
  examples,
  blanks,
  pick,
  onPick,
  thumb,
}: {
  box: React.RefObject<HTMLDivElement | null>;
  examples: Starter[];
  blanks: Starter[];
  pick: (t: TemplateLike) => void;
  onPick: (doc: Doc, name: string) => void;
  thumb: (t: TemplateLike) => React.ReactNode;
}) {
  const sources = templateSources();
  const [tab, setTab] = useState((window as { __templatesTab?: string }).__templatesTab ?? 'builtin');
  const source = sources.find((s) => s.id === tab);
  return (
    <div className="ui-examples" ref={box} data-help="examples">
      <h3>Start from an example</h3>
      <div className="ui-segmented tpl-tabs" role="tablist" aria-label="Which templates">
        {[{ id: 'builtin', title: 'Built-in' }, ...sources].map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} className={`ui-seg${tab === s.id ? ' is-chosen' : ''}`} onClick={() => setTab(s.id)}>
            {s.title}
          </button>
        ))}
      </div>
      {source ? (
        <SourceCards source={source} onPick={onPick} thumb={thumb} />
      ) : (
        <>
          <div className="ui-example-list" role="tabpanel">
            {examples.map(({ template: t }) => (
              <button key={t.id} type="button" data-wraps className="ui-example" onClick={() => pick(t)}>
                <span className="ui-example-art">
                  <Thumb template={t} />
                  {/* On the picture's corner, so long names get the whole width. */}
                  <span className={`ui-badge ui-badge-${t.kind} ui-example-badge`}>
                    <Icon name={t.kind === 'pixel' ? 'pixel' : 'vector'} size={12} />
                    {t.kind === 'pixel' ? 'Pixel' : 'Vector'}
                  </span>
                </span>
                <span className="ui-example-head">
                  <strong>{t.name}</strong>
                </span>
                <span className="ui-preset-blurb">{t.blurb}</span>
                <TagChips tags={t.tags} />
              </button>
            ))}
          </div>
          {blanks.length > 0 && (
            <div className="ui-blank-row">
              <span className="ui-blank-row-label">Or start blank, with layers ready:</span>
              {blanks.map(({ template: t, size, aspect, fps }) => (
                <button key={t.id} type="button" className="ui-blank" data-tip={t.blurb} onClick={() => pick(t)}>
                  <AspectBox aspect={aspect} pixel={t.kind === 'pixel'} />
                  <span className="ui-blank-text">
                    <strong>{t.name}</strong>
                    <span>
                      {size}
                      {fps ? `, ${fps} fps` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
