// Help for sending animations to Godot: the sprite sheet steps and the bones export. They belong to the Godot exports
// feature (godot.ts), so they are hidden with it.
import type { HelpTopic } from '../core/registry';

export const godotHelp: HelpTopic[] = [
  {
    id: 'export-godot-bones',
    title: 'Bones in Godot: a character you can keep animating',
    section: 'Exporting',
    media: 'export-godot-bones.png',
    summary: 'Send a character with bones to Godot as a skeleton, its parts and every clip (with symbols, camera and looks), so you can change poses and timing in Godot.',
    keywords: ['godot', 'skeleton2d', 'bone2d', 'animationplayer', 'polygon2d', 'rig', 'bones', 'cut-out', 'tscn', 'editable', 'camera2d', 'parallax2d', 'symbol', 'effects', 'blend'],
  },
  {
    id: 'export-godot',
    title: 'Using sprites in Godot',
    section: 'Exporting',
    media: 'export-godot.png',
    summary: 'Step by step: from Frameling to an animated sprite in your Godot 4 project.',
    keywords: ['godot', 'animatedsprite2d', 'spriteframes', 'tres', 'tscn', 'game engine', 'res://', 'atlastexture'],
  },
];
