// The "ask the first time" dialog for core choices (src/core/choices.ts), and the Behaviour preferences page that
// lists every choice so an answer can be changed or forgotten later.
import { useState } from 'react';
import { allChoices, setChoice, setChoiceAsker, useChoices, type ChoiceDef } from '../core/choices';
import { Icon } from './icons';
import { Modal } from './Modal';
import { openHelp } from './overlays';
import { createStore } from './mini';

interface Pending {
  def: ChoiceDef;
  resolve: (r: { value: string; remember: boolean } | null) => void;
}

const asking = createStore<Pending | null>(null);

setChoiceAsker(
  (def) =>
    new Promise((resolve) => {
      asking.set(() => ({ def, resolve }));
    }),
);

export function ChoiceDialog() {
  const pending = asking.use((p) => p);
  if (!pending) return null;
  return <Ask key={pending.def.id} pending={pending} />;
}

function Ask({ pending }: { pending: Pending }) {
  const { def, resolve } = pending;
  const [value, setValue] = useState(def.default);
  const [remember, setRemember] = useState(true);
  const finish = (r: { value: string; remember: boolean } | null) => {
    asking.set(() => null);
    resolve(r);
  };
  return (
    <Modal title={def.title} size="sm" className="ui-choice" onClose={() => finish(null)} initialFocus=".ui-choice-opt.is-chosen">
      <p className="ui-choice-q">{def.question}</p>
      <div className="ui-choice-opts" role="radiogroup" aria-label={def.title}>
        {def.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`ui-choice-opt${value === o.value ? ' is-chosen' : ''}`}
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
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember my choice. You can change it any time in Preferences, Behaviour.
      </label>
      <footer className="ui-choice-foot">
        {def.help && (
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp(def.help)}>
            <Icon name="help" size={14} /> Learn more
          </button>
        )}
        <span className="ui-spacer" />
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => finish({ value, remember })}>
          OK
        </button>
      </footer>
    </Modal>
  );
}

/** Preferences > Behaviour: every choice, with "Ask me" for ones not answered yet. */
export function BehaviourPage() {
  const answers = useChoices();
  const groups = new Map<string, ChoiceDef[]>();
  for (const c of allChoices()) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }
  return (
    <div className="ui-behaviour">
      <p className="ui-pref-intro">How Frameling behaves where people like different things. Anything set to "Ask me" asks the first time it comes up.</p>
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
                  {c.options.map((o) => (
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
