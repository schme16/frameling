// Quill's first-run hello: who he is, what Frameling is for, what you'd like to make, your colours, a few settings,
// then a name for your first animation and off you go. Every step can be skipped. The steps live in flow.ts.
import { isFirstRun, markFirstRun } from './state';
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { getHelp } from '../../core/registry';
import { store } from '../../core/store';
import { askAboutUnsavedChanges } from '../../io/document';
import { applyWorkspace, showPanel } from '../dock';
import { Icon } from '../icons';
import { line, lineParts, lines } from '../mascot/lines';
import { playCue } from '../sounds';
import { goodbyeScript, GOODBYE_WORDS, Quill, useQuillShown, welcomeBackScript, WELCOME_BACK_WORDS, type Script } from '../mascot';
import { Modal } from '../Modal';
import { closeOnboarding, openHelp, openSheet, overlays } from '../overlays';
import { getPrefs, setPrefs, setThemePreview, usePrefs, type LookPref, type ThemePref } from '../prefs';
import { Segmented, Switch } from '../PrefsModal';
import { getQuest, questProgress, startQuest } from '../quests';
import { BUILT_IN_THEMES, type Theme } from '../themes/builtIn';
import { ThemePreview } from '../themes/ThemePreview';
import { toast } from '../toast';
import { getFeature, isFeatureOn } from '../../features/host';
import { offerTurnOnForWish } from '../../features/prompt';
import { useFeaturesVersion } from '../../features/use';
import { DOZE_MS, INTERESTS, isStrawberry, makeReaction, pickedButOff, planFor, reduceFlow, sillyName, startFlow, STEPS, stepIndex, strawberryFor, type FlowState, type StepId } from './flow';
import { bringBack, nameList, tuckAway, tuckPlan } from './tuck';
import './onboarding.css';

/** True while this is the automatic first-run showing (a skip then still opens the welcome sheet). */
export { markFirstRun } from './state';

export function OnboardingSheet() {
  const open = overlays.use((o) => !!o.onboarding);
  if (!open) return null;
  return <Flow />;
}

const TITLES: Record<StepId, string> = {
  hello: 'Hello from Quill',
  make: 'What would you like to make?',
  themes: 'Pick your colours',
  prefs: 'A few handy settings',
  done: 'All set!',
};

/** True in a short window (about 760 px or less), where Quill and his bubbles are drawn smaller so they all fit. */
function useShortWindow(): boolean {
  const query = '(max-height: 760px)';
  const ask = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);
  const [short, setShort] = useState(() => !!ask()?.matches);
  useEffect(() => {
    const m = ask();
    if (!m) return;
    const on = () => setShort(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return short;
}

function Flow() {
  const short = useShortWindow();
  const [s, dispatch] = useReducer(reduceFlow, undefined, () => startFlow(sillyName()));
  // Show Quill switched on the settings step: a sad goodbye (he stays on screen until it's done), or a cheer.
  const [mood, setMood] = useState<{ kind: 'bye' | 'back'; n: number; playing: boolean } | null>(null);
  const byePlaying = mood?.kind === 'bye' && mood.playing;
  const quill = useQuillShown(byePlaying);
  const [dozing, setDozing] = useState<'awake' | 'asleep' | 'woke'>('awake');
  const [beat, setBeat] = useState(0);
  const p = usePrefs((x) => x);
  const themes = useMemo(() => [...BUILT_IN_THEMES, ...p.customThemes], [p.customThemes]);
  useFeaturesVersion();
  const plan = planFor(s.interests.filter(interestAvailable), questProgress.get().completed);
  const tuck = tuckPlan(s.interests);

  // Quill nods off when a step sits untouched, and wakes up a bit embarrassed.
  const lastPoke = useRef(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      if (Date.now() - lastPoke.current > DOZE_MS) setDozing((d) => (d === 'awake' ? 'asleep' : d));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  const poke = () => {
    lastPoke.current = Date.now();
    if (dozing === 'asleep') setDozing('woke');
  };
  useEffect(() => {
    lastPoke.current = Date.now();
    setDozing('awake');
    setBeat((b) => b + 1);
    setMood(null);
  }, [s.step]);
  const quillSwitched = (on: boolean) => {
    setPrefs({ showQuill: on });
    if (!on) playCue('goodbye');
    setMood((m) => ({ kind: on ? 'back' : 'bye', n: (m?.n ?? 0) + 1, playing: true }));
  };

  // Leaving the theme step (or the flow) drops any peek, so the real pick shows.
  useEffect(() => {
    if (s.step !== 'themes') setThemePreview(null);
  }, [s.step]);
  useEffect(() => () => setThemePreview(null), []);

  const end = (how: 'done' | 'skipped') => {
    setPrefs({ onboarded: true });
    setThemePreview(null);
    closeOnboarding();
    if (how === 'skipped') {
      toast(line('onboarding.skipped'), { kind: 'info' });
      if (isFirstRun() && getPrefs().showWelcome) openSheet('welcome');
    }
    markFirstRun(false);
  };

  const finish = async (go: 'quest' | 'template' | 'blank') => {
    applyWorkspace(plan.workspace);
    if (plan.panel) showPanel(plan.panel);
    const name = s.name.trim() || 'Untitled';
    // Put away the areas none of the picks need, and say how to get them back.
    const tucked = s.tuck ? tuckAway(tuck.ids) : [];
    end('done');
    if (tucked.length) {
      toast(line('onboarding.tucked', { names: nameList(tuck.names.filter((_, n) => tucked.includes(tuck.ids[n]))) }), {
        kind: 'info',
        duration: 12_000,
        action: { label: 'Bring them back', id: 'tuck-undo', run: () => bringBack(tucked) },
      });
    }
    // A blank pixel grid is Quill's pixel chooser: one picture, an animation, frames on boards or sprites on a sheet.
    if (go === 'blank' && plan.blank === 'blank-pixel') {
      const { openPixelChooser } = await import('../../pixel/Chooser');
      openPixelChooser();
      return;
    }
    if (go === 'template' || (go === 'blank' && plan.blank)) {
      const { findTemplate } = await import('../../templates');
      const t = findTemplate(go === 'blank' && plan.blank ? plan.blank : plan.template);
      if (!t || !(await askAboutUnsavedChanges())) return;
      const doc = t.make();
      doc.name = name;
      store().load(doc);
      toast(line('onboarding.ready', { name }), { kind: 'success' });
    } else if (go === 'quest') {
      renameWhenReady(name);
      startQuest(plan.quest);
    } else {
      renameWhenReady(name);
      toast(line('onboarding.ready', { name }), { kind: 'success' });
    }
  };

  const strawberry = { dark: strawberryFor(themes, 'dark'), light: strawberryFor(themes, 'light') };
  const pickedTheme = (mode: 'dark' | 'light') => themes.find((t) => t.id === (mode === 'dark' ? p.darkTheme : p.lightTheme));
  const loved = [pickedTheme('dark'), pickedTheme('light')].find((t) => isStrawberry(t));
  const lovesIt = !!loved;

  const say = sayFor(s, { strawberryName: loved?.name ?? strawberry.light?.name ?? strawberry.dark?.name ?? 'Strawberry', lovesIt, quillOn: p.showQuill, name: s.name, plan });
  const anim: Script = mood
    ? mood.kind === 'bye'
      ? goodbyeScript()
      : welcomeBackScript()
    : dozing === 'asleep'
      ? 'sleep'
      : dozing === 'woke'
        ? [{ anim: 'oops' }, { anim: 'idle' }]
        : animFor(s, lovesIt, beat);
  const words = mood
    ? mood.kind === 'bye'
      ? GOODBYE_WORDS.long
      : [WELCOME_BACK_WORDS]
    : dozing === 'asleep'
      ? lines('onboarding.doze.asleep')
      : dozing === 'woke'
        ? [...lines('onboarding.doze.woke'), ...say]
        : say;

  const i = stepIndex(s.step);
  const last = s.step === 'done';

  return (
    <Modal title={`Welcome to Frameling: ${TITLES[s.step]}`} size="lg" hideHeader className="ob ob-a" onClose={() => end('skipped')} initialFocus=".ob-next, .ob-go">
      <div className="ob-body" onPointerDown={poke} onKeyDown={poke}>
        <aside className={`ob-quill${quill ? '' : ' is-alone'}${short ? ' is-short' : ''}`}>
          <div className="ob-bubbles" aria-live="polite" key={`${s.step}-${dozing}-${mood?.n ?? 0}`}>
            {words.map((w, n) => (
              <p key={n} className="ob-bubble" style={{ animationDelay: `${n * 450}ms` }}>
                {w}
              </p>
            ))}
          </div>
          {quill && (
            <div className="ob-quill-stand">
              <Quill
                anim={anim}
                size={short ? 156 : 192}
                force={byePlaying}
                onDone={byePlaying ? () => setMood((m) => m && { ...m, playing: false }) : undefined}
              />
              {lovesIt && s.step === 'themes' && <Berry />}
            </div>
          )}
        </aside>

        <section className="ob-main">
          <h2 className="ob-title">{TITLES[s.step]}</h2>
          <div className="ob-step" key={s.step}>
            {s.step === 'hello' && <Hello />}
            {s.step === 'make' && <Make s={s} toggle={(interest) => dispatch({ type: 'toggle', interest })} />}
            {s.step === 'themes' && <Themes themes={themes} strawberry={strawberry} />}
            {s.step === 'prefs' && <Settings onQuill={quillSwitched} />}
            {s.step === 'done' && <Done s={s} plan={plan} tuck={tuck} setName={(name) => dispatch({ type: 'name', name })} setTuck={(on) => dispatch({ type: 'tuck', on })} go={(g) => void finish(g)} />}
          </div>
        </section>
      </div>

      <div className="ob-foot">
        {last ? (
          <span />
        ) : (
          <button type="button" className="ui-btn ui-btn-quiet ob-skip" onClick={() => end('skipped')}>
            Skip for now
          </button>
        )}
        <span className="ob-dots" role="img" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
          {STEPS.map((st, n) => (
            <i key={st} className={n === i ? 'is-on' : n < i ? 'is-done' : ''} />
          ))}
        </span>
        <span className="ob-foot-end">
          {i > 0 && (
            <button type="button" className="ui-btn" data-testid="onboarding.back" onClick={() => dispatch({ type: 'back' })}>
              Back
            </button>
          )}
          {!last && (
            <button type="button" className="ui-btn ui-btn-primary ob-next" data-testid="onboarding.next" onClick={() => dispatch({ type: 'next' })}>
              {s.step === 'hello' ? "Let's go!" : 'Next'}
              <Icon name="next" size={14} />
            </button>
          )}
        </span>
      </div>
    </Modal>
  );
}

/** Names the open drawing once a quest (or nothing) has got the page ready, if it's still Untitled. */
function renameWhenReady(name: string) {
  const rename = () => {
    const d = store().get().doc;
    if (d.name === 'Untitled' && name !== 'Untitled') store().update('Name drawing', (doc) => void (doc.name = name));
  };
  rename();
  // A quest may swap in a fresh page a moment later.
  const before = store().get().doc.id;
  const off = store().subscribe(() => {
    if (store().get().doc.id === before) return;
    off();
    rename();
  });
  window.setTimeout(off, 15_000);
}

// ---------------------------------------------------------------- what Quill says and does

function sayFor(s: FlowState, o: { strawberryName: string; lovesIt: boolean; quillOn: boolean; name: string; plan: ReturnType<typeof planFor> }): string[] {
  switch (s.step) {
    case 'hello':
      return lines('onboarding.hello');
    case 'make':
      return [makeReaction(s)];
    case 'themes':
      return lines(o.lovesIt ? 'onboarding.themes.loved' : 'onboarding.themes.hint', { theme: o.strawberryName });
    case 'prefs':
      return lines(o.quillOn ? 'onboarding.prefs.on' : 'onboarding.prefs.off');
    case 'done':
      // The name is asked for on this page, so his name lines lead and the "how shall we start" ones follow.
      return [...lines('onboarding.name'), ...lines('onboarding.done', { name: o.name.trim() || line('onboarding.done.noName') })];
  }
}

function animFor(s: FlowState, lovesIt: boolean, beat: number): Script {
  switch (s.step) {
    case 'hello':
      return beat <= 1 ? [{ anim: 'wave', hold: 2400 }, { anim: 'talk', hold: 3000 }, { anim: 'idle' }] : [{ anim: 'talk', hold: 2400 }, { anim: 'idle' }];
    case 'make':
      return s.lastPick ? [{ anim: 'cheer' }, { anim: 'idle' }] : [{ anim: 'point', hold: 1600 }, { anim: 'idle' }];
    case 'themes':
      return lovesIt ? [{ anim: 'cheer' }, { anim: 'cheer' }, { anim: 'idle' }] : [{ anim: 'talk', hold: 2600 }, { anim: 'idle' }];
    case 'prefs':
      return [{ anim: 'think', hold: 1800 }, { anim: 'idle' }];
    case 'done':
      return [{ anim: 'draw', hold: 2200 }, { anim: 'cheer' }, { anim: 'wave', hold: 1600 }, { anim: 'idle' }];
  }
}

/** A little strawberry that pops up beside Quill when you pick his favourite. */
function Berry() {
  return (
    <svg className="ob-berry" viewBox="0 0 32 32" width="40" height="40" aria-hidden="true">
      <path d="M16 9c6 0 11 2 11 7 0 6-6 13-11 13S5 22 5 16c0-5 5-7 11-7z" fill="#e8364f" stroke="#7a1426" strokeWidth="1.5" />
      <path d="M16 10l-4-6 4 3 4-3z M10 9l6 1 6-1-3 3h-6z" fill="#3fae5a" stroke="#1d5e2c" strokeWidth="1" strokeLinejoin="round" />
      {[
        [11, 15],
        [16, 14],
        [21, 15],
        [13, 20],
        [19, 20],
        [16, 25],
      ].map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="0.9" ry="1.3" fill="#ffd84a" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- steps

/** What Frameling does, as a plain list (not cards: nothing here is a button, so nothing looks like one). */
function Hello() {
  const items: [string, string, string][] = [
    ['brush', 'Draw', 'Brushes, shapes and fills.'],
    ['film', 'Animate', 'Frame by frame, like a flipbook.'],
    ['tween', 'Tween', 'Set two poses, get the middle free.'],
    ['pixel', 'Pixel art', 'Crisp, chunky, game ready.'],
    ['export', 'Share', 'GIFs, videos, sprite sheets, games.'],
  ];
  return (
    <>
      <p className="ob-lead">Here is what you can do.</p>
      <ul className="ob-hello" aria-label="What you can do in Frameling">
        {items.map(([icon, title, blurb], n) => (
          <li key={title} style={{ animationDelay: `${150 + n * 90}ms` }}>
            <span className="ob-hello-icon">
              <Icon name={icon} size={20} />
            </span>
            <strong>{title}</strong>
            <span>{blurb}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Making tile levels needs the Tiles feature; without it the card and the plan for it are left out. */
const interestAvailable = (id: string): boolean => id !== 'tiles' || isFeatureOn('tiles');

/** Said when Tiles and levels was picked but the Tiles feature is off: why it is missing from the plan, and a way to fix it. */
function TilesOffNote({ s }: { s: FlowState }) {
  if (!pickedButOff(s.interests, isFeatureOn).includes('tiles')) return null;
  const feature = getFeature('tiles');
  return (
    <p className="ob-off-note" role="status">
      <span>{line('onboarding.tilesOff.note')}</span>
      {feature && (
        <button type="button" className="ob-read" onClick={() => void offerTurnOnForWish(feature, line('onboarding.tilesOff.why'))}>
          {line('onboarding.tilesOff.button')}
        </button>
      )}
    </p>
  );
}

function Make({ s, toggle }: { s: FlowState; toggle: (i: (typeof INTERESTS)[number]['id']) => void }) {
  return (
    <>
      <p className="ob-lead">{line('onboarding.make.lead')}</p>
      <div className="ob-cards" role="group" aria-label="What would you like to make?">
        {INTERESTS.filter((x) => interestAvailable(x.id)).map((x, n) => {
          const on = s.interests.includes(x.id);
          return (
            <button key={x.id} type="button" aria-pressed={on} className={`ob-card${on ? ' is-chosen' : ''}`} style={{ animationDelay: `${n * 60}ms` }} onClick={() => toggle(x.id)}>
              <span className="ob-card-icon">
                <Icon name={on ? 'check' : x.icon} size={22} />
              </span>
              <strong>{x.title}</strong>
              <span>{x.blurb}</span>
            </button>
          );
        })}
      </div>
      <TilesOffNote s={s} />
    </>
  );
}

function Themes({ themes, strawberry }: { themes: Theme[]; strawberry: { dark: Theme | null; light: Theme | null } }) {
  const p = usePrefs((x) => x);
  const pick = (t: Theme) => {
    setPrefs(t.mode === 'dark' ? { darkTheme: t.id } : { lightTheme: t.id });
    // Show it straight away, even when the mode would show the other one.
    setThemePreview(t);
  };
  const row = (mode: 'dark' | 'light') => {
    const chosen = mode === 'dark' ? p.darkTheme : p.lightTheme;
    // With Light or Dark picked, the other row isn't used, so it steps back (still pickable for later).
    const unused = p.theme !== 'system' && p.theme !== mode;
    return (
      <div className={`ob-theme-row${unused ? ' is-unused' : ''}`}>
        <h3>
          <Icon name={mode === 'dark' ? 'moon' : 'sun'} size={14} />
          {mode === 'dark' ? 'For dark mode' : 'For light mode'}
        </h3>
        <div className="ob-themes" role="radiogroup" aria-label={mode === 'dark' ? 'Dark theme' : 'Light theme'}>
          {themes
            .filter((t) => t.mode === mode)
            .map((t) => {
              const fav = strawberry[mode]?.id === t.id;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={chosen === t.id} className={`ob-theme${chosen === t.id ? ' is-chosen' : ''}${fav ? ' is-fav' : ''}`} title={t.description} onClick={() => pick(t)}>
                  <ThemePreview theme={t} />
                  <span className="ob-theme-name">
                    {t.name}
                    {fav && (
                      <span className="ob-fav">
                        <Icon name="heart" size={11} />
                        {line('onboarding.themes.favourite')}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    );
  };
  return (
    <>
      <div className="ob-mode">
        <h3>Light or dark?</h3>
        <p>{p.theme === 'system' ? 'Auto follows your computer: light in the day, dark at night if it switches.' : p.theme === 'dark' ? 'Always dark, whatever your computer does.' : 'Always light, whatever your computer does.'}</p>
        <Segmented<ThemePref>
          label="Light or dark"
          value={p.theme}
          onChange={(theme) => {
            setThemePreview(null);
            setPrefs({ theme });
          }}
          options={[
            { id: 'system', label: 'Auto', icon: 'settings' },
            { id: 'dark', label: 'Dark', icon: 'moon' },
            { id: 'light', label: 'Light', icon: 'sun' },
          ]}
        />
      </div>
      {row('dark')}
      {row('light')}
    </>
  );
}

function Setting({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="ob-setting">
      <div>
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Settings({ onQuill }: { onQuill: (on: boolean) => void }) {
  const p = usePrefs((x) => x);
  return (
    <div className="ob-settings">
      <Setting label="Look" hint="Cosy is soft and rounded. Crisp is tighter and sharper.">
        <Segmented<LookPref>
          label="Look"
          value={p.look}
          onChange={(look) => setPrefs({ look })}
          options={[
            { id: 'cosy', label: 'Cosy', icon: 'heart' },
            { id: 'crisp', label: 'Crisp', icon: 'grid' },
          ]}
        />
      </Setting>
      <Setting label="Sounds" hint="Little sound effects, as they arrive.">
        <Switch label="Sounds" on={p.sounds} onChange={(sounds) => setPrefs({ sounds })} />
      </Setting>
      <Setting label="Show Quill" hint={line('onboarding.prefs.showQuill')}>
        <Switch label="Show Quill" on={p.showQuill} onChange={onQuill} />
      </Setting>
      <p className="ob-lead ob-more">Units, the mouse wheel and the rest are in Preferences whenever you want them. Less motion follows your computer's own setting.</p>
    </div>
  );
}

function Name({ name, setName }: { name: string; setName: (n: string) => void }) {
  const [spin, setSpin] = useState(0);
  return (
    <form className="ob-name" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="ob-name-input">Name your first animation</label>
      <div className="ob-name-row">
        <input id="ob-name-input" type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-autofocus />
        <button
          type="button"
          className="ui-btn ob-dice"
          aria-label="Roll a new silly name"
          data-tip="Roll a new silly name"
          onClick={() => {
            setName(sillyName(Math.random, name));
            setSpin((n) => n + 1);
          }}
        >
          <Dice key={spin} />
          Roll
        </button>
      </div>
      <p className="ob-lead">You can rename it any time by clicking its name at the top.</p>
    </form>
  );
}

function Dice() {
  return (
    <svg className="ob-dice-art" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {[
        [5, 5],
        [11, 5],
        [8, 8],
        [5, 11],
        [11, 11],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="currentColor" />
      ))}
    </svg>
  );
}

function Done({ s, plan, tuck, setName, setTuck, go }: { s: FlowState; plan: ReturnType<typeof planFor>; tuck: ReturnType<typeof tuckPlan>; setName: (n: string) => void; setTuck: (on: boolean) => void; go: (g: 'quest' | 'template' | 'blank') => void }) {
  const quest = getQuest(plan.quest);
  const [templateName, setTemplateName] = useState('');
  useEffect(() => {
    let live = true;
    void import('../../templates').then((m) => live && setTemplateName(m.findTemplate(plan.template)?.name ?? ''));
    return () => void (live = false);
  }, [plan.template]);
  const help = plan.help.map((id) => getHelp(id)).filter((t): t is NonNullable<typeof t> => !!t);
  const ws = plan.workspace === 'pixel' ? 'Pixel' : plan.workspace === 'animate' ? 'Animate' : 'Draw';
  return (
    <div className="ob-done">
      <Name name={s.name} setName={setName} />
      <p className="ob-lead">
        {lineParts('onboarding.done.lead', { workspace: <strong key="ws">{ws}</strong>, name: <strong key="name">{s.name.trim() || line('onboarding.done.leadNoName')}</strong> })}
      </p>
      <TilesOffNote s={s} />
      {tuck.ids.length > 0 && (
        <div className="ob-tuck">
          <Setting label="Tuck away what you didn't pick" hint={`Puts ${nameList(tuck.names)} out of sight for now, so the menus and panels stay small. Preferences > Features brings any of it back.`}>
            <Switch label="Tuck away what you didn't pick" on={s.tuck} onChange={setTuck} />
          </Setting>
        </div>
      )}
      <div className="ob-go-list">
        {quest && (
          <button type="button" className="ob-go is-main" onClick={() => go('quest')}>
            <span className="ob-card-icon">
              <Icon name={quest.icon} size={24} />
            </span>
            <strong>Show me how</strong>
            <span>{line('onboarding.done.quest', { quest: quest.title })}</span>
          </button>
        )}
        {templateName && (
          <button type="button" className="ob-go" onClick={() => go('template')}>
            <span className="ob-card-icon">
              <Icon name="film" size={24} />
            </span>
            <strong>Open an example</strong>
            <span>{line('onboarding.done.example', { example: templateName })}</span>
          </button>
        )}
        <button type="button" className="ob-go" onClick={() => go('blank')}>
          <span className="ob-card-icon">
            <Icon name="brush" size={24} />
          </span>
          <strong>{plan.blank === 'blank-pixel' ? 'Just a blank pixel grid' : plan.blank === 'blank-level' ? 'Just a blank level' : 'Just a blank page'}</strong>
          <span>{line('onboarding.done.blank')}</span>
        </button>
      </div>
      {help.length > 0 && (
        <div className="ob-reads">
          <span>Good reads for you:</span>
          {help.map((t) => (
            <button key={t.id} type="button" className="ob-read" onClick={() => {
                go('blank');
                openHelp(t.id);
              }}>
              <Icon name="book" size={13} />
              {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
