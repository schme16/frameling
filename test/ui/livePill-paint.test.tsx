// @vitest-environment jsdom
// The Live pill, as painted. liveState.test.ts proves every mix SAYS something different; this proves the OBS part is
// not DRESSED as live unless OBS is live. That is the gap the "OBS ready on red" bug fell through: the words were right
// and the segment still took On air's red. jsdom does not apply the stylesheets, so the check draws the real pill, reads
// the classes the OBS segment ended up with, then works out which of our own CSS rules reach it and what they paint.
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObsState } from '../../src/streamsafe/obsLogic';

const state: { s: ObsState } = { s: { link: 'off', streaming: false, recording: false, safe: false, owns: false, tries: 0 } };
vi.mock('../../src/streamsafe/obs', () => ({ obs: { lookNow: () => undefined }, useObsState: () => state.s }));

import { audience, installAudience, setAudienceOn } from '../../src/audience';
import { setChoice } from '../../src/core/choices';
import { cardOpen } from '../../src/audience/card';
import { LivePill } from '../../src/ui/LivePill';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installAudience();

// The pill's stylesheets, in the order LivePill imports them (later wins a tie).
const css = ['src/audience/audience.css', 'src/streamsafe/streamsafe.css'].map((f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');

interface Rule {
  classes: string[];
  tail: string;
  decls: Record<string, string>;
}
// Every selector that is plain classes (an optional :hover or descendant is kept apart), with what it declares.
const rules: Rule[] = [];
for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
  const decls: Record<string, string> = {};
  for (const d of m[2].split(';')) {
    const at = d.indexOf(':');
    if (at > 0) decls[d.slice(0, at).trim()] = d.slice(at + 1).trim();
  }
  for (const sel of m[1].split(',')) {
    const one = /^\s*((?:\.[\w-]+)+)\s*(.*?)\s*$/.exec(sel);
    if (one) rules.push({ classes: one[1].slice(1).split('.'), tail: one[2], decls });
  }
}

/** What reaches the segment itself (not its hover, not its children): the winning value for each property. */
function paintOf(el: Element): Record<string, string> {
  const has = new Set([...el.classList]);
  const best: Record<string, { v: string; spec: number }> = {};
  for (const r of rules) {
    if (r.tail !== '' || !r.classes.every((c) => has.has(c))) continue;
    for (const [k, v] of Object.entries(r.decls)) if (!best[k] || r.classes.length >= best[k].spec) best[k] = { v, spec: r.classes.length };
  }
  return Object.fromEntries(Object.entries(best).map(([k, b]) => [k, b.v]));
}

const RED = /aud-red|#c62828|#a51f1f|rgb\(\s*198/i;
const WHITE = /^(#fff|#ffffff|white)$/i;
/** True when the segment is dressed the way the live OBS segment is: white on red or red itself. */
const dressedAsLive = (p: Record<string, string>): boolean => {
  const bg = (p.background ?? p['background-color'] ?? '').trim();
  return RED.test(bg) || WHITE.test(bg) || WHITE.test((p.color ?? '').trim());
};
/** True when the segment shows the pill behind it, which on an On air pill is red. */
const seeThrough = (p: Record<string, string>): boolean => {
  const bg = (p.background ?? p['background-color'] ?? '').trim();
  return bg === '' || bg === 'transparent' || bg === 'none';
};

let host: HTMLDivElement;
let root: Root;
const link = (l: ObsState['link'], streaming = false, recording = false) => ({ link: l, streaming, recording, safe: false, owns: false, tries: 0 }) as ObsState;
const draw = (audienceOn: boolean, o: ObsState) => {
  state.s = o;
  act(() => audience.kill());
  if (audienceOn) {
    setChoice('audience.strictness', 'balanced');
    act(() => setAudienceOn(true));
  }
  act(() => root.render(<LivePill />));
  return host.querySelector<HTMLElement>('[data-testid="obs.badge"]');
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  cardOpen.set(false);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  act(() => audience.kill());
});

// Every state OBS can be in, with whether it is live.
const states: Array<[string, ObsState, boolean]> = [
  ['not found', link('waiting'), false],
  ['looking', link('connecting'), false],
  ['needs a password', link('password'), false],
  ['has a bad address', link('address'), false],
  ['connected, not streaming', link('connected'), false],
  ['streaming', link('connected', true), true],
  ['recording', link('connected', false, true), true],
  ['streaming and recording', link('connected', true, true), true],
];

describe('the OBS part of the Live pill, as painted', () => {
  for (const withAudience of [true, false]) {
    for (const [name, o, live] of states) {
      it(`${withAudience ? 'beside On air' : 'on its own'}, OBS ${name} ${live ? 'looks live' : 'does not look live'}`, () => {
        const badge = draw(withAudience, o)!;
        expect(badge).not.toBeNull();
        const p = paintOf(badge);
        if (live) expect(dressedAsLive(p) || !withAudience).toBe(true);
        else expect(dressedAsLive(p), `${[...badge.classList].join(' ')} paints ${JSON.stringify(p)}`).toBe(false);
        // Beside the red On air part, a segment that paints nothing would show the red through it.
        if (withAudience) expect(seeThrough(p), `${[...badge.classList].join(' ')} is see-through on a red pill`).toBe(false);
      });
    }
  }

  it('the red On air part is still red: the audience half is right and stays', () => {
    draw(true, link('connected'));
    const air = host.querySelector('.aud-pill')!;
    expect(RED.test(paintOf(air).background ?? '')).toBe(true);
  });

  it('the check can see the fault: a segment on the old red does count as live', () => {
    expect(dressedAsLive({ background: 'var(--aud-red)', color: '#fff' })).toBe(true);
    expect(seeThrough({ background: 'transparent' })).toBe(true);
  });

  it('the rules found for the segment are real, not an empty match', () => {
    const p = paintOf(draw(true, link('connected'))!);
    expect(Object.keys(p).length).toBeGreaterThan(3);
  });
});
