import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { allCommands, type Command } from '../core/registry';
import { applyWorkspace, currentWorkspace, deleteWorkspace, dock, listWorkspaces, renameWorkspace, resetLayout, saveWorkspace } from './dock';
import { isStaleCommand, syncDynamicCommands } from './dynamic';
import { Icon } from './icons';
import { QuillEmpty } from './mascot';
import { addBinding, allConflicts, comboFromEvent, comboToString, conflictsFor, effectiveKeys, removeBinding, resetBindings, setBindings } from './keys';
import { holdKeyboard } from './keyboard';
import { Keys } from './ShortcutChip';
import { wordsOf } from './match';
import { Modal } from './Modal';
import { closePrefs, overlays, type PrefsPage } from './overlays';
import { setPrefs, usePrefs, type LookPref, type ThemePref } from './prefs';
import { toast } from './toast';
import { BehaviourPage } from './ChoiceDialog';
import { ThemesPage } from './themes/ThemesPage';
import { UNITS, type Unit } from '../core/units';

// The Themes page is local to this file for now (overlays.ts decides which pages can be opened from outside).
type Page = PrefsPage;

const PAGES: { id: Page; label: string; icon: string; help: string }[] = [
  { id: 'general', label: 'General', icon: 'settings', help: 'look-and-feel' },
  { id: 'themes', label: 'Themes', icon: 'palette', help: 'themes' },
  { id: 'behaviour', label: 'Behaviour', icon: 'sliders', help: 'behaviour' },
  { id: 'keyboard', label: 'Keyboard', icon: 'keyboard', help: 'keyboard-shortcuts' },
  { id: 'workspaces', label: 'Workspaces', icon: 'workspace', help: 'workspaces' },
];

export function PrefsModal() {
  const state = overlays.use((o) => o.prefs);
  if (!state) return null;
  return <Prefs page={state.page} commandId={state.commandId} />;
}

function Prefs({ page, commandId }: { page: PrefsPage; commandId?: string }) {
  const [current, setCurrent] = useState<Page>(page);
  const active = PAGES.find((p) => p.id === current)!;
  return (
    <Modal title="Preferences" size="lg" className="ui-prefs" onClose={closePrefs}>
      <div className="ui-prefs-body">
        <nav className="ui-prefs-nav" aria-label="Preference pages">
          {PAGES.map((p) => (
            <button key={p.id} type="button" className={`ui-prefs-tab${current === p.id ? ' is-chosen' : ''}`} aria-current={current === p.id ? 'page' : undefined} onClick={() => setCurrent(p.id)}>
              <Icon name={p.icon} size={16} />
              {p.label}
            </button>
          ))}
        </nav>
        <div className="ui-prefs-page" data-help={active.help}>
          {current === 'general' && <GeneralPage onThemes={() => setCurrent('themes')} />}
          {current === 'themes' && <ThemesPage />}
          {current === 'behaviour' && <BehaviourPage />}
          {current === 'keyboard' && <KeyboardPage focusId={commandId} />}
          {current === 'workspaces' && <WorkspacesPage />}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- pieces

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="ui-pref-row">
      <div className="ui-pref-text">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="ui-pref-control">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ui-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={`ui-seg${value === o.id ? ' is-chosen' : ''}`} onClick={() => onChange(o.id)}>
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ui-switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="ui-switch-knob" />
    </button>
  );
}

// ---------------------------------------------------------------- general

function GeneralPage({ onThemes }: { onThemes: () => void }) {
  const p = usePrefs((x) => x);
  return (
    <>
      <h3>General</h3>
      <Row label="Mode" hint="System follows your computer, and uses your dark and light themes to match.">
        <Segmented<ThemePref>
          label="Mode"
          value={p.theme}
          onChange={(theme) => setPrefs({ theme })}
          options={[
            { id: 'system', label: 'System', icon: 'settings' },
            { id: 'dark', label: 'Dark', icon: 'moon' },
            { id: 'light', label: 'Light', icon: 'sun' },
          ]}
        />
      </Row>
      <Row label="Theme" hint="Pick a theme for dark mode and one for light mode, or make your own.">
        <button type="button" className="ui-btn" onClick={onThemes}>
          <Icon name="palette" size={14} />
          Choose themes...
        </button>
      </Row>
      <Row label="Look" hint="Cosy is soft and rounded. Crisp is tighter and sharper.">
        <Segmented<LookPref>
          label="Look"
          value={p.look}
          onChange={(look) => setPrefs({ look })}
          options={[
            { id: 'cosy', label: 'Cosy', icon: 'heart' },
            { id: 'crisp', label: 'Crisp', icon: 'grid' },
          ]}
        />
      </Row>
      <Row label="Units" hint="How sizes are shown. Pixels suit screens and games; mm, cm, inches and points suit print.">
        <Segmented<Unit> label="Units" value={p.units} onChange={(units) => setPrefs({ units })} options={UNITS.map((u) => ({ id: u.id, label: u.id }))} />
      </Row>
      <Row label="Sounds" hint="Little sound effects. They aren't here yet, but your choice is remembered.">
        <Switch label="Sounds" on={p.sounds} onChange={(sounds) => setPrefs({ sounds })} />
      </Row>
      <Row label="Reduce motion" hint="Stops the bouncing and fading. Frameling also does this when your computer asks for calm.">
        <Switch label="Reduce motion" on={p.reduceMotion} onChange={(reduceMotion) => setPrefs({ reduceMotion })} />
      </Row>
      <Row label="Welcome sheet" hint="Show the start page when Frameling opens.">
        <Switch label="Welcome sheet" on={p.showWelcome} onChange={(showWelcome) => setPrefs({ showWelcome })} />
      </Row>
      <Row label="Tips" hint="A friendly tip in the status bar.">
        <Switch label="Tips" on={p.showTips} onChange={(showTips) => setPrefs({ showTips })} />
      </Row>
      <Row label="Show Quill" hint="Quill the hedgehog shows you round and cheers you on. Off hides him; his words still show.">
        <Switch label="Show Quill" on={p.showQuill} onChange={(showQuill) => setPrefs({ showQuill })} />
      </Row>
      <Row label="Fade tile copies" hint="In tile mode, fade the copies round the tile you're drawing so it stands out. Off shows them exactly as a game would.">
        <Switch label="Fade tile copies" on={p.fadeTileCopies} onChange={(fadeTileCopies) => setPrefs({ fadeTileCopies })} />
      </Row>
    </>
  );
}

// ---------------------------------------------------------------- keyboard

interface Recording {
  id: string;
  /** Replace all of the command's shortcuts, or add one more. */
  add: boolean;
}

interface Clash {
  id: string;
  combo: string;
  others: Command[];
  add: boolean;
}

function KeyboardPage({ focusId }: { focusId?: string }) {
  syncDynamicCommands();
  const keymap = usePrefs((p) => p.keymap);
  const [query, setQuery] = useState('');
  const [rec, setRec] = useState<Recording | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);
  const commands = allCommands().filter((c) => !isStaleCommand(c.id));
  const conflicts = useMemo(() => allConflicts(commands, keymap), [commands.length, keymap]);
  const listRef = useRef<HTMLDivElement>(null);

  // Wait for a key. Everything goes to the recorder, nothing reaches the shortcut handler.
  useEffect(() => {
    if (!rec) return;
    const release = holdKeyboard();
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setRec(null);
      const c = comboFromEvent(e);
      if (!c) return;
      const combo = comboToString(c);
      if (combo === 'Space') return void (setRec(null), toast('Space is kept for moving the canvas around, so it cannot be a shortcut.', { kind: 'info' }));
      const cmd = commands.find((x) => x.id === rec.id);
      setRec(null);
      if (!cmd) return;
      const others = conflictsFor(combo, cmd.id, commands);
      if (others.length) return setClash({ id: cmd.id, combo, others, add: rec.add });
      if (rec.add) addBinding(cmd, combo, commands);
      else setBindings(cmd, [combo]);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  useEffect(() => {
    if (focusId) listRef.current?.querySelector(`[data-cmd="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: 'center' });
  }, [focusId]);

  const words = wordsOf(query);
  const shown = commands.filter((c) => {
    if (!words.length) return true;
    const hay = `${c.label} ${c.category} ${c.id} ${(c.keywords ?? []).join(' ')} ${effectiveKeys(c).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const groups = new Map<string, Command[]>();
  for (const c of shown) (groups.get(c.category) ?? groups.set(c.category, []).get(c.category)!).push(c);
  const cats = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const anyOverride = Object.keys(keymap).length > 0;

  return (
    <>
      <h3>Keyboard</h3>
      <div className="ui-keyboard-top">
        <div className="ui-help-search">
          <Icon name="search" size={15} />
          <input type="search" aria-label="Search shortcuts" placeholder="Search commands or keys" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
        </div>
        <button type="button" className="ui-btn" disabled={!anyOverride} onClick={() => (resetBindings(), toast('All shortcuts are back to how they came.', { kind: 'success' }))}>
          Reset all
        </button>
      </div>
      {conflicts.size > 0 && (
        <p className="ui-warn-line">
          <Icon name="warning" size={15} />
          {conflicts.size === 1 ? 'One shortcut is used twice.' : `${conflicts.size} shortcuts are used twice.`} Look for the warning marks.
        </p>
      )}
      {clash && (
        <div className="ui-confirm" role="alertdialog" aria-label="Shortcut already used">
          <Icon name="warning" size={18} />
          <span>
            <Keys shortcut={clash.combo} /> is already used by {clash.others.map((c) => c.label).join(', ')}.
          </span>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => {
              const cmd = commands.find((c) => c.id === clash.id);
              if (cmd) {
                if (clash.add) addBinding(cmd, clash.combo, commands, true);
                else {
                  for (const o of clash.others) removeBinding(o, clash.combo);
                  setBindings(cmd, [clash.combo]);
                }
              }
              setClash(null);
            }}
          >
            Take it
          </button>
          <button type="button" className="ui-btn" onClick={() => setClash(null)}>
            Cancel
          </button>
        </div>
      )}
      <div className="ui-keymap" ref={listRef}>
        {cats.map((cat) => (
          <section key={cat}>
            <h4>{cat}</h4>
            {groups.get(cat)!.map((c) => {
              const keys = effectiveKeys(c);
              const changed = keymap[c.id] !== undefined;
              const clashing = keys.filter((k) => conflicts.has(k));
              const recording = rec?.id === c.id;
              return (
                <div key={c.id} className={`ui-keyrow${focusId === c.id ? ' is-focus' : ''}`} data-cmd={c.id}>
                  <div className="ui-keyrow-name">
                    <span>{c.label}</span>
                    {clashing.length > 0 && (
                      <span className="ui-clash" role="img" aria-label="This shortcut is used by something else too" data-tip="Another command uses the same keys">
                        <Icon name="warning" size={14} />
                      </span>
                    )}
                  </div>
                  <div className="ui-keyrow-keys">
                    {recording ? (
                      <span className="ui-recording" role="status">
                        Press the keys... <small>Esc to cancel</small>
                      </span>
                    ) : (
                      <>
                        {keys.map((k) => (
                          <span key={k} className={`ui-chip${conflicts.has(k) ? ' is-clash' : ''}`}>
                            <Keys shortcut={k} />
                            <button type="button" className="ui-chip-x" aria-label={`Remove ${k} from ${c.label}`} onClick={() => removeBinding(c, k)}>
                              <Icon name="close" size={11} />
                            </button>
                          </span>
                        ))}
                        {!keys.length && <span className="ui-none">None</span>}
                      </>
                    )}
                  </div>
                  <div className="ui-keyrow-act">
                    <button type="button" className="ui-btn ui-btn-small" aria-label={`${keys.length ? 'Add a shortcut to' : 'Set a shortcut for'} ${c.label}`} onClick={() => (setClash(null), setRec({ id: c.id, add: keys.length > 0 }))}>
                      {keys.length ? 'Add' : 'Set'}
                    </button>
                    {keys.length > 0 && (
                      <button type="button" className="ui-btn ui-btn-small" aria-label={`Change the shortcut for ${c.label}`} onClick={() => (setClash(null), setRec({ id: c.id, add: false }))}>
                        Change
                      </button>
                    )}
                    {changed && (
                      <button type="button" className="ui-btn ui-btn-small ui-btn-quiet" aria-label={`Reset ${c.label} to its default`} onClick={() => resetBindings(c.id)}>
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        {!cats.length && (
          <QuillEmpty anim={[{ anim: 'think', hold: 2400 }, { anim: 'idle' }]} size={96} className="ui-help-empty">
            No commands match that.
          </QuillEmpty>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- workspaces

function WorkspacesPage() {
  dock.use((d) => d);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const list = listWorkspaces();
  const now = currentWorkspace();

  const save = () => {
    const ws = saveWorkspace(name);
    if (!ws) return;
    setName('');
    toast(`Saved "${ws.name}". Find it in the View menu.`, { kind: 'success' });
  };

  return (
    <>
      <h3>Workspaces</h3>
      <p className="ui-pref-intro">A workspace is a way of arranging your panels. Switch between them any time.</p>
      <ul className="ui-ws-list">
        {list.map((w) => (
          <li key={w.id} className={`ui-ws${now?.id === w.id ? ' is-chosen' : ''}`}>
            <Icon name={w.builtin ? 'workspace' : 'heart'} size={16} />
            {editing === w.id ? (
              <input
                className="ui-ws-edit"
                aria-label="Workspace name"
                value={draft}
                autoFocus
                maxLength={40}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => (renameWorkspace(w.id, draft), setEditing(null))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (renameWorkspace(w.id, draft), setEditing(null));
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditing(null);
                  }
                }}
              />
            ) : (
              <span className="ui-ws-name">{w.name}</span>
            )}
            {w.builtin && <span className="ui-tag">Comes with Frameling</span>}
            {now?.id === w.id && <span className="ui-tag ui-tag-on">In use</span>}
            <span className="ui-status-spacer" />
            {now?.id !== w.id && (
              <button type="button" className="ui-btn ui-btn-small" onClick={() => applyWorkspace(w.id)}>
                Use
              </button>
            )}
            {!w.builtin && (
              <>
                <button type="button" className="ui-btn ui-btn-small" onClick={() => (setDraft(w.name), setEditing(w.id))}>
                  Rename
                </button>
                <button type="button" className="ui-btn ui-btn-small" onClick={() => (saveWorkspace(w.name), toast(`Updated "${w.name}" to the layout you have now.`, { kind: 'success' }))}>
                  Update
                </button>
                <button type="button" className="ui-icon-btn" aria-label={`Delete ${w.name}`} data-tip={`Delete ${w.name}`} onClick={() => deleteWorkspace(w.id)}>
                  <Icon name="trash" size={15} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="ui-ws-save"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="ui-field ui-field-wide">
          <span>Save the layout you have now as</span>
          <input type="text" placeholder="My cosy corner" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="ui-btn ui-btn-primary" disabled={!name.trim()}>
          Save
        </button>
      </form>
      <div className="ui-pref-foot">
        <button type="button" className="ui-btn" onClick={() => (resetLayout(), toast('Panels are back where they started.', { kind: 'success' }))}>
          Reset layout
        </button>
        <span>Puts the panels back to how the workspace in use began.</span>
      </div>
    </>
  );
}

