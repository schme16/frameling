import { useEffect, useMemo, useRef, useState } from 'react';
import { getCommand } from '../core/registry';
import { renderFrameToCanvas } from '../core/render';
import { store } from '../core/store';
import type { Doc } from '../core/format';
import { askAboutUnsavedChanges, listRecentFiles, openPath } from '../io/document';
import type { RecentFile } from '../preload/api';
import { Icon, Logo } from './icons';
import { Quill, useQuillShown } from './mascot';
import { Modal } from './Modal';
import { closeSheet, overlays } from './overlays';
import { runCommand } from './palette';
import { clampInt, docFromCustom, docFromPreset, isBlankDoc, PRESETS, sizeLabel, type CustomSpec } from './presets';
import { setPrefs, usePrefs } from './prefs';
import { getQuest, startQuest } from './quests';
import { toast } from './toast';

export function WelcomeSheet() {
  const mode = overlays.use((o) => o.sheet);
  if (!mode) return null;
  return <Sheet mode={mode} />;
}

function Sheet({ mode: sheetMode }: { mode: 'welcome' | 'new' | 'examples' }) {
  const mode = sheetMode === 'welcome' ? 'welcome' : 'new';
  const showWelcome = usePrefs((p) => p.showWelcome);
  const [custom, setCustom] = useState(false);
  const [spec, setSpec] = useState<CustomSpec>({ name: 'Untitled', width: 800, height: 600, fps: 12, pixel: false, pixelSize: 8 });
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const open = getCommand('file.open');
  const quest = getQuest('first-animation');
  const quill = useQuillShown();

  useEffect(() => {
    let live = true;
    void listRecentFiles().then((r) => live && setRecent(r.slice(0, 4)));
    return () => void (live = false);
  }, []);

  // A new drawing replaces the open one, so the files area asks about unsaved changes first (and may save them).
  const make = async (doc: Doc, label: string) => {
    if (!(await askAboutUnsavedChanges())) return;
    store().load(doc);
    closeSheet();
    toast(`A fresh ${label} is ready. Have fun!`, { kind: 'success' });
  };

  const num = (key: 'width' | 'height' | 'fps' | 'pixelSize') => (e: React.ChangeEvent<HTMLInputElement>) => setSpec((s) => ({ ...s, [key]: e.target.value === '' ? 0 : Number(e.target.value) }));
  const dims = spec.pixel ? { w: clampInt(spec.width, 1, 512, 64) * clampInt(spec.pixelSize, 1, 64, 8), h: clampInt(spec.height, 1, 512, 64) * clampInt(spec.pixelSize, 1, 64, 8) } : { w: clampInt(spec.width, 1, 8192, 1280), h: clampInt(spec.height, 1, 8192, 720) };

  return (
    <Modal title={mode === 'welcome' ? 'Welcome to Frameling' : 'New drawing'} size="lg" hideHeader className="ui-welcome" onClose={closeSheet} initialFocus=".ui-preset">
      <div className="ui-welcome-head">
        {quill ? <Quill anim={[{ anim: 'wave', hold: 2480 }, { anim: 'idle' }]} size={96} className="ui-welcome-quill" /> : <Logo size={64} />}
        <div>
          <h2>{mode === 'welcome' ? 'Hello! What shall we make?' : 'Start something new'}</h2>
          <p>Pick a card. You can always change your mind later.</p>
        </div>
        <button type="button" className="ui-icon-btn ui-welcome-x" aria-label="Close" onClick={closeSheet}>
          <Icon name="close" />
        </button>
      </div>

      <div className="ui-presets" data-help="new-document">
        {PRESETS.map((p, i) => (
          <button key={p.id} type="button" className="ui-preset" style={{ animationDelay: `${i * 50}ms` }} onClick={() => void make(docFromPreset(p), p.title.toLowerCase())}>
            <span className={`ui-preset-art ${p.pixelSize ? 'is-pixel' : ''}`}>
              <span className="ui-preset-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
              <Icon name={p.icon} size={22} />
            </span>
            <strong>{p.title}</strong>
            <span className="ui-preset-size">{p.grid ? `${p.grid.width} x ${p.grid.height} pixels` : `${p.width} x ${p.height}`}</span>
            <span className="ui-preset-blurb">{p.blurb}</span>
          </button>
        ))}
        <button type="button" className={`ui-preset${custom ? ' is-chosen' : ''}`} style={{ animationDelay: '200ms' }} aria-expanded={custom} onClick={() => setCustom((c) => !c)}>
          <span className="ui-preset-art">
            <Icon name="settings" size={22} />
          </span>
          <strong>Custom</strong>
          <span className="ui-preset-size">Your own size</span>
          <span className="ui-preset-blurb">Choose the size, the speed and pixel art or not.</span>
        </button>
      </div>

      {custom && (
        <form
          className="ui-custom"
          onSubmit={(e) => {
            e.preventDefault();
            void make(docFromCustom(spec), 'drawing');
          }}
        >
          <label className="ui-field ui-field-wide">
            <span>Name</span>
            <input type="text" value={spec.name} maxLength={80} onChange={(e) => setSpec((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label className="ui-field">
            <span>{spec.pixel ? 'Grid width' : 'Width'}</span>
            <input type="number" min={1} max={spec.pixel ? 512 : 8192} value={spec.width || ''} onChange={num('width')} />
          </label>
          <label className="ui-field">
            <span>{spec.pixel ? 'Grid height' : 'Height'}</span>
            <input type="number" min={1} max={spec.pixel ? 512 : 8192} value={spec.height || ''} onChange={num('height')} />
          </label>
          <label className="ui-field">
            <span>Frames a second</span>
            <input type="number" min={1} max={60} value={spec.fps || ''} onChange={num('fps')} />
          </label>
          <label className="ui-check ui-field">
            <input type="checkbox" checked={spec.pixel} onChange={(e) => setSpec((s) => ({ ...s, pixel: e.target.checked, width: e.target.checked ? 64 : 800, height: e.target.checked ? 64 : 600 }))} />
            <span>Pixel art</span>
          </label>
          {spec.pixel && (
            <label className="ui-field">
              <span>Size of one pixel</span>
              <input type="number" min={1} max={64} value={spec.pixelSize || ''} onChange={num('pixelSize')} />
            </label>
          )}
          <div className="ui-custom-end">
            <span className="ui-custom-sum">
              Makes a {dims.w} x {dims.h} drawing.
            </span>
            <button type="submit" className="ui-btn ui-btn-primary">
              Start
            </button>
          </div>
        </form>
      )}

      <Examples scrollTo={sheetMode === 'examples'} onPick={(doc, name) => void make(doc, name)} />

      {recent.length > 0 && (
        <div className="ui-recent" data-help="saving-and-opening">
          <h3>Pick up where you left off</h3>
          <div className="ui-recent-list">
            {recent.map((r) => (
              <button
                key={r.path}
                type="button"
                className="ui-recent-item"
                data-tip={r.path}
                onClick={() => {
                  closeSheet();
                  window.setTimeout(() => void openPath(r.path), 0);
                }}
              >
                <Icon name="film" size={16} />
                <span>{r.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {quest && mode === 'welcome' && (
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

      <footer className="ui-welcome-foot">
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
      </footer>
    </Modal>
  );
}

// ---------------------------------------------------------------- examples

interface TemplateLike {
  id: string;
  name: string;
  blurb: string;
  kind: 'vector' | 'pixel';
  /** The frame that makes the best picture (0 when missing). */
  thumbnail?: () => number;
  make(): Doc;
}

/** The example drawings, loaded when the sheet opens. If the templates area isn't there, the row just isn't shown. */
function useTemplates(): TemplateLike[] {
  const [list, setList] = useState<TemplateLike[]>([]);
  useEffect(() => {
    let live = true;
    import('../templates')
      .then((m) => live && setList(((m as { TEMPLATES?: TemplateLike[] }).TEMPLATES ?? []).filter((t) => t && typeof t.make === 'function')))
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
      const scale = Math.min(168 / doc.width, 96 / doc.height);
      const img = renderFrameToCanvas(doc, Math.max(0, Math.min(doc.length - 1, template.thumbnail?.() ?? 0)), scale);
      el.width = img.width;
      el.height = img.height;
      const g = el.getContext('2d');
      if (g) {
        // Pixel art should stay chunky in the little picture.
        g.imageSmoothingEnabled = template.kind !== 'pixel';
        g.drawImage(img, 0, 0);
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

// Blank starters as a compact row of sizes (A, the default) or as dashed cards among the examples (B). B only shows
// with data-blank-look="cards" on the page, for the side by side look in brand/ab/templates.
const blankLook = () => (typeof document !== 'undefined' && document.documentElement.dataset.blankLook === 'cards' ? 'cards' : 'row');

function Examples({ onPick, scrollTo }: { onPick: (doc: Doc, name: string) => void; scrollTo: boolean }) {
  const templates = useTemplates();
  const starters = useStarters(templates);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollTo && templates.length) box.current?.scrollIntoView({ block: 'nearest' });
  }, [scrollTo, templates.length]);
  if (!templates.length) return null;
  const cards = blankLook() === 'cards';
  const examples = cards ? starters : starters.filter((s) => !s.blank);
  const blanks = cards ? [] : starters.filter((s) => s.blank);
  const pick = (t: TemplateLike) => onPick(t.make(), t.name.toLowerCase());
  return (
    <div className="ui-examples" ref={box} data-help="examples">
      <h3>Start from an example</h3>
      <div className="ui-example-list">
        {examples.map(({ template: t, blank, size }) => (
          <button key={t.id} type="button" className={`ui-example${blank ? ' is-blank' : ''}`} onClick={() => pick(t)}>
            <span className="ui-example-art">{blank ? <span className="ui-example-blank-size">{size}</span> : <Thumb template={t} />}</span>
            <span className="ui-example-head">
              <strong>{t.name}</strong>
              <span className={`ui-badge ui-badge-${t.kind}`}>
                <Icon name={t.kind === 'pixel' ? 'pixel' : 'vector'} size={12} />
                {t.kind === 'pixel' ? 'Pixel' : 'Vector'}
              </span>
            </span>
            <span className="ui-preset-blurb">{t.blurb}</span>
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
    </div>
  );
}
