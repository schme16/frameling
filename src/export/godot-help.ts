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
    body: `A sprite sheet bakes every frame into a picture. For a character with [bones](help:rig) you can send the skeleton itself, and keep animating it in Godot.

## In Frameling

1. Press **Ctrl+E**, pick **Sprite sheet**, then the **Godot** card.
2. Under it, pick **Bones (editable in Godot)**. (Only shown when your drawing has bones.)
3. Check **Where the picture will live in your Godot project**. The parts go in the same folder.
4. Press **Export** and choose that folder inside your Godot project.

## What you get

- A scene (\`.tscn\`) with a **Skeleton2D** and a **Bone2D** for every bone.
- A picture for every part. Parts that follow one bone are **Sprite2D** nodes on that bone. Layers that [bend](help:rig-bend) are **Polygon2D** meshes with your [painted weights](help:rig-weights).
- An **AnimationPlayer** with every clip, at your frame rate. It plays the first one straight away.

Drag the \`.tscn\` into your scene. Change any key in the AnimationPlayer, or play another clip from a script:

\`\`\`
$AnimationPlayer.play("walk")
\`\`\`

## Good to know

- **Steady** and **Gentle** glides use Godot's own easing. Other easings get a key on every frame. Held poses snap. [Squash and stretch](help:rig-stretch) becomes each bone's scale. Swapped drawings (mouths, hands) swap the part's picture.

## Symbols, camera and looks

- A [symbol](help:symbols) with its own bones comes as a node for each copy, with its own Skeleton2D and parts. Its place, fade and [timeline](help:symbol-properties) are keys. On a layer that follows a bone, the copy sits under that bone, inside symbols too. On a layer with effects or masks, or a bent one, it is drawn into the pictures.
- A symbol that fades is a **CanvasGroup**: it fades as one picture, so overlaps don't show through, bones symbols inside too (a faded one inside is drawn into pictures, with no live skeleton). Parts that can't be ordered by the scene tree, or use Add or Multiply, fade alone; the export window says why.
- A symbol copied large gets bigger pictures, up to 4 times your export size (less on a huge stage), so it stays sharp.
- The [camera](help:camera) becomes a **Camera2D** with position, zoom and turn keys. Layers with a depth go under a **Parallax2D**.
- Camera and depth layers line up when your Godot window is the stage size times the export scale. For other sizes, attach the saved \`-fit-window.gd\` to the scene's root, or set Project Settings > Display > Window to that size with Stretch Mode **canvas_items** and Aspect **keep**.
- A layer's fade is the node's modulate. **Add** and **Multiply** use a CanvasItemMaterial (Screen becomes Add, other modes draw normal). A symbol's colour wash uses a tiny shader saved beside the scene.
- [Effects](help:effects) are baked into the part's picture, since Godot has none built in. So are **masks** and "clip to the layer below", when the part and the mask move together. One that follows a bone, or sits at another depth, is left out.
- Hidden or reference layers inside a symbol with effects are left out.

The export window lists what was baked or left out for your drawing.`,
  },
  {
    id: 'export-godot',
    title: 'Using sprites in Godot',
    section: 'Exporting',
    media: 'export-godot.png',
    summary: 'Step by step: from Frameling to an animated sprite in your Godot 4 project.',
    keywords: ['godot', 'animatedsprite2d', 'spriteframes', 'tres', 'tscn', 'game engine', 'res://', 'atlastexture'],
    body: `This takes about a minute. It's written for Godot 4.

## In Frameling

1. Press **Ctrl+E**, pick **Sprite sheet**, then the **Godot** card.
2. For pixel art, pick **Art size**.
3. Leave **Also make a ready-to-play scene** ticked.
4. Check **Where the picture will live in your Godot project**. The default is \`res://sprites/<your name>.png\`. Change it if your project keeps pictures somewhere else, for example \`res://art/hero.png\`.
5. Press **Export** and choose the folder **inside your Godot project** that matches that path. For \`res://sprites/\`, that's the \`sprites\` folder in your project (make it if it doesn't exist).

## In Godot

1. Switch to Godot. It notices the new files and imports them.
2. Drag the \`.tscn\` file into your scene. That's it: it plays your first clip straight away.
3. To play another clip from a script:

\`\`\`
$AnimatedSprite2D.play("run")
\`\`\`

Every clip is there with its speed and loop setting, and held frames last as long as they do in Frameling. A clip that plays backward or back and forth has its frames listed in that order (Godot's animations have no direction of their own), and one that plays a number of times lists them that many times and doesn't loop. A back and forth clip that loops can instead use Godot's own **ping-pong** loop (a smaller file, but the two end frames show twice, and it needs Godot 4.7 or newer: older Godot plays those clips forward only): choose it in **Preferences > Behaviour**, *Back-and-forth clips in game engines*. Clips that play a set number of directions are always listed frame by frame. Got a character with bones? You can also send it as a [skeleton you can keep editing](help:export-godot-bones). Pixel art scenes are set to sharp (nearest) filtering, so nothing looks blurry.

## Using the .tres yourself

Add an **AnimatedSprite2D** node, click **Sprite Frames** in the Inspector, then **Load**, and pick the \`.tres\` file. If pixel art looks blurry there, set the node's **Texture > Filter** to **Nearest**.

## Separate sprites

With **Separate sprites**, each sprite gets its own small \`.tres\` (an *AtlasTexture*). Use them anywhere Godot takes a texture: a Sprite2D, a button icon, a TextureRect.

## If Godot says a file is missing

The path you typed in Frameling has to match where the picture really is in your Godot project. Fix the path in the export dialog and export again, replacing the old files.`,
  },
];
