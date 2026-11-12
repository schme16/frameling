// Tiny drawn diagrams of the four ways to build a sprite: a slime, a bat and a coin on little boards. Plain SVG with
// crisp edges, coloured from the theme's tokens where it can, so they read in dark and light.
import type { SpriteWay } from '../core/format';

type Rows = readonly string[];
const PAL: Record<string, string> = { K: '#1d1b26', g: '#4fd1a5', d: '#2fa27d', w: '#fffaf0', r: '#ff6f91', p: '#9b7bff', P: '#6b4fd1', y: '#ffc94a', Y: '#f2a91c' };

// Drawn by hand: a round slime with two eyes, a squashed one, and one that looks sideways.
const SLIME_A: Rows = ['..KKKKK..', '.KgggggK.', 'KggKggKgK', 'KgggggggK', 'KgrgggrgK', 'KddddddgK', '.KKKKKKK.'];
const SLIME_B: Rows = ['.........', '..KKKKK..', '.KgggggK.', 'KggKggKgK', 'KgggggggK', 'KddddddgK', 'KKKKKKKKK'];
const SLIME_C: Rows = ['..KKKKK..', '.KgggggK.', 'KgggKggKK', 'KgggggggK', 'KgrgggrgK', 'KddddddgK', '.KKKKKKK.'];
const BAT: Rows = ['p.......p', 'pp.KpK.pp', 'pPpKpKpPp', 'PpppppppP', '.PpPpPpP.', '..P...P..'];
const COIN: Rows = ['..KKKK..', '.KyyyyK.', 'KyyYYyyK', 'KyyYyyyK', 'KyyYYyyK', '.KyyyyK.', '..KKKK..'];

function Sprite({ rows, x, y, s = 1 }: { rows: Rows; x: number; y: number; s?: number }) {
  const out: React.ReactElement[] = [];
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const c = PAL[row[rx]];
      if (c) out.push(<rect key={`${rx}-${ry}`} x={x + rx * s} y={y + ry * s} width={s} height={s} fill={c} />);
    }
  });
  return <g>{out}</g>;
}

/** A little white board with a label tab and a sprite on it. */
function Board({ x, y, w, h, rows, s, hot = false, label }: { x: number; y: number; w: number; h: number; rows: Rows; s: number; hot?: boolean; label?: string }) {
  const sw = rows[0].length * s;
  const sh = rows.length * s;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill="#fffaf0" stroke={hot ? '#ff6f91' : '#1d1b26'} strokeWidth={hot ? 1.6 : 1} />
      <Sprite rows={rows} x={x + (w - sw) / 2} y={y + (h - sh) / 2 + 0.5} s={s} />
      {label && (
        <text x={x + 2} y={y - 1.6} fontSize={4} fontWeight={700} fill="currentColor" opacity={0.85}>
          {label}
        </text>
      )}
    </g>
  );
}

/** One of the four ways, drawn small. `size` is the width in CSS pixels. */
export function WayDiagram({ way, size = 150 }: { way: SpriteWay; size?: number }) {
  return (
    <svg className="px-way-diagram" viewBox="0 0 100 60" width={size} height={size * 0.6} role="img" aria-label={`A little picture of ${way === 'picture' ? 'one picture' : way === 'animation' ? 'an animation on a timeline' : way === 'boards' ? 'frames on boards' : 'sprites on a sheet'}`} shapeRendering="crispEdges">
      {way === 'picture' && <Board x={32} y={6} w={36} h={36} rows={SLIME_A} s={3} />}
      {way === 'animation' && (
        <>
          <Board x={33} y={2} w={34} h={30} rows={SLIME_A} s={2.8} />
          {[SLIME_A, SLIME_B, SLIME_C, SLIME_A].map((r, i) => (
            <Board key={i} x={8 + i * 22} y={38} w={18} h={18} rows={r} s={1.5} hot={i === 0} />
          ))}
        </>
      )}
      {way === 'boards' && (
        <>
          <Board x={4} y={14} w={25} h={30} rows={SLIME_A} s={2} label="1" />
          <Board x={33} y={14} w={25} h={30} rows={SLIME_B} s={2} label="2" />
          <Board x={62} y={14} w={25} h={30} rows={SLIME_C} s={2} label="3" />
          <path d="M91 24l6 5-6 5z" fill="#9b7bff" stroke="none" />
        </>
      )}
      {way === 'sheet' && (
        <>
          <Board x={2} y={14} w={20} h={26} rows={SLIME_A} s={1.7} label="Hero" />
          <Board x={25} y={14} w={20} h={26} rows={BAT} s={1.7} label="Bat" />
          <Board x={48} y={14} w={20} h={26} rows={COIN} s={1.7} label="Coin" />
          <path d="M71 27h6m-2-2l2 2-2 2" fill="none" stroke="#9b7bff" strokeWidth={1.4} />
          <rect x={80} y={14} width={18} height={26} rx={1.5} fill="#fffaf0" stroke="#1d1b26" strokeWidth={1} />
          <Sprite rows={SLIME_A.slice(1, 6)} x={81} y={16} s={0.9} />
          <Sprite rows={BAT} x={81} y={23} s={0.9} />
          <Sprite rows={COIN} x={81.5} y={30} s={0.8} />
        </>
      )}
    </svg>
  );
}

/** The same four, as tiny icons for the mode chip: a square, a strip, boards in a row, a grid. */
export function WayIcon({ way, size = 16 }: { way: SpriteWay; size?: number }) {
  return (
    <svg className="px-way-icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} shapeRendering="crispEdges">
      {way === 'picture' && <rect x="3" y="3" width="10" height="10" rx="1.5" />}
      {way === 'animation' && (
        <>
          <rect x="3.5" y="2" width="9" height="6.5" rx="1" />
          <path d="M2 11h3v3H2zM6.5 11h3v3h-3zM11 11h3v3h-3z" />
        </>
      )}
      {way === 'boards' && <path d="M1.5 4h3.6v8H1.5zM6.2 4h3.6v8H6.2zM10.9 4h3.6v8h-3.6z" />}
      {way === 'sheet' && <path d="M2 2h12v12H2zM2 8h12M8 2v12" />}
    </svg>
  );
}
