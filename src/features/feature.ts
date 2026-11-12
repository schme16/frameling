/**
 * A built-in feature: one named piece of Frameling (Lip sync, Particles...) that says what it adds. The app registers
 * the pieces for it, tagged with its id, so an optional one can be turned off (Preferences > Features) and all of its
 * commands, panels, tools, help, quests, templates and menu entries go away, then come back when it is turned on,
 * without a restart. This is the trusted tier: it runs in the app like any other code. The sandboxed plugins in
 * src/plugins are the other tier.
 */
import type { ChoiceDef } from '../core/choices';
import type { Doc } from '../core/format';
import type { ExporterDef } from '../export/registry';
import type { Command, HelpTopic, PanelDef, Tool } from '../core/registry';
import type { Quest } from '../quests/types';
import type { PanelInfo } from '../ui/panelInfo';

export interface FeatureDescriptor {
  /** Stable id, also the key under `ext` for anything it keeps in a file. */
  id: string;
  /** Plain name people see ("Lip sync"). */
  name: string;
  /** One plain line on what it is for, shown in Preferences > Features. */
  about: string;
  /** True when a person may turn it off. Core parts of Frameling (drawing, timeline, symbols...) are not optional. */
  optional?: boolean;
  /**
   * True while the feature still registers itself when its folder is imported, so it cannot be switched yet. It is
   * listed here to say what is planned, and left out of Preferences > Features until it moves onto this descriptor.
   */
  legacy?: boolean;
  /** Feature ids this one needs. Turning one of them off needs this one off first; turning this on turns them on. */
  requires?: string[];

  commands?: Command[];
  panels?: PanelDef[];
  tools?: Tool[];
  help?: HelpTopic[];
  quests?: Quest[];
  /** Ways to export (the cards in the Export dialog) that only make sense with the feature. */
  exporters?: ExporterDef[];
  /** Remembered choices (Preferences > Behaviour) that only make sense with the feature. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  choices?: ChoiceDef<any>[];
  /** Ids of built-in templates this feature owns (hidden from the New dialog while it is off). */
  templates?: string[];
  /** Command ids to add at the end of a menu, by the menu's label. */
  menus?: { menu: string; items: string[] }[];
  /** Rail name, blurb and Properties placement for its panels, by panel id. */
  sections?: Record<string, PanelInfo>;

  /** Says which file paths it opens (an Interactives package, say), so opening one while it is off can offer to turn it on. */
  opens?(path: string): boolean;
  /** True when a document holds data this feature made, so opening it with the feature off can offer to turn it on. */
  usedBy?(doc: Doc): boolean;
  /** Anything else it registers. Runs while the feature is registered as its owner, so what it adds is taken away again with it. */
  activate?(): void;
  /** Anything it must undo by hand that the registries cannot (timers, listeners). */
  deactivate?(): void;
}

/** Reads better than a bare object at the call site, and checks the shape. */
export const defineFeature = (d: FeatureDescriptor): FeatureDescriptor => d;

/** Can a person switch it? Optional, and moved onto a descriptor. */
export const isSwitchable = (d: FeatureDescriptor): boolean => !!d.optional && !d.legacy;
