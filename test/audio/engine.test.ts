// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { setChoice } from '../../src/core/choices';
import { Store } from '../../src/core/store';

// A pretend Web Audio: decoding gives a 2 second sound, playing just keeps a list.
const log = vi.hoisted(() => ({ starts: [] as { when: number; offset: number; length?: number }[], stops: 0, time: 0 }));

class FakeParam {
  value = 1;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  cancelScheduledValues() {}
}
class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect(n: unknown) {
    return n;
  }
  start(when: number, offset: number, length?: number) {
    log.starts.push({ when, offset, length });
  }
  stop() {
    log.stops++;
  }
}
class FakeCtx {
  state = 'running';
  destination = {};
  get currentTime() {
    return log.time;
  }
  resume() {
    return Promise.resolve();
  }
  createBufferSource() {
    return new FakeSource();
  }
  createGain() {
    return { gain: new FakeParam(), connect: (n: unknown) => n };
  }
}
class FakeOffline {
  decodeAudioData() {
    return Promise.resolve({ duration: 2, numberOfChannels: 1, sampleRate: 48000, getChannelData: () => new Float32Array(10) });
  }
}
vi.stubGlobal('AudioContext', FakeCtx);
vi.stubGlobal('OfflineAudioContext', FakeOffline);

import { installAudio, voiceCount } from '../../src/audio/engine';
import { decodeClip } from '../../src/audio/decode';

async function setup(start = 0) {
  const doc = newDoc({ fps: 24, length: 96 });
  doc.audio = [{ id: 'a', name: 'a', start, data: new Uint8Array([1, 2, 3]), mime: 'audio/wav', duration: 2 }];
  const store = new Store(doc);
  await decodeClip(doc.audio[0]);
  const off = installAudio(store);
  return { store, off };
}

describe('sound while playing', () => {
  beforeEach(() => {
    log.starts = [];
    log.stops = 0;
    log.time = 0;
    setChoice('audio.scrub', undefined);
  });

  it('starts from the playhead when play begins and stops when it ends', async () => {
    const { store, off } = await setup(0);
    store.setUi({ frame: 12 });
    log.starts = [];
    store.setUi({ playing: true });
    expect(log.starts).toHaveLength(1);
    expect(log.starts[0].offset).toBeCloseTo(0.5, 6);
    expect(log.starts[0].length).toBeUndefined();
    store.setUi({ playing: false });
    expect(log.stops).toBeGreaterThan(0);
    off();
  });

  it('starts again when the playhead jumps away from the sound clock (a loop wrapping round)', async () => {
    const { store, off } = await setup(0);
    store.setUi({ frame: 40 });
    log.starts = [];
    store.setUi({ playing: true });
    expect(log.starts).toHaveLength(1);
    // The sound clock has run 0.5 s (12 frames), so the picture should be on 52. Following normally does nothing.
    log.time = 0.5;
    store.setUi({ frame: 52 });
    expect(log.starts).toHaveLength(1);
    // A loop puts the picture back at the start: the sound follows.
    store.setUi({ frame: 0 });
    expect(log.starts).toHaveLength(2);
    expect(log.starts[1].offset).toBe(0);
    off();
  });

  it('plays a short snippet when the playhead moves while paused, if scrubbing is on', async () => {
    const { store, off } = await setup(0);
    store.setUi({ frame: 24 });
    expect(log.starts).toHaveLength(1);
    expect(log.starts[0].offset).toBeCloseTo(1, 6);
    expect(log.starts[0].length).toBeGreaterThan(0);
    expect(log.starts[0].length).toBeLessThan(0.5);
    off();
  });

  it('keeps quiet when scrubbing is off, when the sound is muted, or when the whole document changed', async () => {
    const { store, off } = await setup(0);
    setChoice('audio.scrub', 'off');
    store.setUi({ frame: 10 });
    expect(log.starts).toHaveLength(0);
    setChoice('audio.scrub', 'on');
    store.update('Mute', (d) => void (d.audio![0].muted = true));
    store.setUi({ frame: 11 });
    expect(log.starts).toHaveLength(0);
    store.load(newDoc());
    expect(log.starts).toHaveLength(0);
    expect(voiceCount()).toBeGreaterThanOrEqual(0);
    off();
  });

  it('waits for a sound that starts later in the animation', async () => {
    const { store, off } = await setup(24);
    log.starts = [];
    store.setUi({ playing: true });
    expect(log.starts[0].when).toBeCloseTo(1, 6);
    expect(log.starts[0].offset).toBe(0);
    off();
  });
});
