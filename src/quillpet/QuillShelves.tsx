// Quill's shelves, as two tabs of his house: the drawings you have given him (His things) and the presents he has made
// you (Presents). Each reads only the pet store. He keeps a little picture of each thing, never the drawing itself.
import { useState } from 'react';
import { QuillSays, useShowQuill } from '../ui/mascot';
import { line } from '../ui/mascot/lines';
import { giveToQuill } from './give';
import { whenGiven } from './whileAway';
import { openPresentDoc } from './gifts';
import { letGoOf, letGoOfPresentNamed, petStore } from './store';
import { noteFuss } from './watch';
import './quillpet.css';

/** "today", "yesterday", "on 3 March": when he was given it. A date, never "3 days ago" (see whenGiven). */
export const sayWhen = whenGiven;

/** His things: the drawings you have given him, and the way to give him another. */
export function QuillThings() {
  const things = petStore.use((s) => s.things);
  const showQuill = useShowQuill();
  const [said, setSaid] = useState<string | null>(null);

  const give = () => void giveToQuill().then((got) => got && setSaid(line('pet.given')));

  return (
    <div className="qt-panel" data-help="quill-things">
      <div className="qt-top">
        <p className="qt-count">{things.length === 0 ? 'Nothing given yet' : things.length === 1 ? '1 thing given' : `${things.length} things given`}</p>
        <button type="button" className="ui-btn qp-give" onClick={give} title="He keeps a little picture of the frame you are on">
          Give him this drawing
        </button>
      </div>

      {said && showQuill && (
        <QuillSays surface="house" surfaceId="shelves" anim="cheer" then="idle" size={56} whenHidden={null}>
          {said}
        </QuillSays>
      )}

      {things.length === 0 ? (
        <p className="qp-none">Press <b>Give him this drawing</b> and Quill keeps a little picture of the frame you're on. He'll hang on to it for as long as you like.</p>
      ) : (
        <>
          <h3 className="qt-shelf-title">Yours, that he keeps</h3>
          <ul className="qp-thing-list qt-list" aria-label="Things you have given Quill">
            {[...things].reverse().map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="qp-thing qt-thing"
                  title={`${t.name}, given ${sayWhen(t.givenAt)}`}
                  onClick={() => {
                    noteFuss('given');
                    setSaid(line('pet.thing', { name: t.name, when: whenGiven(t.givenAt) }));
                  }}
                >
                  <img src={t.picture} alt={t.name} />
                </button>
                <button type="button" className="qp-thing-back" title={`Give ${t.name} back`} aria-label={`Give ${t.name} back`} onClick={() => letGoOf(t.id)}>
                  x
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Presents: what he has made you, newest first. Opens as a drawing of your own. */
export function QuillPresents() {
  const presents = petStore.use((s) => s.presents);
  const showQuill = useShowQuill();
  const [said, setSaid] = useState<string | null>(null);

  return (
    <div className="qt-panel" data-help="quill-presents">
      <section className="qt-shelf" aria-label="Presents from Quill">
        <h3 className="qt-shelf-title">From Quill</h3>
        {presents.length === 0 ? (
          <p className="qp-none qt-shelf-none">{line('pet.present.none')}</p>
        ) : (
          <ul className="qp-thing-list qt-list" aria-label="Presents Quill has made you">
            {[...presents].reverse().map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`qp-thing qt-thing${p.opened ? '' : ' is-new'}`}
                  title={`${p.name} in crayon, made ${sayWhen(p.madeAt)}. Opens as a drawing of your own.`}
                  onClick={() => void openPresentDoc(p.id).then((went) => went && setSaid(line('pet.present.opened')))}
                >
                  <img src={p.picture} alt={`${p.name} in crayon`} />
                  {!p.opened && <span className="qt-new" aria-label="Not opened yet" />}
                </button>
                <button type="button" className="qp-thing-back" title={`Let ${p.name} go`} aria-label={`Let ${p.name} go`} onClick={() => letGoOfPresentNamed(p.id)}>
                  x
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {said && showQuill && (
        <QuillSays surface="house" surfaceId="shelves" anim="cheer" then="idle" size={56} whenHidden={null}>
          {said}
        </QuillSays>
      )}
    </div>
  );
}
