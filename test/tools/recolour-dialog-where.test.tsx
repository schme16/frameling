// @vitest-environment jsdom
// The Where buttons in the Recolour dialog: they remember the last pick, never apply a pick that has nothing to work on,
// and one Recolour is one undo step that stays inside the part picked.
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, FillShape, VectorDrawing } from '../../src/core/format';
import { currentChoice, rememberedChoice, setChoice } from '../../src/core/choices';
import { resetStore, store } from '../../src/core/store';
import '../../src/tools/recolour-open';
import { openRecolourDialog } from '../../src/tools/RecolourDialog';
import { getCommand } from '../../src/core/registry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fill = (id: string, color: string): FillShape => ({ id, type: 'fill', paths: [], color, opacity: 1 });
const colour = (id: string) => ((store().get().doc.drawings[id] as VectorDrawing).shapes[0] as FillShape).color;
const button = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="recolour.where.${id}"]`)!;
const on = () => [...document.querySelectorAll<HTMLButtonElement>('.cv-recolour-where button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

beforeEach(() => {
  document.body.innerHTML = '';
  setChoice('recolour.where', undefined);
  const doc = newDoc({ width: 10, height: 10, length: 2 });
  const shirt = { ...newVectorLayer('Shirt'), id: 'shirt', cels: [{ id: 'c1', start: 0, length: 2, drawingId: 'dS' }] };
  const wall = { ...newVectorLayer('Wall'), id: 'wall', cels: [{ id: 'c2', start: 0, length: 2, drawingId: 'dW' }] };
  doc.layers = [wall, shirt];
  doc.drawings = { dS: { id: 'dS', kind: 'vector', shapes: [fill('a', '#ff0000')] }, dW: { id: 'dW', kind: 'vector', shapes: [fill('b', '#ff0000')] } };
  resetStore(doc as Doc);
  store().setUi({ activeLayerId: 'shirt', frame: 0, selection: [] });
});

describe('Recolour dialog: Where', () => {
  it('starts on Everything, and the selection button waits for a selection', () => {
    act(() => openRecolourDialog());
    expect(on()).toEqual(['Everything']);
    expect(button('selection').disabled).toBe(true);
    expect(button('layer').disabled).toBe(false);
  });

  it('this layer changes only that layer, in one undo step, and is remembered for next time', () => {
    act(() => openRecolourDialog());
    act(() => button('layer').click());
    expect(rememberedChoice('recolour.where')).toBe('layer');
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="recolour.apply"]')!.click());
    expect(colour('dS')).not.toBe('#ff0000');
    expect(colour('dW')).toBe('#ff0000');
    store().undo();
    expect(colour('dS')).toBe('#ff0000');
    document.body.innerHTML = '';
    act(() => openRecolourDialog());
    expect(on()).toEqual(['This layer']);
  });

  it('falls back to Everything when the remembered pick has nothing to work on', () => {
    act(() => openRecolourDialog('selection'));
    expect(on()).toEqual(['Everything']);
    expect(currentChoice('recolour.where')).toBe('all');
  });

  it('opens on the selection when something is selected', () => {
    store().setUi({ selection: ['a'] });
    act(() => openRecolourDialog('selection'));
    expect(on()).toEqual(['The selection']);
  });

  it('has a command for each place, and the selection one only when there is something selected', () => {
    for (const id of ['colors.recolourLayer', 'colors.recolourFrame', 'colors.recolourSelection']) expect(getCommand(id), id).toBeDefined();
    const state = store().get();
    expect(getCommand('colors.recolourLayer')!.enabled!(state)).toBe(true);
    expect(getCommand('colors.recolourSelection')!.enabled!(state)).toBe(false);
    store().setUi({ selection: ['a'] });
    expect(getCommand('colors.recolourSelection')!.enabled!(store().get())).toBe(true);
  });
});
