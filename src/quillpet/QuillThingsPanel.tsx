// Quill's things: the drawings you've given him. Its own panel, so his corner stays about him and the collection has
// room to grow. He keeps a little picture of each one, never the drawing itself.
import { useState } from 'react';
import { QuillSays, useShowQuill } from '../ui/mascot';
import { line } from '../ui/mascot/lines';
import { giveToQuill } from './give';
import { letGoOf, petStore } from './store';
import { noteFuss } from './watch';
import './quillpet.css';

/** "today", "yesterday", "3 days ago": when he was given it. */
export function sayWhen(givenAt: number, now = Date.now()): string {
  const day = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.max(0, Math.round((day(now) - day(givenAt)) / 86400000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks ago`;
  return `about ${Math.round(days / 30)} months ago`;
}

export function QuillThingsPanel() {
  const things = petStore.use((s) => s.things);
  const showQuill = useShowQuill();
  const [said, setSaid] = useState<string | null>(null);

  const give = () => void giveToQuill().then((got) => got && setSaid(line('pet.given')));

  return (
    <div className="cv-panel cv-options qt-panel" data-help="quill-things">
      <div className="qt-top">
        <p className="qt-count">{things.length === 0 ? 'Nothing yet' : things.length === 1 ? '1 thing' : `${things.length} things`}</p>
        <button type="button" className="ui-btn qp-give" onClick={give} title="He keeps a little picture of the frame you are on">
          Give him this
        </button>
      </div>

      {said && showQuill && (
        <QuillSays anim="cheer" then="idle" size={56} whenHidden={null}>
          {said}
        </QuillSays>
      )}

      {things.length === 0 ? (
        <p className="qp-none">Press <b>Give him this</b> and Quill keeps a little picture of the frame you're on. He'll hang on to it for as long as you like.</p>
      ) : (
        <ul className="qp-thing-list qt-list" aria-label="Things you have given Quill">
          {[...things].reverse().map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="qp-thing qt-thing"
                title={`${t.name}, given ${sayWhen(t.givenAt)}`}
                onClick={() => {
                  noteFuss();
                  setSaid(line('pet.thing', { name: t.name }));
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
      )}
    </div>
  );
}
