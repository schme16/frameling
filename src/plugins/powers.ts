// The powers a plugin can ask for, in plain words, and which of them Frameling stops to ask about. Pure.
import { PERMISSIONS, type Decision, type Permission, type PluginManifest } from './manifest';

/**
 * The powers a version 2 plugin must be allowed one by one. Each one is off until the person turns it on, and a plugin
 * that was refused keeps running with that part switched off. (The internet is the same kind of switch, for any version.)
 */
export const ELEVATED: Permission[] = ['document.edit', 'tools', 'canvas', 'shapes'];

/** What each power could do in the wrong hands, in words anyone can follow. */
export const RISKS: Partial<Record<Permission, string>> = {
  'document.edit': 'It can change, move or delete anything in your drawing. You can undo each change, but a faulty plugin could spoil a lot of work. Save a copy first.',
  tools: 'While one of its tools is picked it sees every click and drag on your canvas. It can change your drawing too, if you allowed that.',
  canvas: 'It can put marks on top of your canvas, so a careless or dishonest plugin could cover or mislead what you see. The marks never end up in your files.',
  shapes: 'It can add its own shapes to your drawing, as many as it likes. They are ordinary shapes you can undo or delete.',
  network: 'It can send what it can see to the sites it listed. Only allow this if you trust where it comes from.',
};

/** The powers in this manifest that need a yes of their own. A version 1 plugin has none (it is told what it asks, as before). */
export function elevatedIn(m: Pick<PluginManifest, 'permissions' | 'apiVersion'>): Permission[] {
  return m.apiVersion >= 2 ? ELEVATED.filter((p) => m.permissions.includes(p)) : [];
}

/** True when the manifest has anything to stop and ask about: a power of its own, or the internet. */
export const needsChoices = (m: Pick<PluginManifest, 'permissions' | 'apiVersion'>): boolean => elevatedIn(m).length > 0 || m.permissions.includes('network');

/** What the person decided, as a Decision: the powers that were not elevated are always on, the rest as chosen. */
export function decide(m: Pick<PluginManifest, 'permissions' | 'network' | 'apiVersion'>, chosen: Permission[], internet: boolean): Decision {
  const elevated = elevatedIn(m);
  const permissions = m.permissions.filter((p) => (p === 'network' ? internet : elevated.includes(p) ? chosen.includes(p) : true));
  return { permissions, network: internet ? [...m.network] : [], asked: [...m.permissions], askedNetwork: [...m.network] };
}

/** One line for a list: the power's name. */
export const powerName = (p: Permission): string => PERMISSIONS[p].label;

/** The powers it asked for that are not on now (so Preferences can offer to turn them on). */
export function off(m: Pick<PluginManifest, 'permissions'>, granted: Permission[]): Permission[] {
  return m.permissions.filter((p) => !granted.includes(p));
}
