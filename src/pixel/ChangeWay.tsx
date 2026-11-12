// "Change how this sprite is built": the four ways, what each would do to this sprite, and why one cannot be chosen.
import { useMemo, useState } from 'react';
import type { SpriteWay } from '../core/format';
import { store } from '../core/store';
import { Modal, mountModal } from '../io/mount';
import { QuillSays } from '../ui/mascot';
import { line } from '../ui/mascot/lines';
import { changeWay } from './wayOps';
import { wayChoices } from './way';
import { WayDiagram } from './WayDiagrams';
import './way.css';

function ChangeWay({ close }: { close: () => void }) {
  const choices = useMemo(() => wayChoices(store().get().doc), []);
  const now = choices.find((c) => c.current)?.way ?? 'animation';
  const [pick, setPick] = useState<SpriteWay>(now);
  const go = () => {
    if (pick === now) return close();
    if (changeWay(pick).ok) close();
  };
  const chosen = choices.find((c) => c.way === pick);
  return (
    <Modal title="Change how this sprite is built" onClose={close} wide className="px-changeway">
      <div className="io-body">
        <QuillSays side="left" anim="think" size={56}>
          {line('pixel.way.change')}
        </QuillSays>
        <div className="px-way-cards px-way-cards-detail" role="radiogroup" aria-label="How this sprite is built">
          {choices.map((c) => (
            <button
              key={c.way}
              type="button"
              role="radio"
              aria-checked={pick === c.way}
              aria-disabled={!!c.off}
              className={`px-way-card${pick === c.way ? ' is-chosen' : ''}${c.off ? ' is-off' : ''}`}
              data-way={c.way}
              title={c.off}
              onClick={() => !c.off && setPick(c.way)}
              onDoubleClick={() => !c.off && c.way !== now && changeWay(c.way).ok && close()}
            >
              <span className="px-way-art">
                <WayDiagram way={c.way} size={130} />
              </span>
              <strong>{c.name}</strong>
              <span className="px-way-term">{c.current ? `${c.term}. This is how it is built now.` : c.term}</span>
              <span className="px-way-blurb">{c.detail}</span>
            </button>
          ))}
        </div>
        {chosen?.off ? (
          <p className="px-way-off" role="status">
            {chosen.off}
          </p>
        ) : (
          choices.filter((c) => c.off).length > 0 && (
            <p className="px-way-off px-way-off-quiet" role="status">
              {choices
                .filter((c) => c.off)
                .map((c) => `${c.name}: ${c.off}`)
                .join(' ')}
            </p>
          )
        )}
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" data-autofocus="" disabled={pick === now} onClick={go}>
          Change it
        </button>
      </div>
    </Modal>
  );
}

/** Opens the change dialog for the sprite that is open. */
export function openChangeWay(): void {
  mountModal((close) => <ChangeWay close={close} />);
}
