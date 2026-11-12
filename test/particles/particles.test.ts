import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { poseAt } from '../../src/core/symbols';
import { emitterBox, maxLife, mixHex, newParticles, PARTICLE_PRESETS, particlesAt, rand } from '../../src/particles/model';
import { posedParticles } from '../../src/particles/draw';
import { readParticlesShape } from '../../src/particles/read';
import { loadFile, saveFile } from '../../src/io/file';
import { particlesToSvg } from '../../src/particles/exports';

const emitter = (preset = 'sparkle', patch = {}) => ({ ...newParticles('p1', preset, { x: 100, y: 100 }, { width: 400, height: 300 }, 7), ...patch });

describe('particles', () => {
  it('has the six presets in plain words', () => {
    expect(PARTICLE_PRESETS.map((p) => p.label)).toEqual(['Sparkle burst', 'Smoke', 'Rain', 'Snow', 'Confetti', 'Dust']);
    for (const p of PARTICLE_PRESETS) expect(p.description).not.toMatch(/—/);
  });

  it('is the same every time for the same seed, and different for another', () => {
    const a = particlesAt(emitter(), 0.4);
    expect(particlesAt(emitter(), 0.4)).toEqual(a);
    expect(particlesAt(emitter('sparkle', { seed: 8 }), 0.4)).not.toEqual(a);
    expect(rand(1, 2, 3)).toBe(rand(1, 2, 3));
    expect(rand(1, 2, 3)).toBeGreaterThanOrEqual(0);
    expect(rand(1, 2, 3)).toBeLessThan(1);
  });

  it("doesn't depend on the frames before it (scrubbing backwards gives the same particles)", () => {
    const s = emitter('smoke', { prewarm: false });
    const late = particlesAt(s, 2);
    particlesAt(s, 0.1);
    particlesAt(s, 5);
    expect(particlesAt(s, 2)).toEqual(late);
  });

  it('bursts all at once, then dies out after its life', () => {
    const s = emitter('sparkle');
    expect(particlesAt(s, 0).every((p) => p.alpha === 0)).toBe(true);
    expect(particlesAt(s, 0.05).length).toBe(36);
    expect(particlesAt(s, maxLife(s) + 0.01)).toHaveLength(0);
  });

  it('emits at its rate and stops after "Stop after"', () => {
    const s = emitter('sparkle', { burst: 0, rate: 10, life: 100, variance: 0, emitFor: 0 });
    expect(particlesAt(s, 1).length).toBe(11);
    expect(particlesAt({ ...s, emitFor: 0.5 }, 3).length).toBe(5);
  });

  it('starts full when prewarmed', () => {
    const s = emitter('rain');
    expect(particlesAt(s, 0).length).toBeGreaterThan(50);
    expect(particlesAt({ ...s, prewarm: false }, 0).length).toBeLessThanOrEqual(1);
  });

  it('falls under gravity and is pushed by wind', () => {
    const s = emitter('sparkle', { burst: 1, speed: 0, variance: 0, gravity: 100, wind: 50, drag: 0, wobble: 0, life: 10 });
    const [p] = particlesAt(s, 1);
    expect(p.y).toBeCloseTo(150);
    expect(p.x).toBeCloseTo(125);
    // Drag slows it: never as far as without.
    const [q] = particlesAt({ ...s, drag: 2 }, 1);
    expect(q.y).toBeLessThan(150);
    expect(q.y).toBeGreaterThan(100);
  });

  it('caps how many are alive', () => {
    const s = emitter('sparkle', { burst: 0, rate: 1000, life: 10, max: 50 });
    expect(particlesAt(s, 5).length).toBe(50);
  });

  it('turns its direction and start line with the emitter', () => {
    const s = emitter('sparkle', { burst: 1, speed: 100, spread: 0, variance: 0, direction: 0, drag: 0, gravity: 0, wobble: 0, life: 10 });
    s.transform.rotation = 90;
    const [p] = particlesAt(s, 1);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(200);
    const box = emitterBox({ ...emitter('rain'), transform: { ...s.transform, rotation: 0 } });
    expect(box.w).toBeCloseTo(480);
  });

  it('mixes colours over life', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#ff000000', 1)).toBe('#ff000000');
  });

  it('poses per frame from the start of its key', () => {
    const doc = newDoc({ width: 100, height: 100, fps: 10 });
    const layer = newVectorLayer('P');
    const s = emitter('sparkle');
    doc.drawings.v = { id: 'v', kind: 'vector', shapes: [s] };
    layer.cels = [{ id: 'c', start: 4, length: 20, drawingId: 'v' }];
    doc.layers = [layer];
    const p = poseAt(doc, layer, 7);
    const shape = p?.kind === 'vector' ? p.shapes[0] : null;
    expect(shape?.type).toBe('particles');
    expect((shape as unknown as { posedTime: number }).posedTime).toBeCloseTo(0.3);
    expect(posedParticles(shape as never)).toEqual(particlesAt(s, 0.3));
  });

  it('saves and opens, and repairs bad values from the preset', () => {
    const doc = newDoc({ width: 100, height: 100 });
    const s = emitter('snow', { wobble: 4, symbolId: 'sym', sprite: 'symbol' as const });
    const id = Object.keys(doc.drawings)[0] ?? 'v1';
    doc.drawings[id] = { id, kind: 'vector', shapes: [s] };
    doc.layers[0].cels = [{ id: 'c', start: 0, length: 1, drawingId: id }];
    const back = loadFile(saveFile(doc)).doc.drawings[id];
    expect(back.kind === 'vector' && back.shapes[0]).toEqual(s);
    const bad = readParticlesShape({ id: 'x', preset: 'rain', rate: -5, spread: 999, sprite: 'nope', colorStart: 'red' });
    expect(bad!.rate).toBe(0);
    expect(bad!.spread).toBe(180);
    expect(bad!.sprite).toBe('streak');
    expect(bad!.colorStart).toBe('#9fc7ff');
  });

  it('exports particles to SVG', () => {
    const svg = particlesToSvg({ ...emitter('confetti'), posedTime: 0.5 } as never);
    expect((svg.match(/<rect/g) ?? []).length).toBe(90);
  });
});
