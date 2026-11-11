import { useEffect, useState } from 'react';
import { getCommand } from '../core/registry';
import { store } from '../core/store';
import type { Doc } from '../core/format';
import { askAboutUnsavedChanges, listRecentFiles, openPath } from '../io/document';
import type { RecentFile } from '../preload/api';
import { Icon, Logo } from './icons';
import { Modal } from './Modal';
import { closeSheet, overlays } from './overlays';
import { runCommand } from './palette';
import { clampInt, docFromCustom, docFromPreset, PRESETS, type CustomSpec } from './presets';
import { setPrefs, usePrefs } from './prefs';
import { allQuests, startQuest } from './quests';
import { toast } from './toast';

export function WelcomeSheet() {
  const mode = overlays.use((o) => o.sheet);
  if (!mode) return null;
  return <Sheet mode={mode} />;
}

function Sheet({ mode }: { mode: 'welcome' | 'new' }) {
  const showWelcome = usePrefs((p) => p.showWelcome);
  const [custom, setCustom] = useState(false);
  const [spec, setSpec] = useState<CustomSpec>({ name: 'Untitled', width: 800, height: 600, fps: 12, pixel: false, pixelSize: 8 });
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const open = getCommand('file.open');
  const quest = allQuests()[0];

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
        <Logo size={48} />
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
              toast('Quests are on their way. For now, draw something, go to the next frame, draw again and press play!', { kind: 'info', duration: 8000 });
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
