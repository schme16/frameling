import { useSyncExternalStore } from 'react';
import { featuresVersion, onFeaturesChange } from './host';

/** Changes whenever a feature is turned on or off, so a component that reads the registries re-reads them. */
export function useFeaturesVersion(): number {
  return useSyncExternalStore((cb) => onFeaturesChange(cb), featuresVersion);
}
