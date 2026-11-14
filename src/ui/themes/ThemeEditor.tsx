// The theme editor: grouped colour controls with plain names, a live preview on the whole app, a "start from one
// colour" helper, contrast warnings in plain words, undo, rename, delete, reset, duplicate and export. Every change
// is saved as it happens (it's a copy, so nothing is at risk), and shows on the real app behind the dialog.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import { getPrefs, setThemePreview, usePrefs } from '../prefs';
import { toast } from '../toast';
import { getBuiltIn } from './builtIn';
import { checkContrast, fixPair, problemsFor } from './contrast';
import { isHex, normHex } from './color';
import { addCustomTheme, deleteCustomTheme, isInUse, modeLabel, saveCustomTheme, selectTheme } from './library';
import { copyTheme, MAX_NAME, themeFileName, themeToFile } from './model';
import { paletteFromColour } from './palette';
import { ThemePreview } from './ThemePreview';
import { deriveTokens, EDITOR_CONTROLS, EDITOR_GROUPS, SNAP_CONTROLS, switchSnapMode, type ThemeMode, type ThemeTokens } from './tokens';

interface Snap {
  tokens: ThemeTokens;
  mode: ThemeMode;
}

/** Saves a file through the page (no main process): a download of the text. */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Holds the dialog out of the way while something is pressed, so the app behind shows in full. */
function PeekButton() {
  const stop = () => {
    delete document.documentElement.dataset.themePeek;
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('blur', stop);
  };
  const start = () => {
    document.documentElement.dataset.themePeek = '';
    window.addEventListener('pointerup', stop);
    window.addEventListener('blur', stop);
  };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      className="ui-btn ui-btn-small"
      title="Hold this down to see the whole app"
      onPointerDown={start}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop();
      }}
    >
      <Icon name="eye" size={14} />
      Hold to peek
    </button>
  );
}

function ColourRow({ token, label, hint, value, warnings, onChange, onFix }: { token: string; label: string; hint: string; value: string; warnings: string[]; onChange: (v: string) => void; onFix?: () => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="th-row">
      <label className="th-swatch" title={`Pick a colour for ${label.toLowerCase()}`}>
        <input type="color" value={normHex(value)} aria-label={label} onChange={(e) => onChange(e.target.value)} />
        <span style={{ background: value }} />
      </label>
      <div className="th-row-text">
        <strong>{label}</strong>
        <span>{hint}</span>
        {warnings.map((w) => (
          <em key={w} className="th-warn">
            <Icon name="warning" size={13} />
            {w}
          </em>
        ))}
        {onFix && warnings.length > 0 && (
          <button type="button" className="ui-btn ui-btn-small th-fix" onClick={onFix}>
            Make it easier to read
          </button>
        )}
      </div>
      <input
        className="th-hex"
        type="text"
        spellCheck={false}
        maxLength={7}
        aria-label={`${label}, as a colour code`}
        value={text}
        onChange={(e) => {
          const v = e.target.value.startsWith('#') || e.target.value === '' ? e.target.value : '#' + e.target.value;
          setText(v);
          if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
        }}
        onBlur={() => setText(value)}
        data-token={token}
      />
    </div>
  );
}

export function ThemeEditor({ id, onDone, onOpen }: { id: string; onDone: () => void; onOpen: (id: string) => void }) {
  const theme = usePrefs((p) => p.customThemes.find((t) => t.id === id));
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [seed, setSeed] = useState('#6c8cff');
  const [seedMode, setSeedMode] = useState<ThemeMode>(theme?.mode ?? 'dark');
  const last = useRef<{ token: string; at: number } | null>(null);
  const opened = useRef<Snap | null>(null);
  if (theme && !opened.current) opened.current = { tokens: theme.tokens, mode: theme.mode };

  // Show the theme being edited on the whole app, and go back to the real pick when leaving.
  useEffect(() => {
    if (theme) setThemePreview(theme);
  }, [theme]);
  useEffect(() => () => setThemePreview(null), []);
  // The theme vanished (deleted elsewhere): nothing to edit.
  useEffect(() => {
    if (!theme) onDone();
  }, [theme, onDone]);

  const results = useMemo(() => (theme ? checkContrast(theme.tokens) : []), [theme]);
  if (!theme) return null;
  const bad = results.filter((r) => r.level !== 'good');
  const base = theme.basedOn ? getBuiltIn(theme.basedOn) : undefined;

  const commit = (next: Snap, coalesceKey?: string) => {
    const now = Date.now();
    const same = coalesceKey && last.current && last.current.token === coalesceKey && now - last.current.at < 900;
    last.current = coalesceKey ? { token: coalesceKey, at: now } : null;
    if (!same) setPast((p) => [...p.slice(-49), { tokens: theme.tokens, mode: theme.mode }]);
    setFuture([]);
    saveCustomTheme({ ...theme, tokens: next.tokens, mode: next.mode });
  };

  const setToken = (token: string, value: string) => {
    if (!isHex(value) || value === theme.tokens[token]) return;
    const v = normHex(value);
    commit({ tokens: deriveTokens({ ...theme.tokens, [token]: v }, theme.mode, [token]), mode: theme.mode }, token);
  };

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    last.current = null;
    setPast(past.slice(0, -1));
    setFuture((f) => [...f, { tokens: theme.tokens, mode: theme.mode }]);
    saveCustomTheme({ ...theme, tokens: prev.tokens, mode: prev.mode });
  };
  const redo = () => {
    const next = future[future.length - 1];
    if (!next) return;
    last.current = null;
    setFuture(future.slice(0, -1));
    setPast((p) => [...p, { tokens: theme.tokens, mode: theme.mode }]);
    saveCustomTheme({ ...theme, tokens: next.tokens, mode: next.mode });
  };

  const fixAll = () => {
    const tokens = { ...theme.tokens };
    const changed = new Set<string>();
    for (const r of bad) {
      // Words get nudged, never the background they sit on. Do the biggest problems first so they stick.
      const v = fixPair(tokens, r);
      if (v !== tokens[r.fg]) {
        tokens[r.fg] = v;
        changed.add(r.fg);
      }
    }
    if (changed.size) commit({ tokens: deriveTokens(tokens, theme.mode, changed), mode: theme.mode });
  };

  const reset = () => {
    const src = base?.mode === theme.mode ? base.tokens : opened.current!.tokens;
    commit({ tokens: { ...src }, mode: theme.mode });
    toast(base ? `Back to how ${base.name} started.` : 'Back to how it was when you opened it.');
  };

  const duplicate = () => {
    const copy = copyTheme(theme, getPrefs().customThemes);
    if (addCustomTheme(copy)) {
      toast(`Made "${copy.name}".`);
      onOpen(copy.id);
    } else toast('You have a lot of themes already. Delete one to make room.', { kind: 'warn' });
  };

  const mode = theme.mode;
  const inUse = isInUse(theme);

  return (
    <div className="th-editor">
      <div className="th-editor-top">
        <button type="button" className="ui-btn ui-btn-small" onClick={onDone}>
          <Icon name="prev" size={14} />
          All themes
        </button>
        <input
          className="th-name"
          type="text"
          maxLength={MAX_NAME}
          aria-label="Theme name"
          value={theme.name}
          placeholder="Name your theme"
          onChange={(e) => saveCustomTheme({ ...theme, name: e.target.value })}
          onBlur={(e) => {
            if (!e.target.value.trim()) saveCustomTheme({ ...theme, name: 'My theme' });
          }}
        />
      </div>

      <div className="th-editor-grid">
        <aside className="th-editor-side">
          <ThemePreview theme={theme} className="th-prev-big" />
          <div className="th-side-actions">
            <PeekButton />
            <button type="button" className={`ui-btn ui-btn-small${inUse ? '' : ' ui-btn-primary'}`} disabled={inUse} onClick={() => selectTheme(theme)}>
              {inUse ? (
                <>
                  <Icon name="check" size={14} />
                  In use for {modeLabel(mode)}
                </>
              ) : (
                `Use for ${modeLabel(mode)}`
              )}
            </button>
          </div>
          <div className="th-mode">
            <span>This theme is for</span>
            <div className="ui-segmented" role="radiogroup" aria-label="Dark or light">
              {(['dark', 'light'] as ThemeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className={`ui-seg${mode === m ? ' is-chosen' : ''}`}
                  onClick={() => {
                    if (m === mode) return;
                    // Shadows and hover shades work differently in dark and light, so they're worked out again.
                    commit({ tokens: deriveTokens(switchSnapMode(theme.tokens, mode, m), m), mode: m });
                  }}
                >
                  <Icon name={m === 'dark' ? 'moon' : 'sun'} size={14} />
                  {m === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          </div>
          <div className="th-tools">
            <button type="button" className="ui-btn ui-btn-small" onClick={undo} disabled={!past.length} title="Undo the last colour change">
              <Icon name="undo" size={14} />
              Undo
            </button>
            <button type="button" className="ui-btn ui-btn-small" onClick={redo} disabled={!future.length} title="Put back what you undid">
              <Icon name="redo" size={14} />
              Redo
            </button>
            <button type="button" className="ui-btn ui-btn-small" onClick={reset} title={base ? `Go back to ${base.name}` : 'Go back to how it was when you opened it'}>
              Reset
            </button>
            <button type="button" className="ui-btn ui-btn-small" onClick={duplicate}>
              <Icon name="duplicate" size={14} />
              Duplicate
            </button>
            <button type="button" className="ui-btn ui-btn-small" onClick={() => downloadText(themeFileName(theme), themeToFile(theme))} title="Save this theme as a small file to share or keep">
              <Icon name="export" size={14} />
              Export
            </button>
            {confirmDelete ? (
              <button type="button" className="ui-btn ui-btn-small th-danger" onClick={() => deleteCustomTheme(theme.id)} onBlur={() => setConfirmDelete(false)} autoFocus>
                Really delete?
              </button>
            ) : (
              <button type="button" className="ui-btn ui-btn-small" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={14} />
                Delete
              </button>
            )}
          </div>
        </aside>

        <div className="th-editor-main">
          <section className="th-helper" aria-label="Start from a colour">
            <h4>Start from a colour</h4>
            <p>Pick one colour you like and Frameling works out a whole set to go with it. You can undo it, and change anything after.</p>
            <div className="th-helper-row">
              <label className="th-swatch" title="Pick your colour">
                <input type="color" value={normHex(seed)} aria-label="Colour to start from" onChange={(e) => setSeed(e.target.value)} />
                <span style={{ background: seed }} />
              </label>
              <div className="ui-segmented" role="radiogroup" aria-label="Dark or light palette">
                {(['dark', 'light'] as ThemeMode[]).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={seedMode === m} className={`ui-seg${seedMode === m ? ' is-chosen' : ''}`} onClick={() => setSeedMode(m)}>
                    <Icon name={m === 'dark' ? 'moon' : 'sun'} size={14} />
                    {m === 'dark' ? 'Dark' : 'Light'}
                  </button>
                ))}
              </div>
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => commit({ tokens: paletteFromColour(seed, seedMode), mode: seedMode })}>
                <Icon name="palette" size={14} />
                Make my palette
              </button>
            </div>
          </section>

          <section className={`th-check${bad.length ? ' has-problems' : ''}`} aria-live="polite">
            {bad.length === 0 ? (
              <p>
                <Icon name="check" size={14} /> Everything looks easy to read.
              </p>
            ) : (
              <>
                <p>
                  <Icon name="warning" size={14} /> {bad.length === 1 ? '1 thing may be hard to read or see.' : `${bad.length} things may be hard to read or see.`}
                </p>
                <button type="button" className="ui-btn ui-btn-small" onClick={fixAll}>
                  Fix them for me
                </button>
              </>
            )}
          </section>

          {EDITOR_GROUPS.map((g) => (
            <section key={g.id} className="th-group" aria-label={g.label}>
              <h4>{g.label}</h4>
              <p className="th-group-hint">{g.hint}</p>
              {[...EDITOR_CONTROLS, ...SNAP_CONTROLS].filter((c) => c.group === g.id).map((c) => {
                const probs = problemsFor(theme.tokens, c.token);
                const fixable = probs.find((r) => r.fg === c.token);
                return (
                  <ColourRow
                    key={c.token}
                    token={c.token}
                    label={c.label}
                    hint={c.hint}
                    value={theme.tokens[c.token]}
                    warnings={probs.map((r) => r.message)}
                    onChange={(v) => setToken(c.token, v)}
                    onFix={fixable ? () => setToken(c.token, fixPair(theme.tokens, fixable)) : undefined}
                  />
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

