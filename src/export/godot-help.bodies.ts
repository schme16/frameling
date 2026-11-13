// The words of the help topics in godot-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'export-godot-bones': `A sprite sheet bakes every frame into a picture. For a character with [bones](help:rig) you can send the skeleton and keep animating it in Godot.

## In Frameling

1. Press **Ctrl+E**, pick **Sprite sheet**, then the **Godot** card.
2. Under it, pick **Bones (editable in Godot)**. (Only shown when your drawing has bones.)
3. Check **Where the picture will live in your Godot project**. The parts go there too.
4. Press **Export** and choose that folder inside your project.

## What you get

- A scene (\`.tscn\`) with a **Skeleton2D** and a **Bone2D** for every bone.
- A picture for every part. Parts that follow one bone are **Sprite2D** nodes on that bone. Layers that [bend](help:rig-bend) are **Polygon2D** meshes with your [painted weights](help:rig-weights).
- An **AnimationPlayer** with every clip, at your frame rate. It plays the first one straight away.

Drag the \`.tscn\` into your scene. Edit any key, or play another clip:

\`\`\`
$AnimationPlayer.play("walk")
\`\`\`

## Good to know

- **Steady** and **Gentle** glides use Godot's own easing; others get a key on every frame. Held poses snap. [Squash and stretch](help:rig-stretch) becomes bone scale. Swapped drawings swap the part's picture.

## Symbols, camera and looks

- A [symbol](help:symbols) with its own bones comes as a node for each copy, with its own Skeleton2D and parts. Its place, fade and [timeline](help:symbol-properties) are keys. On a layer that follows a bone, the copy sits under that bone. With effects, masks or bends, it is drawn into the pictures.
- A symbol that fades is a **CanvasGroup**: it fades as one picture, so overlaps don't show through. Parts that can't be ordered, or use a blend mode, fade alone (the export window says why).
- Godot's **Compatibility** renderer draws a faded symbol a little darker. **Forward+** and **Mobile** match exactly.
- A symbol copied large gets bigger pictures (up to 4 times your export size) so it stays sharp.
- Each [layer folder](help:layer-folders) is a **Node2D** with its layers inside, nested the same way, so you can hide or script a whole folder. A hidden folder arrives hidden. Its fade goes on its node when its layers don't overlap, else on each layer, as do blend modes and effects. Layers on a bone stay under their bone.
- The [camera](help:camera) becomes a **Camera2D** with position, zoom and turn keys. Layers with a depth go under a **Parallax2D**.
- Camera and depth layers line up when your Godot window is the stage size times the export scale. For other sizes, attach the saved \`-fit-window.gd\` to the scene's root.
- A layer's fade is the node's modulate. **Add** and **Multiply** use a CanvasItemMaterial. **Screen**, **Glow brighter, plain**, **Take away**, **Brighten by dividing** and a symbol's colour wash use a tiny shader saved beside the scene (other modes draw normal).
- [Effects](help:effects) are baked into the part's picture, since Godot has none. So are **masks** and "clip to the layer below", when part and mask move together; otherwise they are left out.

The export window lists what was baked or left out for your drawing.`,
  'export-godot': `This takes about a minute. It's written for Godot 4.

## In Frameling

1. Press **Ctrl+E**, pick **Sprite sheet**, then the **Godot** card.
2. Pixel art goes out at real size by itself.
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

Every clip is there with its speed and loop setting, and held frames last as long as they do in Frameling. A clip that plays backward or back and forth has its frames listed in that order (Godot's animations have no direction of their own), and one that plays a number of times lists them that many times and doesn't loop. A back and forth clip that loops can instead use Godot's own back and forth loop (it calls it **ping-pong**) (a smaller file, but the two end frames show twice, and it needs Godot 4.7 or newer: older Godot plays those clips forward only): choose it in **Preferences > Behaviour**, *Back-and-forth clips in game engines*. Clips that play a set number of directions are always listed frame by frame. Got a character with bones? You can also send it as a [skeleton you can keep editing](help:export-godot-bones). Pixel art scenes are set to sharp (nearest) filtering, so nothing looks blurry.

## Using the .tres yourself

Add an **AnimatedSprite2D** node, click **Sprite Frames** in the Inspector, then **Load**, and pick the \`.tres\` file. If pixel art looks blurry there, set the node's **Texture > Filter** to **Nearest**.

## Separate sprites

With **Separate sprites**, each sprite gets its own small \`.tres\` (an *AtlasTexture*). Use them anywhere Godot takes a texture: a Sprite2D, a button icon, a TextureRect.

## If Godot says a file is missing

The path you typed in Frameling has to match where the picture really is in your Godot project. Fix the path in the export dialog and export again, replacing the old files.`,
};
