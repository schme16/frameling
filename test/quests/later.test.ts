// @vitest-environment jsdom
// The later quests (bones, glow, particles, text, camera): each can be finished with nothing but "Show me", and
// their checks don't fire early.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/timeline';
import '../../src/symbols';
import { getHelp } from '../../src/core/registry';
import { setScheduler } from '../../src/timeline/playback';
import { overlays } from '../../src/ui/overlays';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { readProbe } from '../../src/quests/probe';
import '../../src/quests/library';
import '../../src/ui/helpTopics';
import { BONES_QUEST, makeArmScene, posedLater } from '../../src/rig/quest';
import { GLOW_QUEST, bigGlow, flickers, makeLanternScene } from '../../src/effects/quest';
import { PARTICLES_QUEST, emitters, recoloured, tweakedMotion } from '../../src/particles/quest';
import { TEXT_QUEST, texts } from '../../src/text/quest';
import { CAMERA_QUEST, cameraMoves, makeValleyScene } from '../../src/camera/quest';
import type { Quest } from '../../src/quests/types';
import { rig, vectorDoc } from './helpers';
import '../../src/rig';
import '../../src/effects';
import { particlesFeature } from '../../src/particles';
import { textFeature } from '../../src/text';
import { registerFeatures } from '../../src/features/host';
import { cameraFeature } from '../../src/camera';

// The lessons use commands and tools the optional features add, so they run with those on.
registerFeatures([cameraFeature, particlesFeature, textFeature]);

beforeEach(() => {
  setScheduler({ now: () => 0, request: () => 0, cancel: () => {} });
  overlays.set((o) => ({ ...o, sheet: null }));
  setViewSettings({ throughCamera: false });
});

async function playThrough(q: Quest, r: ReturnType<typeof rig>) {
  expect(r.engine.start(q.id)).toBe(true);
  for (let i = 0; i < q.steps.length + 2 && r.progress.get().active; i++) await r.engine.showMe();
  expect(r.progress.get()).toMatchObject({ active: null, completed: [q.id], badges: [q.badge!.id] });
}

const LATER = [BONES_QUEST, GLOW_QUEST, PARTICLES_QUEST, TEXT_QUEST, CAMERA_QUEST];

describe('the later quests', () => {
  it('have original badge names, plain words and help that exists', () => {
    for (const q of LATER) {
      expect(q.badge?.name.length, q.id).toBeGreaterThan(2);
      for (const s of q.steps) {
        expect(`${s.say} ${s.why ?? ''} ${s.hint ?? ''}`, `${q.id}/${s.id}`).not.toMatch(/—/);
        if (s.help) expect(getHelp(s.help), `${q.id}/${s.id} -> ${s.help}`).toBeTruthy();
      }
    }
  });

  it('start on their own page, and know it when it is open', () => {
    expect(BONES_QUEST.ready!(rig([], makeArmScene()).store.get())).toBe(true);
    expect(GLOW_QUEST.ready!(rig([], makeLanternScene()).store.get())).toBe(true);
    expect(CAMERA_QUEST.ready!(rig([], makeValleyScene()).store.get())).toBe(true);
    expect(BONES_QUEST.ready!(rig([], vectorDoc()).store.get())).toBe(false);
    const valley = makeValleyScene();
    expect(valley.layers.some((l) => l.kind === 'camera' || l.depth)).toBe(false);
  });
});

describe('Bones and a pose', () => {
  it('pose: only a turn on a later frame counts', () => {
    const r = rig([BONES_QUEST], makeArmScene(), undefined, { run: true });
    expect(posedLater(r.store.get())).toBe(false);
  });

  it('can be finished with nothing but Show me, leaving a waving arm', async () => {
    const r = rig([BONES_QUEST], makeArmScene(), undefined, { run: true, probe: readProbe });
    await playThrough(BONES_QUEST, r);
    const s = r.store.get();
    expect(s.doc.layers.filter((l) => l.bind).map((l) => l.name).sort()).toEqual(['Forearm', 'Upper arm']);
    expect(posedLater(s)).toBe(true);
  });
});

describe('Make it glow', () => {
  it('size and flicker wait for real changes', () => {
    const s = rig([GLOW_QUEST], makeLanternScene()).store.get();
    expect(bigGlow(s)).toBe(false);
    expect(flickers(s)).toBe(false);
  });

  it('can be finished with nothing but Show me', async () => {
    const r = rig([GLOW_QUEST], makeLanternScene(), undefined, { run: true, probe: readProbe });
    await playThrough(GLOW_QUEST, r);
    const layers = r.store.get().doc.layers;
    expect(layers.find((l) => l.name === 'Light')!.blend).toBe('add');
    const glow = layers.find((l) => l.name === 'Lantern')!.effects![0];
    expect(glow.kind).toBe('glow');
    expect(glow.keys!.map((k) => k.frame)).toEqual([0, 6]);
  });
});

describe('Particle party', () => {
  it('can be finished with nothing but Show me', async () => {
    const r = rig([PARTICLES_QUEST], vectorDoc(), undefined, { run: true, probe: readProbe });
    await playThrough(PARTICLES_QUEST, r);
    const doc = r.store.get().doc;
    expect(emitters(doc)).toHaveLength(1);
    expect(emitters(doc)[0].preset).toBe('confetti');
    expect(tweakedMotion(doc)).toBe(true);
    expect(recoloured(doc)).toBe(true);
  });

  it('a fresh preset is neither tweaked nor recoloured', async () => {
    const r = rig([PARTICLES_QUEST], vectorDoc(), undefined, { run: true, probe: readProbe });
    r.engine.start(PARTICLES_QUEST.id);
    await r.engine.showMe();
    const doc = r.store.get().doc;
    expect(emitters(doc)).toHaveLength(1);
    expect(tweakedMotion(doc)).toBe(false);
    expect(recoloured(doc)).toBe(false);
  });
});

describe('Say it with text', () => {
  it('can be finished with nothing but Show me, with room to play', async () => {
    const r = rig([TEXT_QUEST], vectorDoc(), undefined, { run: true, probe: readProbe });
    await playThrough(TEXT_QUEST, r);
    const doc = r.store.get().doc;
    const t = texts(doc)[0];
    expect(t.text.text).toBe('Hello!');
    expect(t.text.animators!.map((a) => a.kind)).toEqual(['scale', 'wave']);
    expect(doc.length).toBeGreaterThanOrEqual(36);
    expect(doc.layers.find((l) => l.id === t.layerId)!.cels[t.celIndex].length).toBeGreaterThanOrEqual(36);
  });
});

describe('Camera move', () => {
  it('can be finished with nothing but Show me', async () => {
    const r = rig([CAMERA_QUEST], makeValleyScene(), undefined, { run: true, probe: readProbe });
    await playThrough(CAMERA_QUEST, r);
    const s = r.store.get();
    expect(cameraMoves(s)).toBe(true);
    const cam = s.doc.layers.find((l) => l.kind === 'camera')!;
    expect(cam.cels[0].tween).toBeTruthy();
    expect(s.doc.layers.find((l) => l.name === 'Far hills')!.depth).toBe(3);
  });
});
