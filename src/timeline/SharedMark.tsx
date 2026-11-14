import type { DrawingUse } from '../core/sharedDrawings';
import { sharedWords } from '../core/sharedDrawings';
import { Icon } from '../ui/icons';

/** How wide the link and number are, with a little air round them. */
const ROOM = 30;

/**
 * The mark on a block whose drawing is shown in more than one place: a link and how many places, just after the key at
 * the block's start (so a long hold still shows it at the left). When the block is too narrow there is only the edge.
 */
export function SharedMark({ use, width, at }: { use: DrawingUse; width: number; at: number }) {
  if (width < at + ROOM) return null;
  return (
    <span className="tl-shared" style={{ left: at }} aria-hidden="true">
      <Icon name="link" size={10} />
      {use.total}
    </span>
  );
}

/** What the block says when you hover it, after anything it already said. */
export function sharedTitle(use: DrawingUse | undefined, first?: string): string | undefined {
  const w = sharedWords(use);
  if (!w) return first;
  const tail = `${w} Change one and they all change. Right-click, Make this drawing its own, to stop that.`;
  return first ? `${first} ${tail}` : tail;
}
