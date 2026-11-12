// What start-up needs to know about the installed plugins, without the code that runs them (manager.ts, loaded after
// the first frame): the list of them and what state each is in.
import type { Permission, PluginManifest } from './manifest';
import { createStore } from '../ui/mini';

export type PluginStatus = 'off' | 'starting' | 'on' | 'problem';

export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  /** What the person allowed (may be less than asked: the internet and version 2's powers can be refused one by one). */
  granted: Permission[];
  network: string[];
  /** The version of the plugin that the decision was made for. */
  grantedFor?: string;
  status: PluginStatus;
  problem?: string;
}

export const plugins = createStore<InstalledPlugin[]>([]);
