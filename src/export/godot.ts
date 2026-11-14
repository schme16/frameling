// Godot exports: the Godot card in the sprite sheet picker (sprite frames, a ready scene, or a skeleton for a character
// with bones), the add-on that reads .flplay packages, and their help. A feature that can be turned off (Preferences >
// Features). A drawing holds nothing of Godot's, so there is nothing for opening a file to ask about; a saved sprite sheet
// setting that names Godot while it is off falls back to the next best (see normalizeSheet).
import { defineFeature } from '../features/feature';
import { interactivesEnabled } from '../features/flags';
import { godotAddonCommands, godotAddonHelp } from './godot-addon-commands';
import { godotHelp } from './godot-help';
import { registerEngine, type EngineInfo } from './types';

export const godotEngine: EngineInfo = { id: 'godot', title: 'Godot', files: 'Sprite frames and a ready scene', help: 'export-godot', game: true };

export const godotFeature = defineFeature({
  id: 'godot-export',
  name: 'Godot exports',
  about: 'Send your animation to the Godot game engine: an add-on, sprite frames and scenes.',
  optional: true,
  // The add-on reads .flplay packages, which only Export for Interactives makes, so it goes while Interactives is hidden.
  get commands() {
    return interactivesEnabled() ? godotAddonCommands : [];
  },
  get help() {
    return interactivesEnabled() ? [...godotHelp, ...godotAddonHelp] : godotHelp;
  },
  heldBackHelp: () => (interactivesEnabled() ? [] : godotAddonHelp),
  activate: () => registerEngine(godotEngine),
});
