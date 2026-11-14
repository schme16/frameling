// The "ask the first time" dialog for core choices (src/core/choices.ts), and the Behaviour preferences page that
// lists every choice so an answer can be changed or forgotten later.
import { useEffect, useRef, useState } from 'react';
import { allChoices, askAgain, askMeAgain, forgetAnswers, setChoice, setChoiceAsker, setGentleTeller, setUsualAnswers, setWearyNotice, useChoices, usualAnswerIds, type ChoiceDef } from '../core/choices';
import { store } from '../core/store';
import { Icon } from './icons';
import { Modal } from './Modal';
import { openHelp, openPrefs, overlays } from './overlays';
import { Quill, useQuillShown } from './mascot';
import { createStore } from './mini';
import { toast } from './toast';

interface Pending {
  def: ChoiceDef;
  resolve: (r: { value: string; remember: boolean } | null) => void;
}

export const asking = createStore<Pending | null>(null);
// A question that arrives while another is up waits its turn, rather than taking its place and leaving it unanswered.
const waiting: Pending[] = [];

export const putQuestion = (def: ChoiceDef) =>
  new Promise<{ value: string; remember: boolean } | null>((resolve) => {
    const p = { def, resolve };
    if (asking.get()) waiting.push(p);
    else asking.set(() => p);
  });

setChoiceAsker(putQuestion);

// The sheets a person has met so far: the first one carries the button that switches the lot off.
const MET_KEY = 'frameling.choices.sheetsMet.v1';
function sheetsMet(): number {
  try {
    return Number(localStorage.getItem(MET_KEY)) || 0;
  } catch {
    return 0;
  }
}
function metASheet(): void {
  try {
    localStorage.setItem(MET_KEY, String(sheetsMet() + 1));
  } catch {
    // No storage: the button shows on every sheet this session, which is harmless.
  }
}

const questions = (n: number) => (n === 1 ? '1 question' : `${n} questions`);

/** Answers every question that can be answered the usual way, and says so with an Undo. Returns how many. */
export function applyUsualAnswers(): number {
  const ids = setUsualAnswers();
  toast(`Answered ${questions(ids.length)} the usual way. Nothing will ask now.`, {
    kind: 'success',
    duration: 12000,
    action: {
      label: 'Undo',
      id: 'undo-usual-answers',
      run: () => {
        forgetAnswers(ids);
        toast(`Put back. Those ${questions(ids.length)} will ask again.`);
      },
    },
    decline: { label: 'Open Behaviour', id: 'open-behaviour', run: () => openPrefs('behaviour') },
  });
  return ids.length;
}

/** The words on the button that does it, with the number that makes it real. */
export const usualAnswersLabel = (n: number): string => `Answer all ${questions(n)} the usual way and stop asking`;

// A choice that would have asked: the usual thing happens, a toast says so, and Change puts the question after the fact.
setGentleTeller((def, value, run, undo, notRemembered) => {
  const before = store().historyIds().undo;
  run(value);
  const after = store().historyIds().undo;
  // Nothing happened (a locked layer, say): nothing to tell, and nothing to remember.
  if (!undo && after === before) {
    setChoice(def.id, undefined);
    return;
  }
  const did = def.options.find((o) => o.value === value)?.did ?? def.title;
  toast(notRemembered ? `${did} You closed that question twice, so it won't ask again until you restart.` : did, {
    action: {
      label: 'Change',
      id: `change-${def.id}`,
      run: () => {
        void askAgain(def.id, value).then((r) => {
          if (!r) return;
          const once = def.options.find((o) => o.value === r.value)?.once;
          setChoice(def.id, r.remember && !once ? r.value : undefined);
          if (r.value === value) return;
          // Take the usual thing back and do it the other way, if it is still the last thing that happened.
          if (undo) undo();
          else if (store().historyIds().undo === after) store().undo();
          else return;
          run(r.value);
        });
      },
    },
  });
});

// A question that was closed twice is not put a third time this session: what closing does happens, and a toast says so.
setWearyNotice((def, value) => {
  const label = def.options.find((o) => o.value === value)?.label ?? value;
  toast(`You closed "${def.title}" twice, so it used "${label}" without asking. It won't ask again until you restart.`, {
    action: { label: 'Ask me again', id: `ask-again-${def.id}`, run: () => askMeAgain(def.id) },
  });
});

/** A choice's help is a topic id, with `#heading` to land on one part of it. */
export function helpTarget(help: string): [string, string | undefined] {
  const [topic, anchor] = help.split('#');
  return [topic, anchor || undefined];
}

export function ChoiceDialog() {
  const pending = asking.use((p) => p);
  // Learn more opens the help; the question steps aside so the help can be read first, and comes back with its place kept.
  const helpOpen = overlays.use((o) => !!o.help);
  if (!pending) return null;
  return (
    <div className="ui-choice-wrap" style={helpOpen ? { display: 'none' } : undefined} data-stepped-aside={helpOpen || undefined}>
      <Ask key={pending.def.id} pending={pending} aside={helpOpen} />
    </div>
  );
}

function Ask({ pending, aside }: { pending: Pending; aside: boolean }) {
  const { def, resolve } = pending;
  const [value, setValue] = useState(def.highlight ?? def.default);
  const [remember, setRemember] = useState(true);
  const quill = useQuillShown();
  const [first] = useState(() => sheetsMet() === 0);
  useEffect(metASheet, []);
  const learn = useRef<HTMLButtonElement>(null);
  const wasAside = useRef(false);
  // Back from the help: the place is kept (what you picked, the tick box), and focus returns to Learn more.
  useEffect(() => {
    if (wasAside.current && !aside) learn.current?.focus();
    wasAside.current = aside;
  }, [aside]);
  const finish = (r: { value: string; remember: boolean } | null) => {
    asking.set(() => waiting.shift() ?? null);
    resolve(r);
  };
  const howMany = usualAnswerIds().length;
  return (
    <Modal title={def.title} size="sm" className="ui-choice" onClose={() => finish(null)} initialFocus=".ui-choice-opt.is-chosen">
      {def.quill && quill ? (
        <div className="ui-choice-quill">
          <Quill anim={[{ anim: 'wave', hold: 1400 }, { anim: 'idle' }]} size={64} />
          <p className="ui-choice-q">{def.question}</p>
        </div>
      ) : (
        <p className="ui-choice-q">{def.question}</p>
      )}
      <div className="ui-choice-opts" role="radiogroup" aria-label={def.title}>
        {def.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`ui-choice-opt${value === o.value ? ' is-chosen' : ''}`}
            data-testid={`choice.${def.id}.${o.value}`}
            onClick={() => setValue(o.value)}
            onDoubleClick={() => finish({ value: o.value, remember })}
          >
            <span className="ui-choice-dot" aria-hidden="true" />
            <span className="ui-choice-text">
              <strong>{o.label}</strong>
              {o.detail && <span>{o.detail}</span>}
            </span>
          </button>
        ))}
      </div>
      <label className="ui-choice-remember">
        <input type="checkbox" data-testid={`choice.${def.id}.remember`} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember my choice. You can change it any time in Preferences, Behaviour.
      </label>
      {first && howMany > 1 && (
        <div className="ui-choice-usual">
          <button
            type="button"
            className="ui-btn"
            data-testid="choice.usual"
            onClick={() => {
              applyUsualAnswers();
              finish({ value: def.default, remember: false });
            }}
          >
            {usualAnswersLabel(howMany)}
          </button>
          <span>Every answer stays listed in Preferences, Behaviour, and the message after has an Undo.</span>
        </div>
      )}
      <div className="ui-choice-foot">
        {def.help && (
          <button type="button" className="ui-btn ui-btn-quiet" data-testid={`choice.${def.id}.help`} onClick={() => openHelp(...helpTarget(def.help ?? ''))} ref={learn}>
            <Icon name="help" size={14} /> Learn more
          </button>
        )}
        <span className="ui-spacer" />
        <button type="button" className="ui-btn ui-btn-primary" data-testid={`choice.${def.id}.ok`} onClick={() => finish({ value, remember })}>
          OK
        </button>
      </div>
    </Modal>
  );
}

/** Preferences > Behaviour: every choice, with "Ask me" for ones not answered yet. */
export function BehaviourPage() {
  const answers = useChoices();
  const usualLeft = usualAnswerIds().length;
  const groups = new Map<string, ChoiceDef[]>();
  for (const c of allChoices()) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }
  return (
    <div className="ui-behaviour">
      <p className="ui-pref-intro">How Frameling behaves where people like different things. Anything set to "Ask me" asks the first time it comes up.</p>
      <p className="ui-pref-intro">
        {usualLeft > 0 ? (
          <button type="button" className="ui-btn" data-testid="choice.usual-all" onClick={applyUsualAnswers}>
            {usualAnswersLabel(usualLeft)}
          </button>
        ) : (
          'Every question already has an answer.'
        )}
      </p>
      {[...groups].map(([cat, list]) => (
        <section key={cat}>
          <h3>{cat}</h3>
          {list.map((c) => (
            <div key={c.id} className="ui-pref-row">
              <div className="ui-pref-text">
                <strong>{c.title}</strong>
                <span>{c.question}</span>
              </div>
              <div className="ui-pref-control">
                <select value={answers[c.id] ?? ''} onChange={(e) => setChoice(c.id, e.target.value || undefined)} aria-label={c.title}>
                  {!c.silent && <option value="">Ask me</option>}
                  {c.silent && !answers[c.id] && <option value="">{c.options.find((o) => o.value === c.default)?.label} (default)</option>}
                  {c.options.filter((o) => !o.once).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
