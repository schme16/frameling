// The Repeat panel: pick a shape, choose rows and columns, a ring or a mirror image, then change it any time. It is also the
// Repeat tool's options. Every box changes the repeat live, so the stage follows as you type or slide.
import type { GridRepeat, MirrorRepeat, Repeat, RingRepeat } from '../core/format';
import { currentChoice } from '../core/choices';
import { MAX_REPEAT, RING_FULL } from '../geometry/repeat';
import { ActionButton, Choice, Slider, Tip, Toggle } from '../canvas/controls';
import { Num } from '../symbols/Num';
import '../symbols/symbols.css';
import { pickTool } from '../tools/pick';
import { changeRepeat, pageMiddle, pickedBox, repeatAsGrid, repeatAsMirror, repeatAsRing, startingRepeat, takeRepeatOff, turnIntoShapes, useRepeatState, type RepeatKind, type RingTurn } from './ops';

const KINDS: { value: RepeatKind; label: string; title: string }[] = [
  { value: 'grid', label: 'Rows and columns', title: 'A grid of copies: so many across and so many down' },
  { value: 'ring', label: 'A ring', title: 'Copies round a centre, a full ring or a fan' },
  { value: 'mirror', label: 'Mirror image', title: 'A flipped copy across a line, or through a point' },
];

const NEEDS = 'Pick a shape on a vector layer first.';

function change<R extends Repeat>(label: string, key: string, fn: (r: R) => Repeat) {
  changeRepeat(label, (r) => fn(r as R), `repeat-${key}`);
}

function Grid({ r }: { r: GridRepeat }) {
  return (
    <>
      <Slider label="Across" value={r.cols} min={1} max={12} typeMax={MAX_REPEAT} onChange={(v) => change<GridRepeat>('Repeat: across', 'cols', (g) => ({ ...g, cols: Math.round(v) }))} hint="How many copies in each row, the first one included." />
      <Slider label="Down" value={r.rows} min={1} max={12} typeMax={MAX_REPEAT} onChange={(v) => change<GridRepeat>('Repeat: down', 'rows', (g) => ({ ...g, rows: Math.round(v) }))} hint="How many rows." />
      <div className="sy-grid">
        <Num label="Step across" suffix="px" value={r.dx} title="How far each copy sits from the one before it, along the row. A minus number goes left." onChange={(v) => change<GridRepeat>('Repeat: step across', 'dx', (g) => ({ ...g, dx: v }))} />
        <Num label="Step down" suffix="px" value={r.dy} title="How far each row sits below the one before it. A minus number goes up." onChange={(v) => change<GridRepeat>('Repeat: step down', 'dy', (g) => ({ ...g, dy: v }))} />
      </div>
      <div className="cv-options-row">
        <ActionButton
          onClick={() => {
            const b = pickedBox();
            if (b) changeRepeat('Repeat: edge to edge', (g) => (g.kind === 'grid' ? { ...g, dx: Math.round(b.w), dy: Math.round(b.h) } : g));
          }}
          title="Set the steps to the shape's own width and height, so the copies touch"
        >
          Edge to edge
        </ActionButton>
        <ActionButton onClick={() => pickTool('repeat')} title="Drag the step on the stage. It snaps to guides, points and the page.">
          Drag the step
        </ActionButton>
      </div>
    </>
  );
}

function Ring({ r }: { r: RingRepeat }) {
  const sweep = r.sweep ?? RING_FULL;
  return (
    <>
      <Slider label="How many" value={r.count} min={2} max={36} typeMax={MAX_REPEAT} onChange={(v) => change<RingRepeat>('Repeat: how many', 'count', (g) => ({ ...g, count: Math.round(v) }))} hint="The shape and its copies in all." />
      <Choice
        label="Goes round"
        value={sweep >= RING_FULL ? 'full' : sweep === 180 ? 'half' : sweep === 90 ? 'quarter' : 'other'}
        options={[
          { value: 'full', label: 'All the way', title: 'A full ring' },
          { value: 'half', label: 'Half', title: 'A fan through 180 degrees' },
          { value: 'quarter', label: 'Quarter', title: 'A fan through 90 degrees' },
        ]}
        onChange={(v) => change<RingRepeat>('Repeat: how far round', 'sweep', (g) => withSweep(g, v === 'full' ? RING_FULL : v === 'half' ? 180 : 90))}
      />
      <div className="sy-grid">
        <Num label="Through" suffix="°" value={sweep} title="How many degrees the copies spread through. 360 is a full ring; less is a fan. A minus number goes the other way." onChange={(v) => change<RingRepeat>('Repeat: how far round', 'sweep', (g) => withSweep(g, Math.max(-RING_FULL, Math.min(RING_FULL, v))))} />
        <span />
        <Num label="Centre X" suffix="px" value={r.cx} title="Where the middle of the ring is, across the page" onChange={(v) => change<RingRepeat>('Repeat: centre', 'cx', (g) => ({ ...g, cx: v }))} />
        <Num label="Centre Y" suffix="px" value={r.cy} title="Where the middle of the ring is, down the page" onChange={(v) => change<RingRepeat>('Repeat: centre', 'cy', (g) => ({ ...g, cy: v }))} />
      </div>
      <Toggle label="Turn each copy to follow the ring" checked={r.turn !== false} onChange={(v) => change<RingRepeat>('Repeat: turn with the ring', 'turn', (g) => withTurn(g, v))} hint="On for petals and spokes. Off keeps every copy the way up the first one is." />
      <div className="cv-options-row">
        <ActionButton onClick={() => centre('page')} title="Put the middle of the ring at the middle of the page">
          Page middle
        </ActionButton>
        <ActionButton onClick={() => centre('shape')} title="Put the middle of the ring at the middle of the shape">
          Shape middle
        </ActionButton>
        <ActionButton onClick={() => pickTool('repeat')} title="Drag the centre on the stage. It snaps to points on shapes, guide crossings, the page middle and line ends.">
          Pick on the stage
        </ActionButton>
      </div>
    </>
  );
}

function withSweep(g: RingRepeat, sweep: number): RingRepeat {
  const { sweep: _old, ...rest } = g;
  return sweep === RING_FULL ? rest : { ...rest, sweep };
}

function withTurn(g: RingRepeat, turn: boolean): RingRepeat {
  const { turn: _old, ...rest } = g;
  return turn ? rest : { ...rest, turn: false };
}

function centre(where: 'page' | 'shape'): void {
  const b = pickedBox();
  const p = where === 'page' || !b ? pageMiddle() : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  changeRepeat('Repeat: centre', (g) => (g.kind === 'ring' ? { ...g, cx: p.x, cy: p.y } : g));
}

function Mirror({ r }: { r: MirrorRepeat }) {
  const angle = r.angle ?? 90;
  const set = (label: string, fn: (g: MirrorRepeat) => MirrorRepeat, key = 'mirror') => change<MirrorRepeat>(label, key, fn);
  return (
    <>
      <Choice
        label="Across"
        value={r.point ? 'point' : 'line'}
        options={[
          { value: 'line', label: 'A line', title: 'Flip across a line' },
          { value: 'point', label: 'A point', title: 'Flip through a point, so the copy ends up upside down on the far side of it' },
        ]}
        onChange={(v) =>
          set('Repeat: line or point', (g) => {
            const { point: _p, ...rest } = g;
            return v === 'point' ? { ...rest, point: true } : rest;
          })
        }
      />
      <div className="sy-grid">
        <Num label={r.point ? 'Point X' : 'Line X'} suffix="px" value={r.x} title="A point the mirror line goes through, across the page" onChange={(v) => set('Repeat: mirror', (g) => ({ ...g, x: v }), 'mirror-x')} />
        <Num label={r.point ? 'Point Y' : 'Line Y'} suffix="px" value={r.y} title="A point the mirror line goes through, down the page" onChange={(v) => set('Repeat: mirror', (g) => ({ ...g, y: v }), 'mirror-y')} />
        {!r.point && <Num label="Angle" suffix="°" value={angle} title="Which way the line runs: 90 is up and down, 0 is sideways" onChange={(v) => set('Repeat: mirror angle', (g) => withAngle(g, v), 'mirror-angle')} />}
      </div>
      <div className="cv-options-row">
        {!r.point && (
          <>
            <ActionButton onClick={() => set('Repeat: mirror angle', (g) => withAngle(g, 90))} pressed={angle === 90} title="Make the line run up and down, so the copy is left to right">
              Up and down
            </ActionButton>
            <ActionButton onClick={() => set('Repeat: mirror angle', (g) => withAngle(g, 0))} pressed={angle === 0} title="Make the line run sideways, so the copy is top to bottom">
              Sideways
            </ActionButton>
          </>
        )}
        <ActionButton
          onClick={() => {
            const p = pageMiddle();
            set('Repeat: mirror', (g) => ({ ...g, x: p.x, y: p.y }));
          }}
          title="Put the line through the middle of the page"
        >
          Page middle
        </ActionButton>
        <ActionButton onClick={() => pickTool('repeat')} title="Drag the line's point and its turning end on the stage. They snap to guides, line ends and points.">
          Pick on the stage
        </ActionButton>
      </div>
    </>
  );
}

function withAngle(g: MirrorRepeat, angle: number): MirrorRepeat {
  const a = ((angle % 180) + 180) % 180;
  const { angle: _old, ...rest } = g;
  return a === 90 ? rest : { ...rest, angle: a };
}

/** Changes what the picked shapes repeat as, starting from sensible numbers for the new kind. */
function switchTo(kind: RepeatKind): void {
  const b = pickedBox();
  if (!b) return;
  const turn = currentChoice<RingTurn>('repeat.ringTurn');
  changeRepeat('Repeat: change how', (r) => (r.kind === kind ? r : startingRepeat(kind, b, turn)));
}

export function RepeatControls() {
  const { shapes, current } = useRepeatState();
  const none = shapes.length === 0;
  const r = current?.repeat;
  return (
    <div className="cv-options">
      {!r && (
        <>
          <Tip stays>{none ? 'Pick a shape on a vector layer, then choose how to repeat it.' : 'Choose how to repeat what you picked. It shows on the stage straight away, and you can change it afterwards.'}</Tip>
          <div className="cv-options-row">
            <ActionButton onClick={() => void repeatAsGrid()} disabled={none} title={none ? NEEDS : KINDS[0].title}>
              Rows and columns
            </ActionButton>
            <ActionButton onClick={() => repeatAsRing()} disabled={none} title={none ? NEEDS : KINDS[1].title}>
              A ring
            </ActionButton>
            <ActionButton onClick={() => void repeatAsMirror()} disabled={none} title={none ? NEEDS : KINDS[2].title}>
              Mirror image
            </ActionButton>
          </div>
        </>
      )}
      {r && (
        <>
          <Choice label="Repeat as" value={r.kind} options={KINDS.map(({ value, label, title }) => ({ value, label, title }))} onChange={switchTo} />
          {r.kind === 'grid' && <Grid r={r} />}
          {r.kind === 'ring' && <Ring r={r} />}
          {r.kind === 'mirror' && <Mirror r={r} />}
          <div className="cv-options-row">
            <ActionButton onClick={turnIntoShapes} title="Make every copy a shape of its own, so you can pick and change each one. The repeat is gone after.">
              Turn into shapes
            </ActionButton>
            <ActionButton onClick={takeRepeatOff} title="Keep the shape and drop all its copies">
              Take the repeat off
            </ActionButton>
          </div>
          <Tip>Change the original and every copy follows. The copies can't be picked on the stage: pick the original, or turn the repeat into shapes first.</Tip>
        </>
      )}
    </div>
  );
}
