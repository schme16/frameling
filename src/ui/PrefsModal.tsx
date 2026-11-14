import { line } from './mascot/lines';
import type { SwitcherLook } from './switcherModel';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { allCommands, type Command } from '../core/registry';
import { WorkspacesPage } from './WorkspacesPage';
import { isStaleCommand, syncDynamicCommands } from './dynamic';
import { Icon } from './icons';
import { QuillEmpty, setShowQuill } from './mascot';
import { addBinding, allConflicts, comboFromEvent, comboToString, conflictsFor, effectiveKeys, layeredOverrides, removeBinding, resetBindings, setBindings } from './keys';
import { HISTORY_STEPS_RANGE } from '../core/store';
import { KEYMAP_SETS, keymapSet } from './keymapSets';
import { previewCue, type SoundCue } from './sounds';
import { clampOutline, MAX_OUTLINE, MIN_OUTLINE } from '../pixel/thick';

// The Try button: every sound once, a moment apart.
const TRY: SoundCue[] = ['step', 'exported', 'refused', 'nothingToUndo', 'tick', 'goodbye', 'celebrate'];
function playAll(): void {
  TRY.forEach((c, i) => setTimeout(() => previewCue(c), i * 900));
}
import { holdKeyboard } from './keyboard';
import { Keys } from './ShortcutChip';
import { wordsOf } from './match';
import { Modal } from './Modal';
import { closePrefs, overlays, type PrefsPage } from './overlays';
import { setPrefs, UI_SCALE_RANGE, usePrefs, type LookPref, type ThemePref } from './prefs';
import { toast } from './toast';
import { applySettings, pickSettingsFile, saveSettingsFile } from './settingsFile';
import { BehaviourPage } from './ChoiceDialog';
import { ThemesPage } from './themes/ThemesPage';
import { PluginsPage } from '../plugins/PluginsPage';
import { FeaturesPage } from '../features/FeaturesPage';
import { UNITS, type Unit } from '../core/units';
import { SnapPanel } from '../canvas/SnapOptions';
import { PenPage } from '../tablet/PenPage';
import { DiagnosticsPage } from '../tablet/check/DiagnosticsPage';

// The Themes page is local to this file for now (overlays.ts decides which pages can be opened from outside).
type Page = PrefsPage;

const PAGES: { id: Page; label: string; icon: string; help: string }[] = [
  { id: 'general', label: 'General', icon: 'settings', help: 'look-and-feel' },
  { id: 'themes', label: 'Themes', icon: 'palette', help: 'themes' },
  { id: 'behaviour', label: 'Behaviour', icon: 'sliders', help: 'behaviour' },
  { id: 'keyboard', label: 'Keyboard', icon: 'keyboard', help: 'keyboard-shortcuts' },
  { id: 'snapping', label: 'Snapping', icon: 'magnet', help: 'snapping' },
  { id: 'pen', label: 'Pen and tablet', icon: 'pen', help: 'pen-tablet' },
  { id: 'workspaces', label: 'Workspaces', icon: 'workspace', help: 'workspaces' },
  { id: 'plugins', label: 'Plugins', icon: 'plugin', help: 'plugins' },
  { id: 'features', label: 'Features', icon: 'grid', help: 'features' },
  { id: 'diagnostics', label: 'Diagnostics', icon: 'info', help: 'pen-check' },
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
          {current === 'snapping' && <SnappingPage />}
          {current === 'pen' && <PenPage />}
          {current === 'diagnostics' && <DiagnosticsPage />}
          {current === 'workspaces' && <WorkspacesPage />}
          {current === 'plugins' && <PluginsPage />}
          {current === 'features' && <FeaturesPage />}
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

// ---------------------------------------------------------------- snapping

function SnappingPage() {
  return (
    <>
      <h3>Snapping</h3>
      <p className="ui-pref-intro">Pick what shapes jump onto when they get close. The Snap button at the bottom of the window opens the same choices.</p>
      <SnapPanel wide />
    </>
  );
}

// ---------------------------------------------------------------- general

async function backUpSettings(): Promise<void> {
  const r = await saveSettingsFile();
  if (r === 'saved') toast('Your settings are saved.', { kind: 'success' });
  else if (r === 'failed') toast('That file could not be saved.', { kind: 'error' });
}

/** Puts a backup back and starts Frameling again, so every part reads the restored settings. */
async function restoreSettings(): Promise<void> {
  const r = await pickSettingsFile();
  if (!r) return;
  if (!r.ok) return void toast(r.why, { kind: 'error' });
  const n = applySettings(r.file);
  if (!n) return void toast('Those settings could not be put back.', { kind: 'error' });
  toast('Your settings are back. Frameling is starting again.', { kind: 'success' });
  setTimeout(() => location.reload(), 900);
}

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
      <Row label="Textures" hint="The faint pattern some themes scatter round the page: strawberry seeds, camo, sock stripes and paw prints. Off leaves the area around your drawing plain.">
        <Switch label="Textures" on={p.showTextures} onChange={(showTextures) => setPrefs({ showTextures })} />
      </Row>
      <Row label="Clean timeline" hint="Off shows the detailed timeline: keys as diamonds, tweens with their easing, and rows for what changes on each layer. On shows one plain block per drawing.">
        <Switch label="Clean timeline" on={p.cleanTimeline} onChange={(cleanTimeline) => setPrefs({ cleanTimeline })} />
      </Row>
      <Row label="Interface size" hint="How big everything is drawn: menus, panels, the timeline and the page itself. Handy on a big, dense screen like a 4k drawing tablet, where the usual size can be hard to read. Quill offers a size on a screen like that, and again on each new screen you drag the window to.">
        <div className="ui-pref-volume">
          <input
            type="range"
            className="cv-slider"
            min={UI_SCALE_RANGE.min * 100}
            max={UI_SCALE_RANGE.max * 100}
            step={UI_SCALE_RANGE.step * 100}
            value={Math.round(p.uiScale * 100)}
            aria-label="Interface size"
            onChange={(e) => setPrefs({ uiScale: Number(e.target.value) / 100 })}
          />
          <span className="ui-pref-value">{Math.round(p.uiScale * 100)}%</span>
          {p.uiScale !== 1 && (
            <button type="button" className="ui-btn ui-btn-small" onClick={() => setPrefs({ uiScale: 1 })}>
              Usual size
            </button>
          )}
        </div>
      </Row>
      <Row label="Undo steps" hint="How many steps Frameling keeps so you can undo them. A long history of pixel art gets heavy, so it stops growing once it is holding a lot, keeping the newest steps.">
        <div className="ui-pref-volume">
          <input
            type="range"
            className="cv-slider"
            min={HISTORY_STEPS_RANGE.min}
            max={HISTORY_STEPS_RANGE.max}
            step={10}
            value={p.historySteps}
            aria-label="Undo steps"
            onChange={(e) => setPrefs({ historySteps: Number(e.target.value) })}
          />
          <span className="ui-pref-value">{p.historySteps}</span>
        </div>
      </Row>
      <Row label="Units" hint="How sizes are shown. Pixels suit screens and games; mm, cm, inches and points suit print.">
        <Segmented<Unit> label="Units" value={p.units} onChange={(units) => setPrefs({ units })} options={UNITS.map((u) => ({ id: u.id, label: u.id }))} />
      </Row>
      <Row label="Sounds" hint="Soft little sounds: a quest step done, an export finished, a no. Turn them off here if you like it quiet.">
        <Switch
          label="Sounds"
          on={p.sounds}
          onChange={(sounds) => {
            setPrefs({ sounds });
            if (sounds) previewCue('step');
          }}
        />
      </Row>
      {p.sounds && (
        <Row label="Volume" hint="How loud the sounds are. Press Try to hear them.">
          <div className="ui-pref-volume">
            <input type="range" className="cv-slider" min={0} max={100} step={5} value={Math.round(p.soundVolume * 100)} aria-label="Sound volume" onChange={(e) => setPrefs({ soundVolume: Number(e.target.value) / 100 })} onPointerUp={() => previewCue('step')} />
            <button type="button" className="ui-btn ui-btn-small" onClick={() => playAll()}>
              Try
            </button>
          </div>
        </Row>
      )}
      <Row label="Reduce motion" hint="Stops the bouncing and fading. Frameling also does this when your computer asks for calm.">
        <Switch label="Reduce motion" on={p.reduceMotion} onChange={(reduceMotion) => setPrefs({ reduceMotion })} />
      </Row>
      <Row label="Welcome sheet" hint="Show the start page when Frameling opens.">
        <Switch label="Welcome sheet" on={p.showWelcome} onChange={(showWelcome) => setPrefs({ showWelcome })} />
      </Row>
      <Row label="Tips" hint="A friendly tip in the status bar.">
        <Switch label="Tips" on={p.showTips} onChange={(showTips) => setPrefs({ showTips })} />
      </Row>
      <Row label="Workspace switcher" hint="Which workspace you are in, beside the drawing's name. Tabs show them all at once, Chip shows just the one you are in, and Hidden leaves it to the View menu. A narrow window uses the chip.">
        <Segmented<SwitcherLook>
          label="Workspace switcher"
          value={p.workspaceSwitcher}
          onChange={(workspaceSwitcher) => setPrefs({ workspaceSwitcher })}
          options={[
            { id: 'tabs', label: 'Tabs' },
            { id: 'chip', label: 'Chip' },
            { id: 'off', label: 'Hidden' },
          ]}
        />
      </Row>
      <Row label="Right side" hint="Properties shows the settings for what you're doing, with the other panels on a labelled rail. Rail puts every panel on the rail. Tabs is the older row of tabs.">
        <Segmented<'inspector' | 'rail' | 'tabs'>
          label="Right side"
          value={p.rightSide}
          onChange={(rightSide) => setPrefs({ rightSide })}
          options={[
            { id: 'inspector', label: 'Properties' },
            { id: 'rail', label: 'Rail' },
            { id: 'tabs', label: 'Tabs' },
          ]}
        />
      </Row>
      <Row label="Tool rail style" hint="Two wide shows every tool, two across, in groups you can drag around. Stacked shows one button per group; press and hold it, or right-click, for the rest.">
        <Segmented<'two' | 'stacked'>
          label="Tool rail style"
          value={p.toolRail}
          onChange={(toolRail) => setPrefs({ toolRail })}
          options={[
            { id: 'two', label: 'Two wide' },
            { id: 'stacked', label: 'Stacked' },
          ]}
        />
      </Row>
      <Row label="Tool group names" hint="Each group of tools gets its name above it. Turn them off for a slimmer rail. A group you made and never named is just a divider either way.">
        <Switch label="Tool group names" on={p.toolNames} onChange={(toolNames) => setPrefs({ toolNames })} />
      </Row>
      <Row label="Tool button size" hint="How big the buttons on the tool rail are. Change the tools, in the View menu, has this too.">
        <Segmented<'small' | 'medium' | 'large'>
          label="Tool button size"
          value={p.toolSize}
          onChange={(toolSize) => setPrefs({ toolSize })}
          options={[
            { id: 'small', label: 'Small' },
            { id: 'medium', label: 'Medium' },
            { id: 'large', label: 'Large' },
          ]}
        />
      </Row>
      <Row label="Tools that do not work here" hint="A tool that only works on vector layers has nothing to do on a pixel layer, and the other way round. Hide them leaves them off the rail, so it is shorter. Grey them out keeps every tool in its place.">
        <Segmented<'hide' | 'grey'>
          label="Tools that do not work here"
          value={p.toolsOffLayer}
          onChange={(toolsOffLayer) => setPrefs({ toolsOffLayer })}
          options={[
            { id: 'hide', label: 'Hide them' },
            { id: 'grey', label: 'Grey them out' },
          ]}
        />
      </Row>
      <Row label="Show Quill" hint="Quill the hedgehog shows you round and cheers you on. Off hides him; his words still show.">
        <Switch label="Show Quill" on={p.showQuill} onChange={setShowQuill} />
      </Row>
      <Row label="Fade tile copies" hint="In tile mode, fade the copies round the tile you're drawing so it stands out. Off shows them exactly as a game would.">
        <Switch label="Fade tile copies" on={p.fadeTileCopies} onChange={(fadeTileCopies) => setPrefs({ fadeTileCopies })} />
      </Row>
      <Row label="Thicker pixel outlines" hint="Pixel shapes (rectangle, ellipse, line, polygon, star) get an outline thicker than one pixel. Off keeps the classic one pixel line.">
        <Switch label="Thicker pixel outlines" on={p.pixelThickOutlines} onChange={(pixelThickOutlines) => setPrefs({ pixelThickOutlines })} />
      </Row>
      <Row label="Your settings" hint="Everything you have set: themes, shortcuts, pen settings, workspaces and the answers you have given. Keep a copy, or put one back on another computer.">
        <div className="ui-pref-volume">
          <button type="button" className="ui-btn ui-btn-small" onClick={() => void backUpSettings()}>
            Back up...
          </button>
          <button type="button" className="ui-btn ui-btn-small" onClick={() => void restoreSettings()}>
            Put a backup back...
          </button>
        </div>
      </Row>
      {p.pixelThickOutlines && (
        <Row label="Outline thickness" hint="How many pixels thick the outline is. A filled shape keeps its fill; only the outline gets thicker.">
          <div className="ui-pref-volume">
            <input type="range" className="cv-slider" min={MIN_OUTLINE} max={MAX_OUTLINE} step={1} value={p.pixelOutlineWidth} aria-label="Outline thickness" onChange={(e) => setPrefs({ pixelOutlineWidth: clampOutline(Number(e.target.value)) })} />
            <span>{p.pixelOutlineWidth} px</span>
          </div>
        </Row>
      )}
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
  const setId = usePrefs((p) => p.keymapSet);
  const [query, setQuery] = useState('');
  const [rec, setRec] = useState<Recording | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);
  const live = allCommands().filter((c) => !isStaleCommand(c.id));
  // Commands the lists leave out still hold keys, so they still count for clashes.
  const commands = live.filter((c) => !c.hidden);
  const conflicts = useMemo(() => allConflicts(live, layeredOverrides(setId, live, keymap)), [live.length, keymap, setId]);
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
      <Row label="Shortcut set" hint={`${keymapSet(setId).blurb} Your own changes stay on top of whichever set you pick.`}>
        <select
          className="ui-keyset"
          aria-label="Shortcut set"
          value={keymapSet(setId).id}
          onChange={(e) => {
            setPrefs({ keymapSet: e.target.value });
            toast(`Now using ${keymapSet(e.target.value).label} shortcuts.${anyOverride ? ' Your own changes are kept.' : ''}`, { kind: 'success' });
          }}
        >
          {KEYMAP_SETS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Row>
      <div className="ui-keyboard-top">
        <div className="ui-help-search">
          <Icon name="search" size={15} />
          <input type="search" aria-label="Search shortcuts" placeholder="Search commands or keys" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
        </div>
        <button type="button" className="ui-btn" disabled={!anyOverride} onClick={() => (resetBindings(), toast(setId === 'frameling' ? 'All shortcuts are back to how they came.' : `All shortcuts are back to the ${keymapSet(setId).label} set.`, { kind: 'success' }))}>
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
          <QuillEmpty anim={[{ anim: 'think', hold: 2400 }, { anim: 'idle' }]} size={96} className="ui-help-empty" whenHidden="No shortcuts match that.">
            {line('empty.shortcuts')}
          </QuillEmpty>
        )}
      </div>
    </>
  );
}

