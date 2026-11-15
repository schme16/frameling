// The one Live pill: what it says for every mix of audience features and OBS. This table IS the design (see livePill.ts).
import { describe, expect, it } from 'vitest';
import { livePill, obsKind, type LivePillInput } from '../../src/ui/liveState';
import type { ObsLinkState } from '../../src/streamsafe/obsLogic';

const obs = (link: ObsLinkState, streaming = false, recording = false) => ({ link, streaming, recording });
const mix = (audience: boolean, waiting: number, o: ReturnType<typeof obs>): LivePillInput => ({ audience, waiting, obs: o });

describe('the Live pill, state by state', () => {
  it('is not there at all when everything is off', () => {
    expect(livePill(mix(false, 0, obs('off')))).toBeNull();
    // A leftover stream or record flag cannot bring it back while the link is off.
    expect(livePill(mix(false, 0, obs('off', true, true)))).toBeNull();
  });

  it('audience on and OBS off is exactly what On air was: red, a count, Stop, nothing else', () => {
    const m = livePill(mix(true, 0, obs('off')))!;
    expect(m.tone).toBe('air');
    expect(m.audience).toEqual({ waiting: 0 });
    expect(m.obs).toBeNull();
    expect(m.label).toBe('Audience features are on');
    expect(livePill(mix(true, 3, obs('off')))!.audience).toEqual({ waiting: 3 });
  });

  it('OBS live with audience off is a red Live pill with no Stop and no On air', () => {
    const m = livePill(mix(false, 0, obs('connected', true)))!;
    expect(m.tone).toBe('live');
    expect(m.audience).toBeNull();
    expect(m.obs).toMatchObject({ kind: 'live', word: 'Live' });
    expect(m.detail).toMatch(/live in OBS/);
  });

  it('recording is told apart from streaming, in words and in tone', () => {
    const rec = livePill(mix(false, 0, obs('connected', false, true)))!;
    expect(rec.tone).toBe('rec');
    expect(rec.obs!.word).toBe('Recording');
    const both = livePill(mix(false, 0, obs('connected', true, true)))!;
    expect(both.tone).toBe('live');
    expect(both.detail).toMatch(/and recording/);
  });

  it('audience on and OBS not running shows On air and a quiet OBS part, so it is not the same as OBS off', () => {
    const off = livePill(mix(true, 0, obs('off')))!;
    const gone = livePill(mix(true, 0, obs('waiting')))!;
    expect(gone.tone).toBe('air');
    expect(gone.obs).toMatchObject({ kind: 'quiet', word: 'No OBS' });
    expect(gone.obs).not.toEqual(off.obs);
    expect(gone.label).toMatch(/OBS not found/);
  });

  it('both on with three waiting: the count stays on On air, OBS gets its own word', () => {
    const m = livePill(mix(true, 3, obs('connected', true)))!;
    expect(m.tone).toBe('air');
    expect(m.audience!.waiting).toBe(3);
    expect(m.obs).toMatchObject({ kind: 'live', word: 'Live' });
    expect(m.label).toBe('Audience features are on, 3 waiting. Live in OBS');
    // Stop ends the audience only, and the tooltip says so.
    expect(m.detail).toMatch(/Stop ends audience features, not your stream/);
  });

  it('OBS needing a password while audience is on says so next to On air, never behind a calmer face', () => {
    const m = livePill(mix(true, 1, obs('password')))!;
    expect(m.tone).toBe('air');
    expect(m.obs).toMatchObject({ kind: 'fix', word: 'OBS: password', fix: true });
    expect(m.label).toMatch(/OBS needs you/);
    expect(m.detail).toMatch(/password/);
    expect(livePill(mix(true, 0, obs('address')))!.detail).toMatch(/address/);
  });

  it('OBS alone says what is wrong in the pill itself', () => {
    expect(livePill(mix(false, 0, obs('password')))!.obs!.word).toBe('OBS: password');
    expect(livePill(mix(false, 0, obs('address')))!.obs!.word).toBe('OBS: address');
    expect(livePill(mix(false, 0, obs('waiting')))!.obs!.word).toBe('OBS: not found');
    expect(livePill(mix(false, 0, obs('connecting')))!.obs!.word).toBe('OBS: looking');
    expect(livePill(mix(false, 0, obs('connected')))!.obs!.word).toBe('OBS: connected');
  });

  it('red is only ever audience on or OBS live, and never any calmer state', () => {
    const links: ObsLinkState[] = ['off', 'connecting', 'waiting', 'password', 'address', 'connected'];
    for (const audience of [false, true]) {
      for (const link of links) {
        for (const [streaming, recording] of [
          [false, false],
          [true, false],
          [false, true],
          [true, true],
        ] as const) {
          const m = livePill(mix(audience, 0, obs(link, streaming, recording)));
          if (!m) continue;
          const red = m.tone === 'air' || m.tone === 'live';
          const mustBeRed = audience || (link === 'connected' && streaming);
          expect(red, `${audience} ${link} ${streaming} ${recording}`).toBe(mustBeRed);
        }
      }
    }
  });

  it('every distinct combination has a distinct face', () => {
    const links: ObsLinkState[] = ['off', 'connecting', 'waiting', 'password', 'address', 'connected'];
    const seen = new Map<string, string>();
    for (const audience of [false, true]) {
      for (const link of links) {
        for (const [streaming, recording] of [
          [false, false],
          [true, false],
          [false, true],
        ] as const) {
          // Streaming and recording only mean something once connected.
          if (link !== 'connected' && (streaming || recording)) continue;
          const m = livePill(mix(audience, 2, obs(link, streaming, recording)));
          if (!m) continue;
          // The face is what a person sees: whether Stop is there, the words, and the tone. No two combinations may share one.
          const face = [m.audience ? 'On air 2 Stop' : '', m.obs ? `${m.obs.word}/${m.obs.kind}` : '', m.tone].join('|');
          const key = `${audience} ${link} ${streaming} ${recording}`;
          expect(seen.get(face), `${seen.get(face)} looks like ${key}`).toBeUndefined();
          seen.set(face, key);
        }
      }
    }
  });

  it('only ever says plain words, with no em dashes', () => {
    for (const audience of [false, true]) {
      for (const link of ['connecting', 'waiting', 'password', 'address', 'connected'] as const) {
        const m = livePill(mix(audience, 4, obs(link, true, true)))!;
        expect(`${m.label} ${m.detail} ${m.obs?.word}`).not.toMatch(/[–—]/);
      }
    }
  });

  it('maps OBS links to a kind', () => {
    expect(obsKind(obs('off'))).toBeNull();
    expect(obsKind(obs('connecting'))).toBe('looking');
    expect(obsKind(obs('connected', false, true))).toBe('rec');
  });
});
