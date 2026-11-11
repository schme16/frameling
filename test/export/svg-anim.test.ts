// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { InstanceShape } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { makeSymbol } from '../../src/core/symbols';
import { animatedSvg, visibilityKeyframes } from '../../src/export/svg-anim';
import { makeBouncingBall } from '../../src/templates/bouncing-ball';
import { addVectorLayer, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

describe('animated SVG', () => {
  it('switches visibility exactly on frame boundaries', () => {
    expect(visibilityKeyframes([[2, 4]], 10)).toBe('0%{visibility:hidden}20%{visibility:visible}40%{visibility:hidden}100%{visibility:hidden}');
    expect(visibilityKeyframes([[0, 3], [6, 10]], 10)).toBe('0%{visibility:visible}30%{visibility:hidden}60%{visibility:visible}100%{visibility:visible}');
  });

  it('writes each drawing once with its own timing, looping by default', () => {
    const doc = makeBouncingBall();
    const svg = animatedSvg(doc);
    const dur = `${Math.round((doc.length / doc.fps) * 1e4) / 1e4}s`;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`${dur} step-end infinite`);
    expect(animatedSvg(doc, { loop: false })).toContain('1 forwards');
    // Well formed enough to parse.
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
  });

  it('moves a tweened symbol copy with transform keyframes instead of redrawing it', () => {
    const doc = newDoc({ width: 200, height: 100, length: 10, fps: 10 });
    doc.layers = [];
    const l = addVectorLayer(doc, 'Mover');
    const d = vectorDrawing(doc, [fill([rectPath(0, 0, 10, 10)], '#ff0000')]);
    makeSymbol(doc, d.id, [d.shapes[0].id], { x: 5, y: 5 }, 'Box');
    const inst = d.shapes[0] as InstanceShape;
    const end = vectorDrawing(doc, []);
    end.shapes = [{ ...inst, id: uid('s'), transform: { ...inst.transform, x: 105 } }];
    hold(l, d.id, 0, 8);
    hold(l, end.id, 8, 2);
    l.cels[0].tween = { ease: 'linear' };
    const svg = animatedSvg(doc);
    // One rectangle per key, not one per frame.
    expect(svg.match(/<path /g)?.length).toBe(2);
    expect(svg).toMatch(/@keyframes m\d+\{0%\{transform:matrix\(1,0,0,1,0,0\);\}10%\{transform:matrix\(1,0,0,1,12\.5,0\);\}/);
  });
});
