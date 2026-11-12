// Setting how a clip plays: which way (forward, backward, back and forth) and how often (forever, N times, once).
// One list of words shared by the clip's right-click menu, the Clip flow panel and the palette commands.
import { useState } from 'react';
import type { Clip, ClipDirection } from '../core/format';
import { CLIP_DIRECTIONS, DIRECTION_WORDS, MAX_REPEAT, clipDirection, clipPlays, isBackAndForth, repeatWords } from '../core/clipPlay';
import * as ops from './ops';
import type { MenuItem } from './Menu';

/** The wording, with the industry term second where there is one. */
export const DIRECTION_HELP: Record<ClipDirection, string> = {
  forward: 'Forward',
  reverse: 'Backward (reverse)',
  pingpong: 'Back and forth (ping-pong)',
  'pingpong-reverse': 'Back and forth, from the end',
};

export function repeatLabel(c: Pick<Clip, 'loop' | 'repeat' | 'direction'>): string {
  return repeatWords(clipDirection(c), clipPlays(c));
}

/** Said under Repeat for a back and forth clip, where each direction counts as one. */
export const BOUNCE_HINT = 'Repeat 3 = there, back, there';

/** The number box in the menu: type how many times and press Enter. */
function TimesBox({ clip }: { clip: Clip }) {
  const n = clipPlays(clip);
  const bounce = isBackAndForth(clipDirection(clip));
  const [v, setV] = useState(Number.isFinite(n) ? String(n) : '3');
  const apply = () => {
    const k = Math.round(Number(v));
    if (k >= 1 && k <= MAX_REPEAT) ops.setClipRepeat(clip.id, k);
  };
  return (
    <label className="tl-menu-times">
      <span>Repeat</span>
      <input
        type="number"
        min={1}
        max={MAX_REPEAT}
        value={v}
        aria-label="Number of times"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') apply();
        }}
        onBlur={apply}
      />
      <span>{bounce ? 'ways' : 'times'}</span>
    </label>
  );
}

/** Menu entries for a clip's direction and repeat. */
export function clipPlayItems(c: Clip): MenuItem[] {
  const dir = clipDirection(c);
  const plays = clipPlays(c);
  const bounce = isBackAndForth(dir);
  return [
    { heading: 'Plays' },
    ...CLIP_DIRECTIONS.map<MenuItem>((d) => ({ label: DIRECTION_HELP[d], checked: dir === d, onClick: () => void ops.setClipDirection(c.id, d) })),
    { heading: bounce ? BOUNCE_HINT : 'Repeat' },
    { label: 'Forever (loops)', checked: plays === Infinity, onClick: () => void ops.setClipRepeat(c.id, 'forever') },
    { label: bounce ? 'There only (then holds the last frame)' : 'Once (then holds the last frame)', checked: plays === 1, onClick: () => void ops.setClipRepeat(c.id, 1) },
    { node: <TimesBox clip={c} /> },
  ];
}

/** Two drop-downs for a clip's direction and repeat, for panels. */
export function ClipPlayFields({ clip }: { clip: Clip }) {
  const dir = clipDirection(clip);
  const plays = clipPlays(clip);
  const mode = plays === Infinity ? 'forever' : plays === 1 ? 'once' : 'times';
  const bounce = isBackAndForth(dir);
  return (
    <>
      <label className="fl-trigger-name">
        <span>Plays</span>
        <select value={dir} aria-label="Which way the clip plays" onChange={(e) => void ops.setClipDirection(clip.id, e.target.value as ClipDirection)}>
          {CLIP_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {DIRECTION_HELP[d]}
            </option>
          ))}
        </select>
      </label>
      <label className="fl-trigger-name">
        <span>Repeat</span>
        <select
          value={mode}
          aria-label="How often the clip plays"
          onChange={(e) => {
            const v = e.target.value;
            void ops.setClipRepeat(clip.id, v === 'forever' ? 'forever' : v === 'once' ? 1 : Math.max(2, Number.isFinite(plays) ? plays : 2));
          }}
        >
          <option value="forever">Forever</option>
          <option value="once">{bounce ? 'There only (then holds the last frame)' : 'Once (then holds the last frame)'}</option>
          <option value="times">{bounce ? 'A number of ways (3 = there, back, there)' : 'A number of times'}</option>
        </select>
      </label>
      {mode === 'times' && (
        <label className="fl-trigger-name">
          <span>{bounce ? 'Ways' : 'Times'}</span>
          <input
            type="number"
            min={2}
            max={MAX_REPEAT}
            value={plays}
            aria-label="Number of times"
            onChange={(e) => {
              const k = Math.round(Number(e.target.value));
              if (k >= 1 && k <= MAX_REPEAT) ops.setClipRepeat(clip.id, k);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
      )}
    </>
  );
}

export { DIRECTION_WORDS };
