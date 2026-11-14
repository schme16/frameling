// The Themes page in Preferences: pick a theme for dark mode and one for light mode from a gallery of little
// previews, make a copy of any of them to customise, or import one from a file.
import { useCallback, useRef, useState } from 'react';
import { Icon } from '../icons';
import { openHelp } from '../overlays';
import { menuPoint, openDockMenu } from '../dockMenus';
import { effectiveTheme, getPrefs, setPrefs, usePrefs, type ThemePref } from '../prefs';
import { toast } from '../toast';
import { BUILT_IN_THEMES, type Theme } from './builtIn';
import { addCustomTheme, selectTheme } from './library';
import { copyTheme, findTheme, importThemeText, MAX_FILE_BYTES } from './model';
import { ThemeEditor } from './ThemeEditor';
import { ThemePreview } from './ThemePreview';
import type { ThemeMode } from './tokens';

/** The wave the card is cut along, as the ink line drawn over the join. The same points as the clip in ui.css. */
const SQUIGGLE = '100,0 97.8,3.4 95.8,7 93.6,10.3 90.9,13.1 87.4,15.2 83.3,16.7 79.1,18 75.1,19.5 71.7,21.7 69.3,24.8 67.7,28.8 66.7,33.3 65.7,38 64.4,42.2 62.2,45.5 58.9,47.8 54.7,49.2 50,50 45.3,50.8 41.1,52.2 37.8,54.5 35.6,57.8 34.3,62 33.3,66.7 32.3,71.2 30.7,75.2 28.3,78.3 24.9,80.5 20.9,82 16.7,83.3 12.6,84.8 9.1,86.9 6.4,89.7 4.2,93 2.2,96.6 0,100';

/** One theme's half of the card: the real app preview, drawn in that theme's colours. */
function ThemeHalf({ theme, dark = false }: { theme: Theme; dark?: boolean }) {
  return <ThemePreview theme={theme} className={`th-current-half${dark ? ' is-dark' : ''}`} />;
}

/**
 * The theme you are using, as one card cut corner to corner by a squiggle: your light pick on the top left, your dark
 * pick on the bottom right. One picture of both, however the Mode switch is set.
 */
function CurrentTheme({ dark, light }: { dark: Theme; light: Theme }) {
  return (
    <section className="th-current" aria-label="The themes you are using">
      <div className="th-current-art">
        <ThemeHalf theme={light} />
        <ThemeHalf theme={dark} dark />
        <svg className="th-current-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={SQUIGGLE} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="th-current-words">
        <strong>Your two themes</strong>
        <span>
          <Icon name="sun" size={13} /> {light.name} by day
        </span>
        <span>
          <Icon name="moon" size={13} /> {dark.name} at night
        </span>
      </div>
    </section>
  );
}

/** The theme behind an id, falling back to the default for that mode if it has gone. */
const themeOf = (id: string, mode: ThemeMode, custom: Theme[]): Theme => findTheme(id, custom) ?? BUILT_IN_THEMES.find((t) => t.mode === mode)!;

/** A card in the gallery: the preview, the name, and badges saying which of your two themes it is, if either. */
function ThemeCard({ theme, use, onPick, onCopy, onEdit }: { theme: Theme; use: { day: boolean; night: boolean }; onPick: (at: { x: number; y: number }) => void; onCopy: () => void; onEdit?: () => void }) {
  const chosen = use.day || use.night;
  const says = use.day && use.night ? 'your theme by day and at night' : use.day ? 'your theme by day' : use.night ? 'your theme at night' : 'not in use';
  return (
    <div className={`th-card${chosen ? ' is-chosen' : ''}`}>
      <button type="button" className="th-card-pick" onClick={(e) => onPick(menuPoint(e.currentTarget))} data-tip={theme.name} data-tip-desc={theme.description ?? 'Made by you.'} aria-label={`${theme.name}, ${says}. ${theme.description ?? 'Made by you.'}`}>
        <ThemePreview theme={theme} />
        {chosen && (
          <span className={`th-card-badges${use.day && use.night ? ' is-both' : ''}`} aria-hidden="true">
            {use.day && (
              <span className="th-card-badge is-day" title="Your theme by day">
                <Icon name="sun" size={16} />
              </span>
            )}
            {use.night && (
              <span className="th-card-badge is-night" title="Your theme at night">
                <Icon name="moon" size={16} />
              </span>
            )}
          </span>
        )}
        <span className="th-card-name">
          <strong>{theme.name}</strong>
          {chosen && (
            <span className="th-card-tick" aria-hidden="true">
              <Icon name="check" size={13} />
            </span>
          )}
        </span>
      </button>
      <div className="th-card-actions">
        {onEdit && (
          <button type="button" className="ui-btn ui-btn-small" onClick={onEdit}>
            Edit
          </button>
        )}
        <button type="button" className="ui-btn ui-btn-small ui-btn-quiet" onClick={onCopy} title="Make your own copy of this theme and change its colours">
          <Icon name="duplicate" size={13} />
          Duplicate and edit
        </button>
      </div>
    </div>
  );
}

/** Pressing a theme asks what it is for. Any theme can be either one, however bright or dark it is. */
function askWhatFor(theme: Theme, at: { x: number; y: number }): void {
  openDockMenu(at.x, at.y, [
    { heading: theme.name },
    { label: 'Use it by day', onClick: () => selectTheme(theme, 'light') },
    { label: 'Use it at night', onClick: () => selectTheme(theme, 'dark') },
    { label: 'Use it for both', onClick: () => { selectTheme(theme, 'light'); selectTheme(theme, 'dark'); } },
  ]);
}

/** Every theme in one grid. Which of your two a theme is shows on the card, so there is no list to pick from. */
function Gallery({ custom, day, night, onCopy, onEdit }: { custom: Theme[]; day: string; night: string; onCopy: (t: Theme) => void; onEdit: (id: string) => void }) {
  const all = [...BUILT_IN_THEMES, ...custom];
  return (
    <section className="th-section" aria-label="Every theme">
      <h4>
        <Icon name="palette" size={15} />
        Every theme
        <span className="th-now">press one and say what it is for</span>
      </h4>
      <div className="th-grid" role="group" aria-label="Themes">
        {all.map((t) => (
          <ThemeCard key={t.id} theme={t} use={{ day: t.id === day, night: t.id === night }} onPick={(at) => askWhatFor(t, at)} onCopy={() => onCopy(t)} onEdit={t.builtIn ? undefined : () => onEdit(t.id)} />
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
      <h3 data-tip="Themes" data-tip-desc="Pick the colours you like to draw with. Every theme works with both the Cosy and the Crisp look.">
        Themes
      </h3>
      <CurrentTheme dark={themeOf(p.darkTheme, 'dark', p.customThemes)} light={themeOf(p.lightTheme, 'light', p.customThemes)} />
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
      <Gallery custom={p.customThemes} day={p.lightTheme} night={p.darkTheme} onCopy={copy} onEdit={setEditing} />

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
