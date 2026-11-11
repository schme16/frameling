import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { PathShape } from '../../src/core/format';
import { resetStore } from '../../src/core/store';
import { activeColor, pickTool, resetColors, setActiveColor, setActiveNone, swapColors, toggleWell, wellForTool } from '../../src/tools/wells';

function setup() {
  const doc = newDoc();
  const d = newVectorDrawing();
  const shape: PathShape = { id: 'p', type: 'path', paths: [], fill: '#ffffff', stroke: { color: '#000000', width: 2, join: 'round', cap: 'round' }, opacity: 1 };
  d.shapes.push(shape);
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c', start: 0, length: 1, drawingId: d.id });
  const s = resetStore(doc);
  s.setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  return s;
}
const shapeOf = (s: ReturnType<typeof setup>) => {
  const d = Object.values(s.get().doc.drawings)[0];
  return (d.kind === 'vector' ? d.shapes[0] : null) as PathShape;
};

describe('fill and stroke boxes', () => {
  it('starts Illustrator style: white fill, black stroke, stroke in front', () => {
    const s = setup();
    resetColors();
    expect([s.get().ui.fillColor, s.get().ui.color, s.get().ui.strokeOn]).toEqual(['#ffffff', '#1d1b26', true]);
  });

  it('X brings the other box forward, and colours go to the box in front', () => {
    const s = setup();
    setActiveColor('#ff0000');
    expect(s.get().ui.color).toBe('#ff0000');
    toggleWell();
    setActiveColor('#00ff00');
    expect(s.get().ui.fillColor).toBe('#00ff00');
    expect(activeColor()).toBe('#00ff00');
  });

  it('Shift+X swaps, and / sets the box in front to none', () => {
    const s = setup();
    s.setUi({ fillColor: '#00ff00', color: '#ff0000', strokeOn: true, activeWell: 'fill' });
    swapColors();
    expect([s.get().ui.fillColor, s.get().ui.color]).toEqual(['#ff0000', '#00ff00']);
    setActiveNone();
    expect(s.get().ui.fillColor).toBeNull();
    expect(activeColor()).toBeNull();
    swapColors();
    // A none fill swapped into the stroke turns the stroke off.
    expect([s.get().ui.fillColor, s.get().ui.strokeOn]).toEqual(['#00ff00', false]);
  });

  it('recolours selected shapes: fill or outline, depending on the box in front, in one undo step', () => {
    const s = setup();
    s.setUi({ selection: ['p'], activeWell: 'fill' });
    setActiveColor('#123456');
    setActiveColor('#654321');
    expect(shapeOf(s).fill).toBe('#654321');
    s.setUi({ activeWell: 'stroke' });
    setActiveNone();
    expect(shapeOf(s).stroke).toBeNull();
    s.undo();
    expect(shapeOf(s).stroke?.color).toBe('#000000');
    s.undo();
    expect(shapeOf(s).fill).toBe('#ffffff');
  });
});

describe('tools bring their colour box forward', () => {
  it('the bucket brings the fill, line tools the stroke, others leave it', () => {
    expect(wellForTool('fill')).toBe('fill');
    expect(wellForTool('pencil')).toBe('stroke');
    expect(wellForTool('rect')).toBeNull();
    expect(wellForTool('select')).toBeNull();
  });
  it('so a swatch picked after choosing the bucket is what it pours', () => {
    const s = setup();
    pickTool('fill');
    setActiveColor('#ff0000');
    expect(s.get().ui.fillColor).toBe('#ff0000');
    pickTool('rect');
    expect(s.get().ui.activeWell).toBe('fill');
    pickTool('brush');
    setActiveColor('#00ff00');
    expect(s.get().ui.color).toBe('#00ff00');
    expect(s.get().ui.fillColor).toBe('#ff0000');
  });
});
