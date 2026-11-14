// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFold, isFoldOpen, parseFolds, setFold, toggleFold, withFold } from '../../src/canvas/folds';
import { BrushOptions } from '../../src/tools/options/BrushOptions';
import { getCommand } from '../../src/core/registry';
import '../../src/canvas/commands';

vi.mock('../../src/canvas/canvas.css', () => ({}));
vi.mock('../../src/tablet/tablet.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the folds, as pure functions', () => {
  it('starts everything shut', () => {
    expect(isFoldOpen({}, 'brush')).toBe(false);
    expect(parseFolds(null)).toEqual({});
    expect(parseFolds('')).toEqual({});
  });
  it('reads saved text back, and ignores junk', () => {
    expect(parseFolds('{"brush":true}')).toEqual({ brush: true });
    expect(parseFolds('{"brush":"yes","pencil":1,"x":false}')).toEqual({ x: false });
    expect(parseFolds('[true]')).toEqual({});
    expect(parseFolds('null')).toEqual({});
    expect(parseFolds('{not json')).toEqual({});
  });
  it('opens and shuts one fold without touching the others, and saves only what is open', () => {
    const a = withFold({}, 'brush', true);
    const b = withFold(a, 'pencil', true);
    expect(b).toEqual({ brush: true, pencil: true });
    expect(withFold(b, 'brush', false)).toEqual({ pencil: true });
    expect(a).toEqual({ brush: true });
  });
});

describe('the brush fold in the panel', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    // jsdom has no canvas, and the brush preview draws on one
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {} arc() {} bezierCurveTo() {} });
    const g = new Proxy({}, { get: () => () => undefined });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as never);
    setFold('brush', false);
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const labels = () => [...host.querySelectorAll('.cv-field-label, .cv-toggle-label')].map((e) => e.textContent);
  const render = () => {
    const root = createRoot(host);
    act(() => root.render(<BrushOptions />));
    return root;
  };

  it('opens on Size alone, with the rest folded away', () => {
    render();
    expect(labels()).toEqual(['Size']);
    expect(host.textContent).toContain('More brush options');
    expect(host.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows all ten controls once opened, and remembers it', () => {
    render();
    act(() => (host.querySelector('.cv-more-btn') as HTMLButtonElement).click());
    expect(labels()).toEqual(['Size', 'Merge shapes together', 'Smoothing', 'Pressure changes thickness', 'How much', 'Pointy start', 'Pointy end', 'Stabilizer', 'Stabilizer style', 'Mirror drawing']);
    expect(getFold('brush')).toBe(true);
    expect(JSON.parse(localStorage.getItem('frameling.optionFolds') ?? '{}')).toEqual({ brush: true });
    act(() => (host.querySelector('.cv-more-btn') as HTMLButtonElement).click());
    expect(labels()).toEqual(['Size']);
    expect(localStorage.getItem('frameling.optionFolds')).toBe('{}');
  });

  it('comes back open when it was left open', () => {
    setFold('brush', true);
    render();
    expect(labels()).toContain('Pointy end');
  });

  it('has a palette command that flips it and shows it ticked', () => {
    const cmd = getCommand('draw.moreBrushOptions');
    expect(cmd).toBeTruthy();
    expect(cmd?.checked?.({} as never)).toBe(false);
    cmd?.run();
    expect(getFold('brush')).toBe(true);
    expect(cmd?.checked?.({} as never)).toBe(true);
    toggleFold('brush');
    expect(getFold('brush')).toBe(false);
  });
});
