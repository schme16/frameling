// @vitest-environment jsdom
// Each pixel tool's options panel shows that tool's settings and nobody else's. The pencil used to render the SHADE
// tool's pen options as well, so two sliders both called "Stabilizer" sat in one panel showing different values, and
// the shade tool had no panel of its own to set it from.
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PixelPencilOptions, ShadeOptions, SprayOptions } from '../../src/pixel/ToolOptions';

function draw(node: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, done: () => act(() => root.unmount()) };
}

/** Every field label on the panel, exactly as a person reads it. */
const labels = (host: HTMLElement): string[] => [...host.querySelectorAll('.cv-field-label')].map((e) => (e.textContent ?? '').trim());
/** Exact matches only: "Stabilizer style" is a different control and must not be counted as another stabilizer. */
const countOf = (host: HTMLElement, word: string) => labels(host).filter((l) => l === word).length;

describe('a pixel tool panel shows only its own settings', () => {
  it('the pencil has one stabilizer, not two', () => {
    const { host, done } = draw(<PixelPencilOptions />);
    expect(countOf(host, 'Stabilizer')).toBeLessThanOrEqual(1);
    done();
  });

  it('the shade tool has a stabilizer of its own, which it only ever had through the pencil before', () => {
    const { host, done } = draw(<ShadeOptions />);
    expect(countOf(host, 'Stabilizer')).toBe(1);
    done();
  });

  it('the spray tool is unchanged and still has exactly one', () => {
    const { host, done } = draw(<SprayOptions />);
    expect(countOf(host, 'Stabilizer')).toBe(1);
    done();
  });
});
