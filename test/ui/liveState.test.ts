// The one Live pill: what it says for every mix of audience features and OBS. This table IS the design (see livePill.ts).
import { describe, expect, it } from 'vitest';
import { AUDIENCE_WORD, livePill, obsColour, obsKind, type LivePillInput } from '../../src/ui/liveState';
import type { ObsLinkState } from '../../src/streamsafe/obsLogic';

const obs = (link: ObsLinkState, streaming = false, recording = false) => ({ link, streaming, recording });
const mix = (audience: boolean, waiting: number, o: ReturnType<typeof obs>): LivePillInput => ({ audience, waiting, obs: o });

describe('the Live pill, state by state', () => {
  it('is not there at all when everything is off', () => {
    expect(livePill(mix(false, 0, obs('off')))).toBeNull();
    // A leftover stream or record flag cannot bring it back while the link is off.
    expect(livePill(mix(false, 0, obs('off', true, true)))).toBeNull();
  });

  it('audience on and OBS off says Audience participation: on, with the count on the arrow part and nothing else', () => {
    const m = livePill(mix(true, 0, obs('off')))!;
    expect(m.tone).toBe('audience');
    expect(m.audience).toMatchObject({ waiting: 0, word: 'Audience participation: on' });
    expect(m.obs).toBeNull();
    expect(m.label).toBe('Audience participation: on');
    expect(livePill(mix(true, 3, obs('off')))!.audience!.waiting).toBe(3);
  });

  it('says exactly "Audience participation: on" and never On air', () => {
    expect(AUDIENCE_WORD).toBe('Audience participation: on');
    for (const link of ['off', 'connecting', 'waiting', 'password', 'address', 'connected'] as const) {
      const m = livePill({ ...mix(true, 2, obs(link, true)), stopKey: 'Ctrl+Alt+K' })!;
      const everything = JSON.stringify(m);
      expect(everything).not.toMatch(/on air/i);
      expect(m.audience!.word).toBe('Audience participation: on');
    }
  });

  it('pressing the audience part turns it off, and the words say so; the arrow part is the way into the card', () => {
    const m = livePill({ ...mix(true, 3, obs('off')), stopKey: 'Ctrl+Alt+Shift+K' })!;
    expect(m.audience!.tip).toBe('Audience participation: on. Press to turn it off');
    expect(m.audience!.tipDetail).toMatch(/Ctrl\+Alt\+Shift\+K/);
    expect(m.audience!.tipDetail).toMatch(/does not touch OBS/);
    // The count is not lost: the arrow part says it, and so does the group label.
    expect(m.audience!.openTip).toBe('3 waiting. See the queue');
    expect(m.audience!.openLabel).toMatch(/3 waiting/);
    expect(m.label).toMatch(/3 waiting/);
    // With nothing waiting it is just the arrow, in plain words.
    expect(livePill(mix(true, 0, obs('off')))!.audience!.openLabel).toBe('See the queue and the counts');
  });

  it('OBS live with audience off is a red Live pill with no audience part', () => {
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

  it('audience on and OBS not running shows the audience part and a quiet OBS part, so it is not the same as OBS off', () => {
    const off = livePill(mix(true, 0, obs('off')))!;
    const gone = livePill(mix(true, 0, obs('waiting')))!;
    expect(gone.tone).toBe('audience');
    expect(gone.obs).toMatchObject({ kind: 'quiet', word: 'No OBS' });
    expect(gone.obs).not.toEqual(off.obs);
    expect(gone.label).toMatch(/OBS not found/);
  });

  it('both on with three waiting: the count stays with the audience part, OBS gets its own word', () => {
    const m = livePill(mix(true, 3, obs('connected', true)))!;
    expect(m.tone).toBe('audience');
    expect(m.audience!.waiting).toBe(3);
    expect(m.obs).toMatchObject({ kind: 'live', word: 'Live' });
    expect(m.label).toBe('Audience participation: on, 3 waiting. Live in OBS');
    // Turning it off ends the audience only, and the tooltip says so.
    expect(m.detail).toMatch(/does not stop your stream/);
  });

  it('OBS needing a password while audience is on says so next to the audience part, never behind a calmer face', () => {
    const m = livePill(mix(true, 1, obs('password')))!;
    expect(m.tone).toBe('audience');
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

  it('red is only ever OBS really recording or streaming: audience participation is never red', () => {
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
          const red = m.obs?.colour === 'red' || m.tone === 'live' || m.tone === 'rec';
          const mustBeRed = link === 'connected' && (streaming || recording);
          expect(red, `${audience} ${link} ${streaming} ${recording}`).toBe(mustBeRed);
        }
      }
    }
  });

  it('green is only OBS connected and ready: connected and not recording or streaming', () => {
    expect(obsColour('ready')).toBe('green');
    expect(obsColour('live')).toBe('red');
    expect(obsColour('rec')).toBe('red');
    expect(obsColour('fix')).toBe('fix');
    expect(obsColour('looking')).toBe('plain');
    expect(obsColour('quiet')).toBe('plain');
    for (const audience of [true, false]) {
      expect(livePill(mix(audience, 0, obs('connected')))!.obs!.colour).toBe('green');
      expect(livePill(mix(audience, 0, obs('connected', false, true)))!.obs!.colour).toBe('red');
      expect(livePill(mix(audience, 0, obs('connected', true)))!.obs!.colour).toBe('red');
      expect(livePill(mix(audience, 0, obs('waiting')))!.obs!.colour).toBe('plain');
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
          const face = [m.audience ? 'Audience 2' : '', m.obs ? `${m.obs.word}/${m.obs.kind}` : '', m.tone].join('|');
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
