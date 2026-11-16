// Tool options for the Collision tool: what it draws next, and what it does with what is there.
import { ActionButton, Field, Tip } from '../canvas/controls';
import { getCommand } from '../core/registry';
import { useStore } from '../core/store';
import { editingTileKey, tileProps } from './ops';
import { setTileUi, useTileUi } from './state';
import './tiles.css';

const run = (id: string) => void getCommand(id)?.run();

export function ShapeToolOptions() {
  useStore((s) => s.doc);
  const mode = useTileUi((s) => s.shapeMode);
  const key = editingTileKey();
  const oneWay = !!(key && tileProps(key).collision?.oneWay);
  const count = key ? (tileProps(key).collision?.shapes.length ?? 0) : 0;
  return (
    <div className="cv-options">
      <Field label="Draw a" value={mode === 'box' ? 'box' : 'shape'}>
        <div className="tz-brush-buttons">
          <ActionButton onClick={() => setTileUi({ shapeMode: 'box' })} pressed={mode === 'box'}>
            Box
          </ActionButton>
          <ActionButton onClick={() => setTileUi({ shapeMode: 'polygon' })} pressed={mode === 'polygon'}>
            Shape
          </ActionButton>
          <ActionButton onClick={() => run('tiles.solid')} title="One box over the whole tile">
            Whole tile
          </ActionButton>
          <ActionButton onClick={() => run('tiles.clearShapes')} disabled={!count}>
            Clear
          </ActionButton>
        </div>
      </Field>
      <Field label="One-way platform" value={oneWay ? 'on' : 'off'}>
        <ActionButton onClick={() => run('tiles.oneWay')} pressed={oneWay} disabled={!count} title="Things land on top of it and jump up through it">
          {oneWay ? 'One-way: on' : 'One-way: off'}
        </ActionButton>
      </Field>
      <Tip>
        {!key
          ? 'Double-click a tile in the Tileset panel to open it, then draw its shape here.'
          : mode === 'box'
            ? 'Drag to draw a box. Drag a corner to resize it, or drag inside the picked box to move it. Delete removes it.'
            : 'Click to place corners. Click the first corner again, or press Enter, to close the shape. Backspace takes back a corner.'}
      </Tip>
    </div>
  );
}
