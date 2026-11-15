// The prompt jar in the title bar: a small chip with a number on it, and the card that hangs from it. The chip shows how
// many are waiting and never a word. The words are only ever on the card, and the card only opens when the streamer
// opens it, so nothing a viewer sends can land in front of a camera. A prompt pulled out is hidden behind "Show it"
// while Stream-safe is on.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HIDDEN, scrubText, useStreamSafe } from '../core/streamSafe';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { usePopover } from '../ui/popover';
import { playCue } from '../ui/sounds';
import { toast } from '../ui/toast';
import { audience } from '../audience';
import { currentChoice } from '../core/choices';
import { emptyJar, jar, passOn, pullOne, putBack, addToJar } from './jar';
import { hideJar, jarCardOpen, jarFeatureOn, jarFocusAdd } from './card';
import { JAR_MAX, cleanPrompt, promptsFromText } from './logic';
import { useSyncExternalStore } from 'react';
import './jar.css';

/** Takes one out, with a little sound, and says nothing on screen: the card shows it. */
export function pullFromJar(): boolean {
  const got = pullOne();
  if (got) playCue('tick');
  return !!got;
}

/** Empties the jar in one click, and says how many went. */
export function emptyTheJar(): number {
  const n = emptyJar();
  toast(n ? `Emptied the prompt jar (${n}).` : 'The prompt jar was already empty.', { quill: null, sound: null });
  return n;
}

function Card({ at }: { at: React.RefObject<HTMLElement | null> }) {
  const s = jar.use((v) => v);
  const safe = useStreamSafe();
  const ref = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const focus = jarFocusAdd.use((v) => v);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [shown, setShown] = useState<number | null>(null);
  const [shaking, setShaking] = useState(false);
  usePopover(ref, hideJar);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || at.current?.contains(t)) return;
      hideJar();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [at]);
  const [style, setStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    const place = () => {
      const box = at.current?.getBoundingClientRect();
      if (box) setStyle({ top: box.bottom + 6, right: Math.max(8, window.innerWidth - box.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [at]);
  useEffect(() => {
    if (focus > 0) field.current?.focus();
  }, [focus]);
  // A new slip gives the jar a little shake, then the slip slides up.
  const handId = s.hand?.id ?? null;
  useEffect(() => {
    if (handId === null) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 520);
    return () => clearTimeout(t);
  }, [handId]);
  const n = s.slips.length;
  const hidden = safe && s.hand !== null && shown !== s.hand.id;
  const add = (raw: string) => {
    const words = promptsFromText(raw);
    if (words.length === 0) return setNote(raw.trim() ? 'That needs a few words with letters in them.' : '');
    const results = words.map((w) => addToJar(w));
    const added = results.filter((r) => r === 'added').length;
    setDraft('');
    setNote(added === words.length ? (added === 1 ? 'Added to the jar.' : `Added ${added} to the jar.`) : added > 0 ? `Added ${added}. The rest were repeats or the jar is full.` : results.includes('full') ? 'The jar is full. Pull some out or empty it.' : 'That one is already in the jar.');
  };
  const keep = currentChoice('promptjar.keep') === 'keep';
  return (
    <div className="ui-menu jar-card" role="dialog" aria-label="Prompt jar" ref={ref} style={style} data-testid="promptjar.card">
      <h2 className="jar-title">Prompt jar</h2>
      <p className="jar-sub">Your audience drops ideas in here. Only you can see them, and nothing shows until you pull one out.</p>
      <div className="jar-stage">
        <div className={`jar-art${shaking ? ' jar-shake' : ''}`} aria-hidden="true">
          <Icon name="jar" size={72} />
          {n > 0 && <span className="jar-slips" />}
        </div>
        <p className="jar-count" data-testid="promptjar.count" role="status">
          {n === 0 ? 'The jar is empty.' : n === 1 ? '1 prompt waiting.' : `${n} prompts waiting.`}
          {n >= JAR_MAX && ' It is full.'}
        </p>
      </div>
      {s.hand && (
        <div className="jar-slip" key={s.hand.id} data-testid="promptjar.slip">
          {hidden ? (
            <>
              <p className="jar-slip-text jar-slip-hidden" aria-label="Hidden while Stream-safe is on">
                {HIDDEN}
              </p>
              <p className="jar-note">Stream-safe is on, so it stays hidden until you say.</p>
              <button type="button" className="ui-btn" onClick={() => setShown(s.hand!.id)}>
                Show it
              </button>
            </>
          ) : (
            <p className="jar-slip-text" data-testid="promptjar.text">
              {scrubText(s.hand.text)}
            </p>
          )}
        </div>
      )}
      <div className="jar-actions">
        <button type="button" className="ui-btn ui-btn-primary jar-pull" disabled={n === 0} onClick={pullFromJar} data-testid="promptjar.pull">
          {s.hand ? 'Pull another' : 'Pull one out'}
        </button>
        {s.hand && (
          <>
            <button type="button" className="ui-btn" onClick={passOn} data-testid="promptjar.pass">
              Pass on it
            </button>
            <button type="button" className="ui-btn" onClick={putBack}>
              Put it back
            </button>
          </>
        )}
      </div>
      <form
        className="jar-add"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <input
          ref={field}
          className="jar-input"
          value={draft}
          maxLength={400}
          placeholder="Add one of your own"
          aria-label="Add a prompt of your own"
          onChange={(e) => (setDraft(e.target.value), setNote(''))}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/\r?\n/.test(text.trim())) {
              e.preventDefault();
              add(text);
            }
          }}
        />
        <button type="submit" className="ui-btn" disabled={!cleanPrompt(draft)}>
          Add
        </button>
      </form>
      {note && (
        <p className="jar-note" role="status">
          {note}
        </p>
      )}
      <p className="jar-note">{keep ? 'Kept on this computer for next time: just the words, no names. Empty the jar wipes them.' : 'Kept in memory only. Closing Frameling empties the jar.'}</p>
      <div className="jar-actions">
        <button type="button" className="ui-btn" disabled={n === 0 && !s.hand} onClick={emptyTheJar} data-testid="promptjar.empty">
          Empty the jar
        </button>
        <button type="button" className="ui-btn ui-btn-quiet jar-learn" onClick={() => (hideJar(), openHelp('prompt-jar'))}>
          <Icon name="help" size={14} /> How the jar works
        </button>
      </div>
    </div>
  );
}

/** The chip in the title bar. It is there while audience features are on, or while the jar still has something in it. */
export function JarChip() {
  const on = jarFeatureOn.use((v) => v);
  const open = jarCardOpen.use((v) => v);
  const s = jar.use((v) => v);
  const live = useSyncExternalStore(audience.subscribe, () => audience.isOn());
  const chip = useRef<HTMLDivElement>(null);
  if (!on || !(live || s.slips.length > 0 || s.hand || open)) return null;
  const n = s.slips.length;
  return (
    <div className="jar-chip" ref={chip} data-testid="promptjar.chip" data-help="prompt-jar">
      <button type="button" className="jar-btn" aria-haspopup="dialog" aria-expanded={open} data-tip="Prompt jar: ideas from your audience. Only you can see them." onClick={() => jarCardOpen.set(!open)}>
        <Icon name="jar" size={16} />
        Jar
        {n > 0 && (
          <span className="jar-n" aria-label={`${n} waiting`}>
            {n}
          </span>
        )}
      </button>
      {open && <Card at={chip} />}
    </div>
  );
}
