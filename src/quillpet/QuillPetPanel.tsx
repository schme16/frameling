// Quill's home: the one panel where he lives when the pet is turned on, called Quill everywhere. He gets on with
// whatever he's doing, you can give him a scratch, and it shows how well you two know each other, then his shelves
// (presents from him, things from you) and the way to his lessons. Nothing here nags, and nothing here goes down.
// Each part reads only the stores, so a bigger home (a window of his own) can lay the same parts out as rooms or tabs.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Quill, useQuillElsewhere, useQuillShown, useShowQuill } from '../ui/mascot';
import { showPanel } from '../ui/dock';
import { line, lines } from '../ui/mascot/lines';
import { sinceInput } from '../ui/mascot/runtime';
import { useStore } from '../core/store';
import { daysAway, petStore, tellQuill } from './store';
import { MOOD_WORDS, moodNow, nextStage, stageOf, stageProgress, type Mood } from './model';
import { QuillShelves } from './QuillShelves';
import { SPOT_X, type Spot } from './potter';
import { useQuillClock } from './usePotter';
import { lastFuss, noteFuss, sinceEdit, sinceFinished, sinceFuss } from './watch';
import './quillpet.css';

/** "a day", "3 days", "about 2 weeks": how long he'd say it's been. */
export function sayDays(days: number): string {
  if (days <= 1) return 'a day';
  if (days < 14) return `${days} days`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks`;
  return `about ${Math.round(days / 30)} months`;
}

/** Where along the room a spot is, as a custom property the stylesheet turns into a position. */
const xOf = (spot: Spot): CSSProperties => ({ ['--x' as string]: SPOT_X[spot] });

/** Which way he faces: towards wherever he's just headed, and he keeps that until he's off again. */
function useFacing(spot: Spot): boolean {
  const last = useRef<{ spot: Spot; left: boolean }>({ spot, left: false });
  if (last.current.spot !== spot) last.current = { spot, left: SPOT_X[spot] < SPOT_X[last.current.spot] };
  return last.current.left;
}

/** How he is, his pencils, and how well you two know each other. */
export function QuillHim() {
  const pet = petStore.use((s) => s);
  const showQuill = useShowQuill();
  // His house is the lowest claim on him: a toast, a quest or the hello takes him, and he comes back when it's done.
  const shown = useQuillShown('house');
  const elsewhere = useQuillElsewhere('house');
  const room = useRef<HTMLDivElement>(null);
  const playing = useStore((st) => st.ui.playing);
  const [said, setSaid] = useState<string>(() => line('pet.hello'));
  const away = useRef(daysAway()).current;

  const { mood, anim } = moodNow({
    sinceInput: sinceInput(),
    sinceEdit: sinceEdit(),
    playing: false,
    justFinished: sinceFinished() < 6000,
    justFussed: sinceFuss() < 4000,
    fuss: lastFuss(),
    daysAway: away,
  });

  // Only while he's just being cosy does he potter. Anything louder (you drawing, a fuss, sleepiness) is his mood's.
  const pottering = mood === 'cosy';
  const { potter } = useQuillClock({
    shown,
    playing,
    within: room,
    stepping: pottering,
    ctx: () => ({ hasColours: petStore.get().colours.length > 0, sinceInput: sinceInput() }),
  });
  const spot: Spot = mood === 'asleep' || mood === 'sleepy' ? 'bed' : potter.move.spot;
  const facingLeft = useFacing(spot);

  const colour = useStore((st) => st.ui.color);
  const hasColour = !!colour && !pet.colours.some((c) => c.toLowerCase() === colour.toLowerCase());
  const stage = stageOf(pet.closeness);
  const next = nextStage(pet.closeness);
  const progress = stageProgress(pet.closeness);

  // Back after a break: he says hello before anything else.
  useEffect(() => {
    if (away >= 1) setSaid(line('pet.hello.again', { days: sayDays(away) }));
  }, [away]);

  const pat = () => {
    tellQuill({ kind: 'petted' });
    noteFuss('stroked');
    const all = lines('pet.petted');
    setSaid(all[Math.floor(Math.random() * all.length)]);
  };

  const feed = () => {
    if (!colour) return;
    tellQuill({ kind: 'fed', colour });
    noteFuss('fed');
    setSaid(line('pet.fed'));
  };

  return (
    <div className="qp-him">
      <div className="qp-stage">
        {showQuill ? (
          <div className="qp-room" ref={room} data-spot={spot}>
            <span className="qp-window" style={xOf('window')} aria-hidden="true" />
            <span className="qp-bed" style={xOf('bed')} aria-hidden="true" />
            <span className="qp-desk" style={xOf('desk')} aria-hidden="true" />
            <span className="qp-bowl" style={xOf('bowl')} aria-hidden="true" />
            {elsewhere ? (
              <p className="qp-away qp-out">Quill's out helping with something, so his house is quiet for a moment. He'll be right back.</p>
            ) : (
              <div className="qp-him-at" style={xOf(spot)}>
                <button type="button" className="qp-pat" onClick={pat} title="Give him a scratch" aria-label="Give Quill a scratch">
                  <Quill surface="house" anim={pottering ? potter.move.beats : anim} then="idle" size={112} flip={facingLeft} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="qp-away">Quill is switched off in Preferences, so he isn't here. Turn Show Quill back on and he'll come straight back.</p>
        )}
        {showQuill && !elsewhere && <p className="qp-mood">{pottering ? potter.move.words : MOOD_WORDS[mood as Mood]}</p>}
      </div>

      {showQuill && <p className="qp-says">{said}</p>}

      {showQuill && (
        <div className="qp-colours">
          <p className="qp-colours-top">His pencils</p>
          <ul className="qp-swatches" aria-label="The colours in his quills">
            {pet.colours.length === 0 && <li className="qp-none">Draw with a colour and he'll pick it up</li>}
            {pet.colours.slice(-5).map((c) => (
              <li key={c} style={{ background: c }} title={c} />
            ))}
          </ul>
          <button type="button" className="ui-btn qp-feed" onClick={feed} disabled={!hasColour} title={hasColour ? `Give him ${colour}` : 'He already has this one'}>
            Give him this colour
          </button>
        </div>
      )}

      <div className="qp-close">
        <div className="qp-close-top">
          <span className="qp-stage-name">{stage.name}</span>
          <span className="qp-days">{pet.days === 0 ? 'Day one' : pet.days === 1 ? '1 day together' : `${pet.days} days together`}</span>
        </div>
        <div className="qp-bar" role="img" aria-label={next ? `${Math.round(progress * 100)} per cent of the way to ${next.stage.name}` : 'As close as it gets'}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="qp-next">{next ? `${next.toGo} to go until ${next.stage.name.toLowerCase()}` : 'As close as it gets'}</p>
      </div>
    </div>
  );
}

/** The way to the lessons he guides, which keep their own panel because the list is long. */
export function QuillLessons() {
  return (
    <section className="qp-lessons" aria-label="Quests">
      <h3 className="qt-shelf-title">Lessons with Quill</h3>
      <p className="qp-none">Short lessons that teach by doing, with Quill beside you.</p>
      <button type="button" className="ui-btn" onClick={() => showPanel('quests')}>
        Open Quests
      </button>
    </section>
  );
}

/** Quill's home in the right rail: all of him in one tab. */
export function QuillPetPanel() {
  return (
    <div className="cv-panel cv-options qp-panel" data-help="quill-pet">
      <QuillHim />
      <QuillShelves />
      <QuillLessons />
    </div>
  );
}
