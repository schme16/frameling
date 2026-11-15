// What a round puts on the screen: the box where you pick the word, the live panel while it runs, and the reveal when it
// ends. While it runs the panel shows blanks and any letters you gave away with a hint, never the word. The word comes
// up in only two places: the box that starts the round (hidden behind "Show it" while Stream-safe is on) and the reveal.
// The one other way is Peek, which you have to allow, which never works under Stream-safe, and which hides again by itself.
import { useEffect, useId, useState } from 'react';
import { setChoice, useChoice } from '../core/choices';
import { isFeatureOn } from '../features/host';
import { useStreamSafe } from '../core/streamSafe';
import { Icon } from '../ui/icons';
import { Modal } from '../ui/Modal';
import { openHelp } from '../ui/overlays';
import { jar, passOn, pullOne } from '../promptjar/jar';
import { lastLength, LENGTHS, rememberLength } from './setup';
import { closeGuessSetup, guessSetupOpen, openGuessSetup } from './setupState';
import { WARMTHS, type Warmth } from './match';
import { cleanSetup, took, WORD_MAX, type RoundView } from './round';
import { closeRound, endRound, giveHint, guessScreen, peek, peekUntil, peekWhy, peekWord, startRound, withAudienceOn } from './state';
import { pickWord } from './words';
import './guess.css';

/** Seconds left, rounded up, never below zero. */
export const secondsLeft = (endsAt: number, now: number): number => Math.max(0, Math.ceil((endsAt - now) / 1000));
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** What the warmth meter says, in plain words. */
export const WARMTH_WORDS: Record<Warmth, string> = { none: 'Waiting for a guess', cold: 'Cold', cool: 'Cool', warm: 'Warm', hot: 'Hot' };

/** The one line that says how it ended, in plain words. */
export function resultLine(v: Pick<RoundView, 'winner' | 'solvers' | 'players' | 'reason'>): string {
  if (v.winner) {
    const who = v.winner.name ?? 'Someone';
    const more = v.solvers > 1 ? ` ${v.solvers - 1} more got it too.` : '';
    return `${who} got it in ${took(v.winner.afterMs)}.${more}`;
  }
  return v.players === 0 ? 'Nobody guessed.' : 'Nobody got it.';
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Blanks({ view }: { view: RoundView }) {
  return (
    <div className="gs-blanks" data-testid="guess.blanks" role="img" aria-label={`The word has ${view.letters.reduce((a, b) => a + b, 0)} letters`}>
      {view.shown.map((word, wi) => (
        <span className="gs-word" key={wi}>
          {word.map((c, li) => (
            <span className={`gs-tile${c ? ' is-given' : ''}`} key={li}>
              {c ?? ''}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

function Warmth({ warmth }: { warmth: Warmth }) {
  const at = WARMTHS.indexOf(warmth);
  return (
    <div className={`gs-warm is-${warmth}`} data-testid="guess.warmth" aria-label={`Closest guess: ${WARMTH_WORDS[warmth]}`}>
      <span className="gs-warm-bar" aria-hidden="true">
        {WARMTHS.slice(1).map((w, i) => (
          <span key={w} className={i + 1 <= at ? 'is-on' : ''} />
        ))}
      </span>
      <span className="gs-warm-word">{WARMTH_WORDS[warmth]}</span>
    </div>
  );
}

function Peeked() {
  const until = peekUntil.use((v) => v);
  if (!until) return null;
  // Read at the moment of drawing, held nowhere else: when the time is up this is not rendered, so the word leaves the page.
  const word = peekWord();
  return word ? (
    <p className="gs-peek" data-testid="guess.peeked" role="status">
      Your word: <strong>{word}</strong>
    </p>
  ) : null;
}

function Panel({ view, result }: { view: RoundView; result: boolean }) {
  const now = useNow(!result && view.endsAt !== null);
  const safe = useStreamSafe();
  const left = view.endsAt === null ? null : secondsLeft(view.endsAt, now);
  const noId = view.turnedAway['no-player'];
  const peekChoice = useChoice('guess.peek');
  const canPeek = peekWhy() === null;
  const hidden = peekChoice !== 'allow' || safe;
  return (
    <aside className={`gs-panel${result ? ' is-result' : ''}${view.winner ? ' is-won' : ''}`} data-testid="guess.panel" aria-label={result ? 'Guessing game result' : 'Guessing game going'}>
      <header className="gs-head">
        <span className="gs-tag">
          {!result && <span className="gs-dot" aria-hidden="true" />}
          {result ? 'Reveal' : 'Guess'}
        </span>
        <span className="gs-count" data-testid="guess.players">{plural(view.players, 'person', 'people')} guessing</span>
        {left !== null && !result && <span className="gs-time" data-testid="guess.time">{clock(left)}</span>}
      </header>
      {left !== null && !result && view.endsAt !== null && <span className="gs-drain" style={{ transform: `scaleX(${Math.max(0, Math.min(1, (view.endsAt - now) / (view.endsAt - view.startedAt)))})` }} aria-hidden="true" />}
      {result ? (
        <>
          <p className="gs-was">The word was</p>
          <p className="gs-answer" data-testid="guess.answer" aria-live="polite">
            {Array.from(view.answer ?? '').map((c, i) => (
              <span key={i} className="gs-flip" style={{ animationDelay: `${i * 45}ms` }}>
                {c === ' ' ? ' ' : c}
              </span>
            ))}
          </p>
          <p className="gs-line" data-testid="guess.resultLine" role="status">{resultLine(view)}</p>
          <p className="gs-note">{plural(view.guesses, 'guess', 'guesses')} from {plural(view.players, 'person', 'people')}.</p>
        </>
      ) : (
        <>
          <Blanks view={view} />
          <Warmth warmth={view.warmth} />
          <p className="gs-note" data-testid="guess.guesses">
            {plural(view.guesses, 'guess', 'guesses')} so far.{' '}
            {view.winner ? <strong>{view.winner.name ?? 'Someone'} got it.</strong> : null}
          </p>
          <Peeked />
          {hidden && <p className="gs-note">The word stays hidden while the round runs.</p>}
          {noId > 0 && (
            <p className="gs-note" data-testid="guess.turned">
              {noId === 1 ? '1 guess had' : `${noId} guesses had`} no player id and {noId === 1 ? 'was' : 'were'} turned away.{' '}
              <button type="button" className="gs-link" onClick={() => openHelp('guess')}>Why?</button>
            </p>
          )}
        </>
      )}
      <footer className="gs-foot">
        {result ? (
          <>
            <button type="button" className="ui-btn ui-btn-primary" data-testid="guess.close" onClick={closeRound}>Close</button>
            <button
              type="button"
              className="ui-btn"
              data-testid="guess.again"
              onClick={() => {
                closeRound();
                openGuessSetup();
              }}
            >
              Another round
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ui-btn" data-testid="guess.hint" disabled={view.hintsLeft === 0} onClick={giveHint}>
              Hint ({view.hintsLeft})
            </button>
            {canPeek && (
              <button type="button" className="ui-btn" data-testid="guess.peek" onClick={peek}>
                Peek
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-primary" data-testid="guess.reveal" onClick={() => endRound('revealed')}>Reveal</button>
            <button type="button" className="ui-btn ui-btn-quiet" data-testid="guess.throw" onClick={closeRound}>Throw it away</button>
          </>
        )}
      </footer>
    </aside>
  );
}

function SetupBox() {
  const hint = useId();
  const safe = useStreamSafe();
  const [word, setWord] = useState('');
  const [shown, setShown] = useState(false);
  const [seconds, setSeconds] = useState(lastLength);
  const [note, setNote] = useState('');
  const ending = useChoice('guess.ending');
  const names = useChoice('guess.winnerName');
  const jarOn = isFeatureOn('prompt-jar');
  const inJar = jar.use((s) => s.slips.length);
  const cleaned = cleanSetup({ word, seconds: seconds || null, ending });
  // Under Stream-safe the word is dots until you say "Show it", so a window that is being shared never shows it by surprise.
  const visible = !safe || shown;
  const take = (w: string, from: string) => {
    setWord(w.slice(0, WORD_MAX));
    setNote(safe ? `${from} Stream-safe is on, so it is hidden. Press Show to see it.` : from);
  };
  const go = () => {
    if (!cleaned.ok) return;
    rememberLength(seconds);
    const raw = cleaned.setup;
    withAudienceOn(() => {
      const r = startRound(raw);
      if (r.ok) closeGuessSetup();
    });
  };
  return (
    <Modal title="Start a guessing game" size="md" onClose={closeGuessSetup} initialFocus="[data-autofocus]" describedBy={hint}>
      <form
        className="gs-form"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <p className="ui-pref-intro" id={hint}>
          Pick a secret word and draw it. Chat guesses, Frameling checks. The word is hidden from the moment the round starts until the reveal.
        </p>
        <label className="ui-field">
          <span>What will you draw?</span>
          <span className="gs-wordrow">
            <input type={visible ? 'text' : 'password'} data-autofocus data-testid="guess.setup.word" value={word} maxLength={WORD_MAX} placeholder="A cat in a hat" autoComplete="off" spellCheck={false} onChange={(e) => (setWord(e.target.value), setNote(''))} />
            {safe && (
              <button type="button" className="ui-btn ui-btn-quiet" data-testid="guess.setup.show" aria-pressed={shown} onClick={() => setShown((s) => !s)}>
                <Icon name={shown ? 'eye-off' : 'eye'} size={14} /> {shown ? 'Hide' : 'Show'}
              </button>
            )}
          </span>
        </label>
        <div className="gs-pick">
          <button type="button" className="ui-btn" data-testid="guess.setup.pick" onClick={() => take(pickWord(Math.random, [word]), 'Picked one for you.')}>
            Pick one for me
          </button>
          {jarOn && (
            <button
              type="button"
              className="ui-btn"
              data-testid="guess.setup.jar"
              disabled={inJar === 0}
              onClick={() => {
                const slip = pullOne();
                if (!slip) return;
                // Used as the word, so it is done with: it does not sit in your hand on the jar card.
                passOn();
                take(slip.text, 'Pulled from the jar.');
              }}
            >
              From the jar ({inJar})
            </button>
          )}
        </div>
        {note && <p className="gs-small" role="status" data-testid="guess.setup.note">{note}</p>}
        <fieldset className="gs-lengths">
          <legend>How long?</legend>
          {LENGTHS.map((l) => (
            <label key={l.seconds} className={`gs-length${seconds === l.seconds ? ' is-on' : ''}`}>
              <input type="radio" name="gs-length" checked={seconds === l.seconds} onChange={() => setSeconds(l.seconds)} />
              {l.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="gs-lengths">
          <legend>The round ends</legend>
          {(['first', 'timer'] as const).map((v) => (
            <label key={v} className={`gs-length${ending === v ? ' is-on' : ''}`}>
              <input type="radio" name="gs-ending" data-testid={`guess.setup.ending.${v}`} checked={ending === v} onChange={() => setChoice('guess.ending', v)} />
              {v === 'first' ? 'When someone gets it' : 'When the time is up'}
            </label>
          ))}
        </fieldset>
        <label className="gs-check">
          <input type="checkbox" data-testid="guess.setup.names" checked={names === 'show'} onChange={(e) => setChoice('guess.winnerName', e.target.checked ? 'show' : 'hide')} />
          Show the winner's name in the result
        </label>
        <p className="gs-small">
          Your stream tool sends each guess to the actions door as <code>guess.send</code>, with the guess and a player id.{' '}
          <button type="button" className="gs-link" onClick={() => openHelp('guess')}>How to set that up</button>
        </p>
        <div className="ui-choice-foot">
          {!cleaned.ok && <span className="gs-why" data-testid="guess.setup.why">{cleaned.reason}</span>}
          <button type="button" className="ui-btn" onClick={closeGuessSetup}>Cancel</button>
          <button type="submit" className="ui-btn ui-btn-primary" data-testid="guess.setup.start" disabled={!cleaned.ok}>Start the round</button>
        </div>
      </form>
    </Modal>
  );
}

export function GuessLayer() {
  const screen = guessScreen.use((s) => s);
  const setup = guessSetupOpen.use((s) => s);
  return (
    <>
      {screen.phase !== 'none' && <Panel view={screen.view} result={screen.phase === 'result'} />}
      {setup && <SetupBox />}
    </>
  );
}
