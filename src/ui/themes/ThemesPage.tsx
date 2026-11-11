// The Themes page in Preferences: pick a theme for dark mode and one for light mode from a gallery of little
// previews, make a copy of any of them to customise, or import one from a file.
import { useCallback, useRef, useState } from 'react';
import { Icon } from '../icons';
import { openHelp } from '../overlays';
import { effectiveTheme, getPrefs, setPrefs, usePrefs, type ThemePref } from '../prefs';
import { toast } from '../toast';
import { BUILT_IN_THEMES, type Theme } from './builtIn';
import { addCustomTheme, selectTheme } from './library';
import { copyTheme, importThemeText, MAX_FILE_BYTES } from './model';
import { ThemeEditor } from './ThemeEditor';
import { ThemePreview } from './ThemePreview';
import type { ThemeMode } from './tokens';

function ThemeCard({ theme, chosen, onPick, onCopy, onEdit }: { theme: Theme; chosen: boolean; onPick: () => void; onCopy: () => void; onEdit?: () => void }) {
  return (
    <div className={`th-card${chosen ? ' is-chosen' : ''}`}>
      <button type="button" role="radio" aria-checked={chosen} className="th-card-pick" onClick={onPick} title={theme.description}>
        <ThemePreview theme={theme} />
        <span className="th-card-name">
          <strong>{theme.name}</strong>
          {chosen && (
            <span className="th-card-tick" aria-hidden="true">
              <Icon name="check" size={13} />
            </span>
          )}
        </span>
        <span className="th-card-desc">{theme.description ?? 'Made by you.'}</span>
      </button>
      <div className="th-card-actions">
        {onEdit && (
          <button type="button" className="ui-btn ui-btn-small" onClick={onEdit}>
            Edit
          </button>
        )}
        <button type="button" className="ui-btn ui-btn-small ui-btn-quiet" onClick={onCopy} title="Make your own copy and change its colours">
          <Icon name="duplicate" size={13} />
          Make a copy to customise
        </button>
      </div>
    </div>
  );
}

function Gallery({ mode, custom, picked, onCopy, onEdit }: { mode: ThemeMode; custom: Theme[]; picked: string; onCopy: (t: Theme) => void; onEdit: (id: string) => void }) {
  const list = [...BUILT_IN_THEMES, ...custom].filter((t) => t.mode === mode);
  const showing = effectiveTheme() === mode;
  return (
    <section className="th-section" aria-label={mode === 'dark' ? 'For dark mode' : 'For light mode'}>
      <h4>
        <Icon name={mode === 'dark' ? 'moon' : 'sun'} size={15} />
        {mode === 'dark' ? 'For dark mode' : 'For light mode'}
        {showing && <span className="th-now">showing now</span>}
      </h4>
      <div className="th-grid" role="radiogroup" aria-label={mode === 'dark' ? 'Theme for dark mode' : 'Theme for light mode'}>
        {list.map((t) => (
          <ThemeCard key={t.id} theme={t} chosen={t.id === picked} onPick={() => selectTheme(t)} onCopy={() => onCopy(t)} onEdit={t.builtIn ? undefined : () => onEdit(t.id)} />
        ))}
      </div>
    </section>
  );
}

export function ThemesPage() {
  const p = usePrefs((x) => x);
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = useCallback(() => setEditing(null), []);

  const copy = (source: Theme) => {
    const c = copyTheme(source, getPrefs().customThemes);
    if (!addCustomTheme(c)) {
      toast('You have a lot of themes already. Delete one to make room.', { kind: 'warn' });
      return;
    }
    // Use the copy straight away so the whole app shows it as you edit.
    selectTheme(c);
    setEditing(c.id);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast('That file is too big to be a theme.', { kind: 'warn' });
      return;
    }
    let text = '';
    try {
      text = await file.text();
    } catch {
      toast('That file could not be opened.', { kind: 'warn' });
      return;
    }
    const r = importThemeText(text, getPrefs().customThemes);
    if (!r.ok) {
      toast(r.error, { kind: 'warn' });
      return;
    }
    addCustomTheme(r.theme);
    selectTheme(r.theme);
    toast(`Added "${r.theme.name}" and switched to it.`, { kind: 'success' });
  };

  if (editing) return <ThemeEditor id={editing} onDone={done} onOpen={setEditing} />;

  const modes: { id: ThemePref; label: string; icon: string }[] = [
    { id: 'system', label: 'System', icon: 'settings' },
    { id: 'dark', label: 'Dark', icon: 'moon' },
    { id: 'light', label: 'Light', icon: 'sun' },
  ];

  return (
    <>
      <h3>Themes</h3>
      <p className="ui-pref-intro">Pick the colours you like to draw with. Every theme works with both the Cosy and the Crisp look.</p>
      <div className="th-modebar">
        <div className="ui-pref-text">
          <strong>Mode</strong>
          <span>System uses your dark pick at night and your light pick by day, following your computer.</span>
        </div>
        <div className="ui-segmented" role="radiogroup" aria-label="Mode">
          {modes.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={p.theme === o.id} className={`ui-seg${p.theme === o.id ? ' is-chosen' : ''}`} onClick={() => setPrefs({ theme: o.id })}>
              <Icon name={o.icon} size={14} />
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Gallery mode="dark" custom={p.customThemes} picked={p.darkTheme} onCopy={copy} onEdit={setEditing} />
      <Gallery mode="light" custom={p.customThemes} picked={p.lightTheme} onCopy={copy} onEdit={setEditing} />

      <div className="th-footer">
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => copy([...BUILT_IN_THEMES, ...p.customThemes].find((t) => t.id === (effectiveTheme() === 'dark' ? p.darkTheme : p.lightTheme)) ?? BUILT_IN_THEMES[0])}>
          <Icon name="palette" size={14} />
          Make my own theme
        </button>
        <button type="button" className="ui-btn" onClick={() => fileRef.current?.click()}>
          <Icon name="open" size={14} />
          Import a theme file...
        </button>
        <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('make-your-own-theme')}>
          <Icon name="help" size={14} />
          How do I make my own?
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </>
  );
}
