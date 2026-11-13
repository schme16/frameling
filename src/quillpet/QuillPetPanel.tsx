// Quill's panel: where he lives when the pet is turned on. He gets on with whatever he's doing, you can stroke him,
// and it shows how well you two know each other. Nothing here nags, and nothing here goes down.
import { useEffect, useRef, useState } from 'react';
import { Quill, useShowQuill } from '../ui/mascot';
import { line, lines } from '../ui/mascot/lines';
import { sinceInput } from '../ui/mascot/runtime';
import { useStore } from '../core/store';
import { daysAway, petStore, tellQuill } from './store';
import { MOOD_WORDS, moodNow, nextStage, stageOf, stageProgress, type Mood } from './model';
import { noteFuss, sinceEdit, sinceFinished, sinceFuss } from './watch';
import './quillpet.css';

/** "a day", "3 days", "about 2 weeks": how long he'd say it's been. */
export function sayDays(days: number): string {
  if (days <= 1) return 'a day';
  if (days < 14) return `${days} days`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks`;
  return `about ${Math.round(days / 30)} months`;
}

/** Re-reads every second, because how he's feeling depends on how long you've been still. */
function useTick(ms = 1000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

export function QuillPetPanel() {
  useTick();
  const pet = petStore.use((s) => s);
  const showQuill = useShowQuill();
  const [said, setSaid] = useState<string>(() => line('pet.hello'));
  const away = useRef(daysAway()).current;

  const { mood, anim } = moodNow({
    sinceInput: sinceInput(),
    sinceEdit: sinceEdit(),
    playing: false,
    justFinished: sinceFinished() < 6000,
    justFussed: sinceFuss() < 4000,
    daysAway: away,
  });

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
    noteFuss();
    const all = lines('pet.petted');
    setSaid(all[Math.floor(Math.random() * all.length)]);
  };

  const feed = () => {
    if (!colour) return;
    tellQuill({ kind: 'fed', colour });
    noteFuss();
    setSaid(line('pet.fed'));
  };

  return (
    <div className="cv-panel cv-options qp-panel" data-help="quill-pet">
      <div className="qp-stage">
        {showQuill ? (
          <button type="button" className="qp-pat" onClick={pat} title="Give him a stroke" aria-label="Give Quill a stroke">
            <Quill anim={anim} then="idle" size={112} />
          </button>
        ) : (
          <p className="qp-away">Quill is switched off in Preferences, so he isn't here. Turn Show Quill back on and he'll come straight back.</p>
        )}
        {showQuill && <p className="qp-mood">{MOOD_WORDS[mood as Mood]}</p>}
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
