// Particles as a kind of shape: how they are drawn, hit, moved, posed and read from a file, and how the export formats
// write them. Registered for good when the particles folder loads, so a drawing with an emitter looks right and exports
// whether or not the Particles feature is switched on (that only hides the tool, panel and commands).
import { transformPlaced } from '../canvas/geometry';
import type { ParticlesShape } from '../core/format';
import { registerShapeKind } from '../core/shapeKinds';
import { registerShapeExport } from '../export/shapeExport';
import { drawParticles, poseParticles, posedParticles } from './draw';
import { emitterBox } from './model';
import { readParticlesShape } from './read';

registerShapeKind<ParticlesShape>({
  type: 'particles',
  draw: (g, s, drawInstance) => drawParticles(g, s, drawInstance),
  extend(s, grow) {
    for (const p of posedParticles(s)) grow(p.x, p.y, p.size * 2);
  },
  bounds: (s) => emitterBox(s),
  hit: () => true,
  transform: transformPlaced,
  moving: () => true,
  pose(doc, s, local, env) {
    const sym = s.sprite === 'symbol' && s.symbolId ? env.symbol(s.symbolId) : null;
    return poseParticles(doc, s, local, (f) => (sym ? sym.at(f) : null), sym?.length ?? 1);
  },
  read: readParticlesShape,
});

registerShapeExport<ParticlesShape>('particles', { feature: 'particles', load: () => import('./exports').then((m) => m.particlesExport) });
