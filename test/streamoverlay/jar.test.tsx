// @vitest-environment jsdom
// The prompt jar's card with the overlay on: a pulled prompt gets a Show on stream button (unless the streamer chose
// straight away), pressing it lets exactly that slip through, and a new pull starts hidden again.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { _resetFeaturesForTests, registerFeatures } from '../../src/features/host';
import { jarCardOpen, jarShown } from '../../src/promptjar/card';
import { JarChip } from '../../src/promptjar/JarCard';
import { addToJar, emptyJar, jar, passOn, pullOne } from '../../src/promptjar/jar';
import { promptJarFeature } from '../../src/promptjar';
import { streamDoorFeature } from '../../src/streamdoor';
import { streamOverlayFeature } from '../../src/streamoverlay';
import { buildOverlay } from '../../src/streamoverlay/sources';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const button = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t);

beforeEach(() => {
  setChoiceAsker(null);
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature, promptJarFeature, streamOverlayFeature]);
  setChoice('streamoverlay.prompt', undefined);
  emptyJar();
  jarShown.set(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => jarCardOpen.set(true));
  act(() => root.render(<JarChip />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jarCardOpen.set(false);
  emptyJar();
});

describe('Show on stream', () => {
  it('is offered for a pulled prompt, and pressing it puts that slip on the overlay, and Take it off removes it', () => {
    addToJar('a frog in a teacup');
    act(() => void pullOne());
    expect(buildOverlay().prompt).toBeNull();
    act(() => button('Show on stream')!.click());
    expect(buildOverlay().prompt!.text).toBe('a frog in a teacup');
    act(() => button('Take it off the stream')!.click());
    expect(buildOverlay().prompt).toBeNull();
  });
  it('the next pull starts hidden', () => {
    addToJar('one idea');
    addToJar('two ideas');
    act(() => void pullOne(() => 0));
    act(() => button('Show on stream')!.click());
    act(() => passOn());
    act(() => void pullOne());
    expect(jar.get().hand).not.toBeNull();
    expect(buildOverlay().prompt).toBeNull();
    expect(button('Show on stream')).toBeTruthy();
  });
  it('is not offered when the streamer chose straight away, and the prompt is on already', () => {
    setChoice('streamoverlay.prompt', 'now');
    addToJar('a frog in a teacup');
    act(() => void pullOne());
    expect(button('Show on stream')).toBeUndefined();
    expect(buildOverlay().prompt!.text).toBe('a frog in a teacup');
  });
  it('is not offered when the overlay feature is off', () => {
    _resetFeaturesForTests();
    registerFeatures([streamDoorFeature, promptJarFeature]);
    addToJar('a frog');
    act(() => void pullOne());
    expect(button('Show on stream')).toBeUndefined();
  });
});
