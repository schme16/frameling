// The starter brushes that are one brush with two halves: the vector brush and the pixel brush that draw the same thing
// under the same name. In the one brush list each appears once, as the vector starter with the pixel one as its `pair`.
// The look-alikes (Ink and Tapered ink, and so on) are not here: they stay two brushes (see test/brushes/parityGaps.ts).

/** [vector starter id, pixel starter id] for each brush that is one brush with two halves. */
export const MERGED_PAIRS: readonly (readonly [string, string])[] = [
  ['starter:pencil', 'starter:px-pencil'],
  ['starter:soft-pencil', 'starter:px-soft-pencil'],
  ['starter:sketch-pencil', 'starter:px-sketch-pencil-medium'],
  ['starter:chalk', 'starter:px-chalk'],
  ['starter:soft-pastel', 'starter:px-soft-pastel'],
  ['starter:crayon', 'starter:px-crayon'],
  ['starter:vine-charcoal', 'starter:px-vine-charcoal'],
  ['starter:compressed-charcoal', 'starter:px-compressed-charcoal'],
  ['starter:stars', 'starter:px-stars'],
  ['starter:sparkles', 'starter:px-sparkles'],
  ['starter:hearts', 'starter:px-hearts'],
  ['starter:dotted-line', 'starter:px-dotted'],
  ['starter:stipple', 'starter:px-stipple'],
  ['starter:spatter', 'starter:px-spatter'],
  ['starter:confetti', 'starter:px-confetti'],
  ['starter:dry-bristle', 'starter:px-dry-brush'],
  ['starter:mechanical', 'starter:px-mechanical'],
  ['starter:colour-pencil', 'starter:px-colour-pencil'],
  ['starter:gel', 'starter:px-gel'],
  ['starter:ballpoint', 'starter:px-ballpoint'],
  ['starter:brush-pen', 'starter:px-brush-pen'],
  ['starter:dip-pen', 'starter:px-dip-pen'],
  ['starter:fine-marker', 'starter:px-fine-marker'],
  ['starter:block-marker', 'starter:px-block-marker'],
  ['starter:brush-marker', 'starter:px-brush-marker'],
  ['starter:tapered', 'starter:px-tapered'],
  ['starter:round-brush', 'starter:px-round-brush'],
  ['starter:dry-brush', 'starter:px-dry-brush-crayon'],
  ['starter:charcoal', 'starter:px-charcoal'],
  ['starter:oil-pastel', 'starter:px-oil-pastel'],
  ['starter:leaves', 'starter:px-leaves'],
  ['starter:falling-leaves', 'starter:px-falling-leaves'],
  ['starter:paw-prints', 'starter:px-paw-prints'],
  ['starter:dashed-line', 'starter:px-dashed-line'],
  ['starter:broad', 'starter:px-broad-nib'],
  ['starter:round-nib', 'starter:px-round-nib'],
  ['starter:pressure-pencil', 'starter:px-pressure-pencil'],
  ['starter:pressure-spray', 'starter:px-pressure-spray'],
  ['starter:speckle', 'starter:px-speckle'],
  ['starter:sprinkle', 'starter:px-sprinkle'],
  ['starter:slash', 'starter:px-slash'],
];

/** The pixel starter ids that went into a pair, by the vector id they became. Old favourites, recent and picked brushes point at the old ids. */
const OLD_IDS = new Map<string, string>(MERGED_PAIRS.map(([v, p]) => [p, v]));

/** The id a brush has in the one list now: an old pixel starter id of a merged pair is the vector starter's. Any other id is itself. */
export const canonicalId = (id: string): string => OLD_IDS.get(id) ?? id;

/** True for a pixel starter that went into a pair, so the one list leaves it out. */
export const isMergedAway = (pixelId: string): boolean => OLD_IDS.has(pixelId);
