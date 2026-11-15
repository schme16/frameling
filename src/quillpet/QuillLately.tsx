// What he got up to, on the Room tab: a short list under him, each with a little picture where there is one. Reads
// only the pet store. It says what he did and nothing about how long it took, and it has no button that needs
// pressing: it is news, not a to-do.
import { useEffect, useState } from 'react';
import { dayKey } from './model';
import { doodleUrl, latelyShowing, TOY_PLACE, SLEPT_PLACE, whenGiven, type Happening, type Lately } from './whileAway';
import { lines } from '../ui/mascot/lines';
import { noteLatelySeen, petStore } from './store';
import type { PetThing } from './model';

/** The words for one thing he did, in his voice. The version is fixed when he did it, so it reads the same every time. */
export function sayHappening(h: Happening, now: number = Date.now()): string {
  const all = (() => {
    switch (h.kind) {
      case 'drew':
        return lines('pet.lately.drew');
      case 'moved':
        return lines('pet.lately.moved', { name: h.name, place: TOY_PLACE[h.to] });
      case 'slept':
        return lines('pet.lately.slept', { place: SLEPT_PLACE[h.spot] });
      case 'watched':
        return lines('pet.lately.watched');
      case 'sorted':
        return lines('pet.lately.sorted');
      case 'found':
        return lines('pet.lately.found');
      case 'remembered':
        return lines('pet.lately.remembered', { name: h.name, when: whenGiven(h.givenAt, now) });
    }
  })();
  return all[h.v % all.length];
}

/** The picture that goes with it, if it has one. */
export function pictureFor(h: Happening, things: readonly PetThing[]): { src: string; alt: string } | undefined {
  if (h.kind === 'drew') return { src: doodleUrl(h.seed, h.colours), alt: 'A drawing Quill did' };
  if (h.kind === 'moved' || h.kind === 'remembered') {
    const t = things.find((x) => x.id === h.thingId);
    return t ? { src: t.picture, alt: t.name } : undefined;
  }
  return undefined;
}

/** The toy he moved, for the room to put where he left it. Only the newest, and only while you still have it. */
export function movedToy(lately: Lately | undefined, things: readonly PetThing[]): { src: string; alt: string; spot: Happening & { kind: 'moved' } } | undefined {
  const h = lately?.did.find((x): x is Happening & { kind: 'moved' } => x.kind === 'moved');
  const t = h && things.find((x) => x.id === h.thingId);
  return h && t ? { src: t.picture, alt: t.name, spot: h } : undefined;
}

export function QuillLately() {
  const pet = petStore.use((s) => s);
  // Snapshot what's showing as the tab opens, so marking it looked at doesn't make it vanish from under you.
  const [shown] = useState(() => latelyShowing(petStore.get(), dayKey(Date.now())));
  useEffect(() => {
    if (shown) noteLatelySeen();
  }, [shown]);
  if (!shown) return null;
  return (
    <section className="qp-lately" aria-label="What Quill got up to">
      <h3 className="qt-shelf-title">What he got up to</h3>
      <ul className="qp-lately-list">
        {shown.did.map((h, i) => {
          const pic = pictureFor(h, pet.things);
          return (
            <li key={`${h.kind}${i}`} className="qp-lately-item" data-kind={h.kind}>
              {pic && <img className="qp-lately-pic" src={pic.src} alt={pic.alt} />}
              <span>{sayHappening(h)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
