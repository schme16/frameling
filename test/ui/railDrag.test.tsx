// @vitest-environment jsdom
// Carrying the tool rail by its grip, in the page: a side docks it, the canvas floats it, a drop nowhere (or Escape)
// puts it back where it was picked up, and the right-click menu is one line about moving it, not five.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dock, placeTools, resetDock } from '../../src/ui/dock';
import { dragState, startToolsDrag } from '../../src/ui/dockDrag';
import { toolsMenu } from '../../src/ui/dockMenus';

vi.mock('../../src/ui/rightDock.css', () => ({}));

const box = (el: Element, l: number, t: number, r: number, b: number) => {
  el.getBoundingClientRect = () => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t, toJSON() {} }) as DOMRect;
};
let page: HTMLDivElement;
let grip: HTMLButtonElement;
beforeEach(() => {
  resetDock();
  page = document.createElement('div');
  page.innerHTML = '<div class="ui-body"><div class="ui-center"><main class="ui-canvas"></main></div></div><nav><button class="g"></button></nav>';
  document.body.appendChild(page);
  box(page.querySelector('.ui-body')!, 0, 40, 1280, 776);
  box(page.querySelector('.ui-center')!, 0, 40, 1280, 776);
  box(page.querySelector('.ui-canvas')!, 340, 80, 940, 700);
  const nav = page.querySelector('nav')!;
  box(nav, 0, 40, 94, 700);
  grip = page.querySelector('button')!;
});
afterEach(() => {
  page.remove();
  document.body.className = '';
});

const pick = (x = 40, y = 50) => startToolsDrag({ button: 0, clientX: x, clientY: y, currentTarget: grip } as never, { x: 10, y: 6 });
const fire = (type: string, x: number, y: number) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0 }));
const carry = (x: number, y: number) => {
  fire('pointermove', x, y);
};
const tools = () => dock.get().layout.tools;

describe('carrying the tool rail', () => {
  it('a drop on the right edge docks it there, and remembers the side it came from', () => {
    placeTools('left');
    pick();
    carry(400, 300);
    expect(tools().place).toBe('float');
    expect(dragState.get()!.rail!.home).toBe('left');
    carry(1270, 300);
    expect(dragState.get()!.rail!.drop).toEqual({ dock: 'right' });
    fire('pointerup', 1270, 300);
    expect(tools().place).toBe('right');
    expect(dragState.get()).toBeNull();
  });
  it('a drop on the canvas floats it where it was let go', () => {
    placeTools('left');
    pick();
    carry(500, 300);
    fire('pointerup', 500, 300);
    expect(tools()).toMatchObject({ place: 'float', x: 490, y: 294, home: 'left' });
  });
  it('a drop nowhere puts a docked rail back on its side', () => {
    placeTools('right');
    pick();
    carry(200, 300);
    expect(dragState.get()!.rail!.drop).toBeNull();
    fire('pointerup', 200, 300);
    expect(tools().place).toBe('right');
  });
  it('a drop nowhere puts a floating rail back where it was floating', () => {
    placeTools('float', { x: 120, y: 160 });
    pick();
    carry(200, 300);
    fire('pointerup', 200, 300);
    expect(tools()).toMatchObject({ place: 'float', x: 120, y: 160 });
  });
  it('Escape puts it back, and a floating rail can go home to the side it came from', () => {
    placeTools('bottom');
    pick();
    carry(500, 300);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tools().place).toBe('bottom');
    placeTools('float', { x: 300, y: 200 });
    pick();
    carry(5, 300);
    fire('pointerup', 5, 300);
    expect(tools().place).toBe('left');
    placeTools('float', { x: 300, y: 200 });
    expect(tools().home).toBe('left');
  });
  it('a press on the width edge of a docked rail is the splitter\'s: the grip does not start', () => {
    placeTools('left');
    pick(92, 50);
    carry(500, 300);
    expect(tools().place).toBe('left');
    expect(dragState.get()).toBeNull();
  });
  it('a width pull in progress is not interrupted by the grip', () => {
    document.body.classList.add('ui-resizing');
    placeTools('left');
    pick();
    carry(500, 300);
    expect(tools().place).toBe('left');
  });
});

describe('the rail menu', () => {
  const labels = () => toolsMenu().flatMap((i) => ('label' in i ? [i.label] : []));
  it('has one line about moving it, not one per side', () => {
    placeTools('left');
    expect(labels()).toContain('To move them, drag the grip');
    expect(labels().filter((l) => /^Dock|^Float/.test(l))).toEqual([]);
  });
  it('a floating rail gets one line that puts it back on its side', () => {
    placeTools('right');
    placeTools('float', { x: 200, y: 200 });
    expect(labels()).toContain('Dock them back on the right side');
  });
});
