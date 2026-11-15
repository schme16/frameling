// The private side of the board: the vote, the guessing game and the waiting prompts, laid out before they are agreed to.
// It shows what the drawing window sends (side.ts) and says back what was pressed. Words from viewers are only here when
// the drawing window put them in the message, which it does only while the board is private or after Read it.
import { useEffect, useState } from 'react';
import { MAX_OPTIONS, MIN_OPTIONS, OPTION_MAX, QUESTION_MAX, cleanSetup } from '../votes/tally';
import type { BoardView } from './model';
import type { FromBoard } from './protocol';
import type { GuessSide, JarSide, VoteSide } from './side';

const COVER_DOTS = '••••••';
/** The colour each option keeps, the same as on the drawing window. */
const OPTION_COLOURS = ['#d93a3f', '#2f6fe0', '#1f9a58', '#b86d00', '#7a4be0', '#0e8f99'];
const WORD_MAX = 40;

type Tell = (m: FromBoard) => void;

/** The clock reading of a number of seconds: 1:05. */
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function useSecondsLeft(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [endsAt]);
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function PrivateSide({ view, tell }: { view: BoardView; tell: Tell }) {
  const p = view.privacy;
  return (
    <section className="sb-side" aria-label="The private side" data-testid="sb.side" data-private={p.private ? '' : undefined}>
      <div className="sb-privacy" data-testid="sb.privacy" data-why={p.why}>
        <p className="sb-privacy-line">{p.line}</p>
        <div className="sb-privacy-row">
          <button type="button" className="sb-quiet" data-testid="sb.onstream" aria-pressed={p.onStream} onClick={() => tell({ t: 'onstream', on: !p.onStream })}>
            {p.onStream ? 'Keep this board private' : 'This board is on my stream'}
          </button>
          {!p.private && !p.onStream ? (
            <button type="button" className="sb-quiet" data-testid="sb.viewers" onClick={() => tell({ t: 'viewers' })}>
              What can my viewers see?
            </button>
          ) : null}
        </div>
      </div>
      {view.vote ? <VoteCard v={view.vote} tell={tell} /> : null}
      {view.guess ? <GuessCard g={view.guess} tell={tell} /> : null}
      {view.jar ? <JarCard j={view.jar} tell={tell} /> : null}
    </section>
  );
}

function VoteCard({ v, tell }: { v: VoteSide; tell: Tell }) {
  const left = useSecondsLeft(v.endsAt);
  return (
    <article className="sb-card" data-testid="sb.vote" data-phase={v.phase}>
      <h2>Vote</h2>
      {v.phase === 'none' ? (
        <VoteWriter v={v} tell={tell} />
      ) : (
        <>
          <p className="sb-q" data-testid="sb.vote.question">{v.question}</p>
          <ul className="sb-bars">
            {v.options.map((o, i) => (
              <li key={i} data-testid={`sb.vote.option.${i + 1}`}>
                <span className="sb-bar-fill" style={{ width: `${o.percent}%`, background: OPTION_COLOURS[i % OPTION_COLOURS.length] }} />
                <span className="sb-bar-text">
                  <span className="sb-num" style={{ background: OPTION_COLOURS[i % OPTION_COLOURS.length] }}>{i + 1}</span>
                  <span className="sb-bar-name">{o.text}</span>
                  <span className="sb-bar-count">{o.count} ({o.percent}%)</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="sb-meta" data-testid="sb.vote.meta">
            {v.total} {v.total === 1 ? 'vote' : 'votes'} in{left !== null ? `, ${clock(left)} left` : ''}
            {v.phase === 'result' ? `. ${v.outcome}.` : ''}
          </p>
        </>
      )}
    </article>
  );
}

function VoteWriter({ v, tell }: { v: VoteSide; tell: Tell }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [seconds, setSeconds] = useState(v.setup.seconds);
  const cleaned = cleanSetup({ question, options, seconds: seconds || null });
  if (!open) {
    return (
      <div className="sb-idle">
        <p className="sb-note">No vote going. Write one here, read it over, then start it.</p>
        <button type="button" className="sb-small" data-testid="sb.vote.write" onClick={() => setOpen(true)}>Write a vote</button>
      </div>
    );
  }
  const set = (i: number, t: string) => setOptions((o) => o.map((x, j) => (j === i ? t : x)));
  return (
    <form
      className="sb-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!cleaned.ok) return;
        tell({ t: 'vote', question, options, seconds });
        setOpen(false);
        setQuestion('');
        setOptions(['', '']);
      }}
    >
      <input type="text" className="sb-input" aria-label="What is the vote about?" data-testid="sb.vote.q" value={question} maxLength={QUESTION_MAX} placeholder="Which colour next?" onChange={(e) => setQuestion(e.target.value)} />
      {options.map((o, i) => (
        <div className="sb-row" key={i}>
          <span className="sb-num" style={{ background: OPTION_COLOURS[i % OPTION_COLOURS.length] }}>{i + 1}</span>
          <input type="text" className="sb-input" aria-label={`Option ${i + 1}`} data-testid={`sb.vote.o.${i + 1}`} value={o} maxLength={OPTION_MAX} placeholder={i === 0 ? 'Red' : i === 1 ? 'Blue' : 'Another option'} onChange={(e) => set(i, e.target.value)} />
          {options.length > MIN_OPTIONS ? (
            <button type="button" className="sb-quiet" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions((x) => x.filter((_, j) => j !== i))}>Remove</button>
          ) : null}
        </div>
      ))}
      <div className="sb-row">
        {options.length < MAX_OPTIONS ? (
          <button type="button" className="sb-quiet" data-testid="sb.vote.add" onClick={() => setOptions((x) => [...x, ''])}>Add an option</button>
        ) : null}
        <label className="sb-select">
          How long
          <select value={seconds} data-testid="sb.vote.length" onChange={(e) => setSeconds(Number(e.target.value))}>
            {v.setup.lengths.map((l) => (
              <option key={l.seconds} value={l.seconds}>{l.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="sb-row">
        <button type="submit" className="sb-small sb-go" data-testid="sb.vote.start" disabled={!cleaned.ok}>Start the vote</button>
        <button type="button" className="sb-quiet" onClick={() => setOpen(false)}>Never mind</button>
        {!cleaned.ok && (question || options.some(Boolean)) ? <span className="sb-note sb-inline">{cleaned.reason}</span> : null}
      </div>
    </form>
  );
}

function GuessCard({ g, tell }: { g: GuessSide; tell: Tell }) {
  const left = useSecondsLeft(g.endsAt);
  const blanks = g.shown.map((w) => w.map((c) => c ?? '_').join(' ')).join('   ');
  return (
    <article className="sb-card" data-testid="sb.guess" data-phase={g.phase}>
      <h2>Guessing game</h2>
      {g.phase === 'none' ? (
        g.canWrite ? (
          <GuessWriter g={g} tell={tell} />
        ) : (
          <p className="sb-note">No round going. This board is covered, so the word is typed in Frameling: press Start a guessing game.</p>
        )
      ) : (
        <>
          {g.phase === 'open' ? (
            g.word !== null ? (
              <p className="sb-secret" data-testid="sb.guess.secret">
                <span className="sb-secret-label">The word</span>
                {g.word}
              </p>
            ) : (
              <p className="sb-note" data-testid="sb.guess.covered">The word is covered because this board may be seen. It is private only on a screen your viewers do not see.</p>
            )
          ) : (
            <p className="sb-secret" data-testid="sb.guess.answer">
              <span className="sb-secret-label">The word was</span>
              {g.answer ?? ''}
            </p>
          )}
          {g.phase === 'open' ? <p className="sb-blanks" aria-label="What the screen shows">{blanks}</p> : null}
          <p className="sb-meta" data-testid="sb.guess.meta">
            {g.players} {g.players === 1 ? 'person' : 'people'} guessing, {g.guesses} {g.guesses === 1 ? 'guess' : 'guesses'}
            {g.solvers ? `, ${g.solvers} got it` : ''}
            {g.phase === 'open' && g.warmth !== 'none' ? `, closest guess is ${g.warmth}` : ''}
            {left !== null ? `, ${clock(left)} left` : ''}
          </p>
          {g.phase === 'open' ? (
            <>
              {g.rowsCovered ? (
                <div className="sb-idle">
                  <p className="sb-note">Guesses are covered: they are words from chat that nobody has read.</p>
                  <button type="button" className="sb-small" data-testid="sb.guess.read" onClick={() => tell({ t: 'guesses', do: 'read' })}>Read the guesses</button>
                </div>
              ) : g.rows.length ? (
                <>
                  <ul className="sb-guesses" data-testid="sb.guess.rows">
                    {g.rows.map((r, i) => (
                      <li key={i} className={r.right ? 'is-right' : undefined}>{r.right ? (r.text ? `${r.text} (right)` : 'Somebody got it') : (r.text ?? COVER_DOTS)}</li>
                    ))}
                  </ul>
                  {!g.canWrite ? (
                    <button type="button" className="sb-quiet" data-testid="sb.guess.cover" onClick={() => tell({ t: 'guesses', do: 'cover' })}>Cover the guesses</button>
                  ) : null}
                </>
              ) : (
                <p className="sb-note">No guesses yet.</p>
              )}
            </>
          ) : null}
        </>
      )}
    </article>
  );
}

function GuessWriter({ g, tell }: { g: GuessSide; tell: Tell }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [seconds, setSeconds] = useState(g.setup.seconds);
  if (!open) {
    return (
      <div className="sb-idle">
        <p className="sb-note">No round going. Type the word here: this board is private, so it never shows on stream.</p>
        <button type="button" className="sb-small" data-testid="sb.guess.write" onClick={() => setOpen(true)}>Pick a word here</button>
      </div>
    );
  }
  return (
    <form
      className="sb-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!word.trim()) return;
        tell({ t: 'round', word, seconds });
        setOpen(false);
        setWord('');
      }}
    >
      <input type="text" className="sb-input" aria-label="What will you draw?" data-testid="sb.guess.word" value={word} maxLength={WORD_MAX} placeholder="A cat in a hat" autoComplete="off" spellCheck={false} onChange={(e) => setWord(e.target.value)} />
      <div className="sb-row">
        <label className="sb-select">
          How long
          <select value={seconds} data-testid="sb.guess.length" onChange={(e) => setSeconds(Number(e.target.value))}>
            {g.setup.lengths.map((l) => (
              <option key={l.seconds} value={l.seconds}>{l.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="sb-row">
        <button type="submit" className="sb-small sb-go" data-testid="sb.guess.start" disabled={!word.trim()}>Start the game</button>
        <button type="button" className="sb-quiet" onClick={() => setOpen(false)}>Never mind</button>
      </div>
    </form>
  );
}

function JarCard({ j, tell }: { j: JarSide; tell: Tell }) {
  return (
    <article className="sb-card" data-testid="sb.jar">
      <h2>
        Prompt jar <span className="sb-count" data-testid="sb.jar.count">{j.count} waiting</span>
      </h2>
      {j.count === 0 ? (
        <p className="sb-note">Nothing waiting yet. Prompts your audience drops in show up here before you pull one.</p>
      ) : (
        <>
          {j.anyCovered || j.anyRead ? (
            <div className="sb-row">
              {j.anyCovered ? (
                <button type="button" className="sb-quiet" data-testid="sb.jar.readAll" onClick={() => tell({ t: 'slips', do: 'read' })}>Read them all</button>
              ) : null}
              {j.anyRead ? (
                <button type="button" className="sb-quiet" data-testid="sb.jar.coverAll" onClick={() => tell({ t: 'slips', do: 'cover' })}>Cover them again</button>
              ) : null}
              {j.anyCovered ? <span className="sb-note sb-inline">Covered: these are words from chat that nobody has read.</span> : null}
            </div>
          ) : null}
          <ul className="sb-slips" data-testid="sb.jar.slips">
            {j.slips.map((s) => (
              <li key={s.id} data-testid={`sb.jar.slip.${s.id}`} data-covered={s.covered ? '' : undefined}>
                <span className="sb-slip-text">{s.covered ? <span aria-hidden="true">{COVER_DOTS}</span> : s.text}</span>
                {s.covered ? (
                  <button type="button" className="sb-quiet" aria-label="Read this prompt" onClick={() => tell({ t: 'slip', do: 'read', id: s.id })}>Read it</button>
                ) : (
                  <button type="button" className="sb-small" aria-label={`Pull this prompt: ${s.text}`} onClick={() => tell({ t: 'slip', do: 'pull', id: s.id })}>Pull this one</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
