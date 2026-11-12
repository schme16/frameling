import { describe, expect, it } from 'vitest';
import type { Doc } from '../../src/core/format';
import { findTemplate } from '../../src/templates';
import { layerTracks } from '../../src/timeline/tracks';

// The rows of a layer's property keys only depend on that layer's own drawings, so an edit to another layer's drawing
// leaves them as they were (and is not worked out again, which on a big document was every layer on every edit).
describe('layer rows after an edit to another layer', () => {
  const logo = (): Doc => structuredClone(findTemplate('bouncing-logo')!.make());

  it('are the very same rows when only another layer drawing changed', () => {
    const doc = logo();
    const withRows = doc.layers.find((l) => layerTracks(doc, l).length > 0)!;
    const before = layerTracks(doc, withRows);
    expect(before.length).toBeGreaterThan(0);
    // The drawings table is a new object, and one drawing nobody here uses is a new object too.
    const other = Object.keys(doc.drawings).find((id) => !withRows.cels.some((c) => c.drawingId === id));
    const next: Doc = { ...doc, drawings: { ...doc.drawings } };
    if (other) next.drawings[other] = { ...next.drawings[other] } as never;
    expect(layerTracks(next, withRows)).toBe(before);
  });

  it('are worked out again when one of the layer own drawings changed', () => {
    const doc = logo();
    const withRows = doc.layers.find((l) => layerTracks(doc, l).length > 0)!;
    const before = layerTracks(doc, withRows);
    const own = withRows.cels[0].drawingId;
    const next: Doc = { ...doc, drawings: { ...doc.drawings, [own]: { ...doc.drawings[own] } as never } };
    expect(layerTracks(next, withRows)).not.toBe(before);
    expect(layerTracks(next, withRows).map((t) => t.id)).toEqual(before.map((t) => t.id));
  });
});
