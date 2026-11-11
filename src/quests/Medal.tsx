import { Icon } from '../ui/icons';
import type { Badge } from './types';

/** A round badge in the quest's colour. Unearned ones are an empty outline, so you can see what's still to find. */
export function Medal({ badge, earned = true, size = 44 }: { badge: Badge; earned?: boolean; size?: number }) {
  return (
    <span className={`qm${earned ? '' : ' qm-empty'}`} style={{ width: size, height: size, ['--medal' as string]: `var(${badge.color})` }} title={earned ? badge.name : `${badge.name} (not earned yet)`}>
      <Icon name={earned ? badge.icon : 'lock'} size={Math.round(size * 0.48)} />
    </span>
  );
}
