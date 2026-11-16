// @vitest-environment jsdom
// The Live pill, as painted. liveState.test.ts proves every mix SAYS something different; this proves each part is DRESSED
// right: OBS ready is green, OBS recording or streaming is red, nothing else wears either, every part paints a
// background of its own (the old bug: "OBS ready" sat on the audience part's red because it was see-through), and the
// audience part is yellow with dark text, never red. jsdom does not apply the stylesheets, so the check draws the real
// pill, reads the classes each part ended up with, then works out which of our own CSS rules reach it and what they paint.
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
const GREEN = /aud-green|#1d7a3c/i;
const YELLOW = /aud-info|#f6c93b|#d9a914/i;
const bgOf = (p: Record<string, string>): string => (p.background ?? p['background-color'] ?? '').trim();
/** True when the part shows what is behind it. */
const seeThrough = (p: Record<string, string>): boolean => ['', 'transparent', 'none'].includes(bgOf(p));
/** Parses #rrggbb to a relative luminance, for contrast. */
const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** The value of a custom property declared on .live-pill, as a hex colour. */
const token = (name: string): string => /#[0-9a-f]{6}/i.exec(rules.find((r) => r.classes.join('.') === 'live-pill' && r.tail === '')!.decls[name])![0];

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

// Every state OBS can be in, with the colour its segment must wear.
const states: Array<[string, ObsState, RegExp | null]> = [
  ['not found', link('waiting'), null],
  ['looking', link('connecting'), null],
  ['needs a password', link('password'), null],
  ['has a bad address', link('address'), null],
  ['connected, not streaming', link('connected'), GREEN],
  ['streaming', link('connected', true), RED],
  ['recording', link('connected', false, true), RED],
  ['streaming and recording', link('connected', true, true), RED],
];

describe('the OBS part of the Live pill, as painted', () => {
  for (const withAudience of [true, false]) {
    for (const [name, o, want] of states) {
      it(`${withAudience ? 'beside the audience part' : 'on its own'}, OBS ${name} is ${want === GREEN ? 'green' : want === RED ? 'red' : 'neither green nor red'}`, () => {
        const badge = draw(withAudience, o)!;
        expect(badge).not.toBeNull();
        const p = paintOf(badge);
        const label = `${[...badge.classList].join(' ')} paints ${JSON.stringify(p)}`;
        // Its colour is its own: never see-through, so it cannot borrow the part beside it.
        expect(seeThrough(p), label).toBe(false);
        expect(RED.test(bgOf(p)), label).toBe(want === RED);
        expect(GREEN.test(bgOf(p)), label).toBe(want === GREEN);
        expect(YELLOW.test(bgOf(p)), label).toBe(false);
      });
    }
  }

  it('the needs-you segment is not dressed like the yellow audience part, and keeps its own heavy ring', () => {
    const fix = paintOf(draw(true, link('password'))!);
    expect(fix['box-shadow']).toMatch(/inset 0 0 0 2px/);
    const yellowRule = [...css.matchAll(/--aud-info[^;]*;/g)].join(' ');
    expect(yellowRule).not.toMatch(/sunny/);
    expect(JSON.stringify(fix)).not.toMatch(/sunny|aud-info/);
  });

  it('the audience part is yellow with dark text, not red, and reads well', () => {
    draw(true, link('connected'));
    for (const sel of ['.aud-pill', '.aud-more']) {
      const p = paintOf(host.querySelector(sel)!);
      expect(YELLOW.test(bgOf(p)), `${sel} ${JSON.stringify(p)}`).toBe(true);
      expect(RED.test(bgOf(p))).toBe(false);
      expect(p.color).toMatch(/aud-ink/);
    }
    // Contrast of dark ink on each yellow, and white on green and red: the same fixed colours in both themes.
    expect(contrast(token('--aud-ink'), token('--aud-info'))).toBeGreaterThan(7);
    expect(contrast(token('--aud-ink'), token('--aud-info-deep'))).toBeGreaterThan(7);
    expect(contrast('#ffffff', token('--aud-green'))).toBeGreaterThan(4.5);
    expect(contrast('#ffffff', token('--aud-red'))).toBeGreaterThan(4.5);
    // The yellow and the other two cannot be confused.
    expect(token('--aud-info')).not.toBe(token('--aud-red'));
    expect(token('--aud-info')).not.toBe(token('--aud-green'));
  });

  it('the check can see the fault: a segment on the audience part\'s colour or see-through is caught', () => {
    expect(RED.test(bgOf({ background: 'var(--aud-red)' }))).toBe(true);
    expect(seeThrough({ background: 'transparent' })).toBe(true);
    expect(seeThrough({})).toBe(true);
  });

  it('the rules found for the segment are real, not an empty match', () => {
    const p = paintOf(draw(true, link('connected'))!);
    expect(Object.keys(p).length).toBeGreaterThan(3);
  });
});
