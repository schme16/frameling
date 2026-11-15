// What you made, in his room: your newest drawings on his wall and your newest sprite as a toy on his floor. They are
// small pictures kept at the moment you saved (see made.ts), so this draws a few <img>s and nothing else: no timer, no
// canvas, no render. Names go through shownMade, so while stream-safe is on they are stand-ins.
import { useMemo, useState } from 'react';
import { useChoice } from '../core/choices';
import { useStreamSafe } from '../core/streamSafe';
import { madeStore, shownMade, toyOf, wallOf, YOURS_CHOICE } from './made';

type Shown = ReturnType<typeof shownMade>[number];

/** How far along the room each frame hangs (0 is the left wall, 1 the right). Clear of the window, which is at 0.36. */
export const WALL_X = [0.62, 0.9, 0.14] as const;
/** How far along the room the toy lies. Just right of his bed, so he can reach it from the middle. */
export const TOY_X = 0.34;

/** What is in his room right now. Nothing at all until you have made something, and nothing again if you switch it off. */
export function useYours(): { wall: Shown[]; toy: Shown | undefined } {
  const list = madeStore.use((s) => s.list);
  const on = useChoice<'show' | 'hide'>(YOURS_CHOICE) !== 'hide';
  // Drawn again when stream-safe flips, so a name is never left showing.
  const safe = useStreamSafe();
  return useMemo(() => {
    if (!on) return { wall: [], toy: undefined };
    const toy = toyOf(list);
    return { wall: shownMade(wallOf(list)), toy: toy ? shownMade([toy])[0] : undefined };
    // `safe` is read through shownMade, so it has to be a dependency.
  }, [list, on, safe]);
}

/** Your drawings, hung on his wall. */
export function RoomWall({ items, onPress }: { items: Shown[]; onPress: (kind: 'wall') => void }) {
  return (
    <>
      {items.map(({ made, name, picture }, i) => (
        <button
          key={made.id}
          type="button"
          className="qp-frame"
          style={{ ['--x' as string]: WALL_X[i % WALL_X.length] }}
          title={`${name}, made by you`}
          aria-label={`${name}, on his wall`}
          onClick={() => onPress('wall')}
        >
          {picture ? <img src={picture} alt="" draggable={false} /> : <span className="qp-blank" />}
        </button>
      ))}
    </>
  );
}

/** Your sprite, as a toy on his floor. It bounces while he plays with it, and when you press it. */
export function RoomToy({ item, playing, onPress }: { item: Shown; playing: boolean; onPress: (kind: 'toy') => void }) {
  const [poked, setPoked] = useState(0);
  return (
    <button
      type="button"
      className={`qp-toy${playing ? ' is-playing' : ''}${poked ? ' is-poked' : ''}`}
      style={{ ['--x' as string]: TOY_X }}
      title={`${item.name}, a toy for him`}
      aria-label={`${item.name}, his toy. Press it to give it a push.`}
      onClick={() => {
        setPoked((n) => n + 1);
        onPress('toy');
      }}
      onAnimationEnd={() => setPoked(0)}
    >
      {item.picture ? <img src={item.picture} alt="" draggable={false} /> : <span className="qp-blank" />}
    </button>
  );
}
