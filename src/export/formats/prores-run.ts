// ProRes goes to FFmpeg on the desktop side instead of through the shared run.
import { proresSupport, runProres } from '../prores';
import type { FormatSupport } from '../registry';

export const run = runProres;
export async function support(fresh: boolean): Promise<FormatSupport> {
  const p = await proresSupport(fresh);
  return { why: !p.ok ? (p.reason ?? 'ProRes is not available here.') : null };
}
