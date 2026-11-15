// Plain-words summaries of what the gate has kept, for the On air card. Pure, so the wording is tested.
import type { AudienceCounts, RejectReason } from './gate';

const WHY: Record<RejectReason, string> = {
  off: 'while it was off',
  unknown: 'not allowed',
  unavailable: 'not available',
  invalid: 'not understood',
  cooldown: 'too soon',
  'queue-full': 'queue full',
};

/** "12 done, 5 turned away (3 too soon, 2 queue full)". Says nothing about who. */
export function countsLine(c: AudienceCounts): string {
  const turned = Object.values(c.rejected).reduce((a, b) => a + b, 0);
  const parts = [`${c.ran} done`];
  if (turned) {
    const why = (Object.keys(WHY) as RejectReason[]).filter((r) => c.rejected[r] > 0).map((r) => `${c.rejected[r]} ${WHY[r]}`);
    parts.push(`${turned} turned away (${why.join(', ')})`);
  }
  const dropped = c.expired + c.cleared;
  if (dropped) parts.push(`${dropped} dropped from the queue`);
  if (c.failed) parts.push(`${c.failed} did not work`);
  return parts.join(', ');
}

/** "2s", "1 min": how long something has waited. */
export function waited(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)} min`;
}
