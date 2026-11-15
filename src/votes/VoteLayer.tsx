// What a vote puts on the screen: the box where you write it, the live counts while it runs, and the result when it
// ends. It is words and shapes laid over the window. It reads counts and nothing else, and there is no button anywhere
// in it that does something with the result: you read it, and you decide.
import { useEffect, useId, useState } from 'react';
import { Icon } from '../ui/icons';
import { Modal } from '../ui/Modal';
import { openHelp } from '../ui/overlays';
import { closeVote, endVote, startVote, voteScreen, withAudienceOn } from './state';
import { LENGTHS, lastLength, rememberLength } from './setup';
import { closeVoteSetup, voteSetupOpen } from './setupState';
import { MAX_OPTIONS, MIN_OPTIONS, OPTION_MAX, QUESTION_MAX, cleanSetup, percents, type VoteView } from './tally';
import './votes.css';

/** The colour each option keeps, so people can tell them apart at a glance. Each takes white text. */
export const OPTION_COLOURS = ['#d93a3f', '#2f6fe0', '#1f9a58', '#b86d00', '#7a4be0', '#0e8f99'];

/** Seconds left, rounded up, never below zero. */
export const secondsLeft = (endsAt: number, now: number): number => Math.max(0, Math.ceil((endsAt - now) / 1000));
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The one line that says how it ended, in plain words. */
export function resultLine(v: Pick<VoteView, 'options' | 'counts' | 'total' | 'outcome'>): string {
  const o = v.outcome;
  if (o.kind === 'none') return 'No votes came in.';
  const votes = (n: number) => (n === 1 ? '1 vote' : `${n} votes`);
  if (o.kind === 'winner') return `${v.options[o.index]} wins with ${votes(v.counts[o.index])} of ${v.total}.`;
  return `A tie: ${o.indices.map((i) => v.options[i]).join(' and ')}, ${votes(v.counts[o.indices[0]])} each.`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Panel({ view, result }: { view: VoteView; result: boolean }) {
  const now = useNow(!result && view.endsAt !== null);
  const pct = percents(view.counts);
  const top = Math.max(0, ...view.counts);
  const left = view.endsAt === null ? null : secondsLeft(view.endsAt, now);
  const turned = view.turnedAway['no-voter'];
  return (
    <aside className={`vt-panel${result ? ' is-result' : ''}`} data-testid="votes.panel" aria-label={result ? 'Vote result' : 'Vote going'}>
      <header className="vt-head">
        <span className="vt-tag">
          {!result && <span className="vt-dot" aria-hidden="true" />}
          {result ? 'Result' : 'Vote'}
        </span>
        <span className="vt-total" data-testid="votes.total">
          {view.total === 1 ? '1 vote' : `${view.total} votes`}
        </span>
        {left !== null && !result && <span className="vt-time" data-testid="votes.time">{clock(left)}</span>}
      </header>
      {left !== null && !result && view.endsAt !== null && <span className="vt-drain" style={{ transform: `scaleX(${Math.max(0, Math.min(1, (view.endsAt - now) / (view.endsAt - view.startedAt)))})` }} aria-hidden="true" />}
      <h2 className="vt-question" data-testid="votes.question">{view.question}</h2>
      <ol className="vt-options">
        {view.options.map((label, i) => {
          const lead = view.counts[i] === top && top > 0;
          const colour = OPTION_COLOURS[i % OPTION_COLOURS.length];
          const tied = view.outcome.kind === 'tie' && lead;
          return (
            <li key={i} className={`vt-opt${lead ? ' is-lead' : ''}${result && !lead ? ' is-out' : ''}`} style={{ ['--vt-c' as string]: colour }} data-testid={`votes.option.${i + 1}`}>
              <span className="vt-num" aria-hidden="true">{i + 1}</span>
              <span className="vt-label">{label}</span>
              {result && lead && <span className="vt-badge">{tied ? 'Tied' : 'Winner'}</span>}
              <span className="vt-count" data-testid={`votes.count.${i + 1}`}>{view.counts[i]}</span>
              <span className="vt-pct">{pct[i]}%</span>
              <span className="vt-track" aria-hidden="true">
                <span className="vt-fill" style={{ transform: `scaleX(${view.total ? view.counts[i] / view.total : 0})` }} />
              </span>
            </li>
          );
        })}
      </ol>
      {result ? (
        <>
          <p className="vt-line" data-testid="votes.resultLine" role="status">{resultLine(view)}</p>
          <p className="vt-note">Frameling only counts. What you do about it is up to you.</p>
        </>
      ) : turned > 0 ? (
        <p className="vt-note" data-testid="votes.turned">
          {turned === 1 ? '1 vote had' : `${turned} votes had`} no voter id and {turned === 1 ? 'was' : 'were'} turned away.{' '}
          <button type="button" className="vt-link" onClick={() => openHelp('votes')}>Why?</button>
        </p>
      ) : null}
      <footer className="vt-foot">
        {result ? (
          <button type="button" className="ui-btn ui-btn-primary" data-testid="votes.close" onClick={closeVote}>Close</button>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn-primary" data-testid="votes.end" onClick={endVote}>End the vote</button>
            <button type="button" className="ui-btn ui-btn-quiet" data-testid="votes.throw" onClick={closeVote}>Throw it away</button>
          </>
        )}
      </footer>
    </aside>
  );
}

function SetupBox() {
  const hint = useId();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [seconds, setSeconds] = useState(lastLength);
  const cleaned = cleanSetup({ question, options, seconds: seconds || null });
  const set = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const go = () => {
    if (!cleaned.ok) return;
    rememberLength(seconds);
    const raw = cleaned.setup;
    withAudienceOn(() => {
      const r = startVote(raw);
      if (r.ok) closeVoteSetup();
    });
  };
  return (
    <Modal title="Start a vote" size="md" onClose={closeVoteSetup} initialFocus="[data-autofocus]" describedBy={hint}>
      <form
        className="vt-form"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <p className="ui-pref-intro" id={hint}>
          Chat votes, Frameling counts, and you decide. Nothing changes in your drawing by itself.
        </p>
        <label className="ui-field">
          <span>What is the vote about?</span>
          <input type="text" data-autofocus data-testid="votes.setup.question" value={question} maxLength={QUESTION_MAX} placeholder="Which colour next?" onChange={(e) => setQuestion(e.target.value)} />
        </label>
        <div className="vt-setup-options">
          {options.map((o, i) => (
            <div className="vt-setup-row" key={i}>
              <span className="vt-num" style={{ ['--vt-c' as string]: OPTION_COLOURS[i] }} aria-hidden="true">{i + 1}</span>
              <input type="text" aria-label={`Option ${i + 1}`} data-testid={`votes.setup.option.${i + 1}`} value={o} maxLength={OPTION_MAX} placeholder={i === 0 ? 'Red' : i === 1 ? 'Blue' : 'Another option'} onChange={(e) => set(i, e.target.value)} />
              {options.length > MIN_OPTIONS && (
                <button type="button" className="ui-icon-btn" aria-label={`Remove option ${i + 1}`} title="Remove" onClick={() => setOptions((x) => x.filter((_, j) => j !== i))}>
                  <Icon name="close" />
                </button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button type="button" className="ui-btn ui-btn-quiet vt-add" data-testid="votes.setup.add" onClick={() => setOptions((x) => [...x, ''])}>
              <Icon name="plus" size={14} /> Add an option
            </button>
          )}
        </div>
        <fieldset className="vt-lengths">
          <legend>How long?</legend>
          {LENGTHS.map((l) => (
            <label key={l.seconds} className={`vt-length${seconds === l.seconds ? ' is-on' : ''}`}>
              <input type="radio" name="vt-length" checked={seconds === l.seconds} onChange={() => setSeconds(l.seconds)} />
              {l.label}
            </label>
          ))}
        </fieldset>
        <p className="vt-small">
          Your stream tool sends each vote to the actions door as <code>vote.cast</code>, with the option and a voter id.{' '}
          <button type="button" className="vt-link" onClick={() => openHelp('votes')}>How to set that up</button>
        </p>
        <div className="ui-choice-foot">
          {!cleaned.ok && <span className="vt-why" data-testid="votes.setup.why">{cleaned.reason}</span>}
          <button type="button" className="ui-btn" onClick={closeVoteSetup}>Cancel</button>
          <button type="submit" className="ui-btn ui-btn-primary" data-testid="votes.setup.start" disabled={!cleaned.ok}>Start the vote</button>
        </div>
      </form>
    </Modal>
  );
}

export function VoteLayer() {
  const screen = voteScreen.use((s) => s);
  const setup = voteSetupOpen.use((s) => s);
  return (
    <>
      {screen.phase !== 'none' && <Panel view={screen.view} result={screen.phase === 'result'} />}
      {setup && <SetupBox />}
    </>
  );
}
