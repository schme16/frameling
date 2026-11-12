// The words of the help topics in godot-addon-commands.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'godot-addon': `Making a game in Godot 4? With this add-on, Godot reads Frameling's animation packages (**.flplay**) by itself. Export again from Frameling and the game picks up the change, no copying or setting up.

## Get it

1. Choose **File, Export, Godot importer add-on...** and save the zip.
2. Unzip it into your Godot project's folder. It makes **addons/frameling_importer**. (Or in Godot, open the **AssetLib** tab, choose **Import...** and pick the zip.)
3. In Godot, open **Project, Project Settings, Plugins** and turn on **Frameling importer**.

You only do this once per project.

## Use it

1. In Frameling, choose [Export for Interactives](help:export-interactives). It saves a **.flplay** file.
2. Save it anywhere inside your Godot project.
3. Godot turns it into a ready-made **AnimatedSprite2D** scene. Drag it into a level and it plays.

Each clip is its own animation, with its speed, its looping and how long each drawing is held. Pixel art stays crisp.

## Change the art

Fix the drawing in Frameling and export over the same file. Godot notices and imports it again, so every level using it updates.

## Options

Pick the file in Godot's **Import** dock to change how it comes in, then press **Reimport**:

- **Import As**: **Frameling animated sprite (scene)**, or **Frameling SpriteFrames** for just the frames to use on your own sprite.
- **Filter**: Auto follows the package. Nearest keeps pixels sharp, Linear smooths them.
- **Stage size**: shows the sprite at the size you drew it, whatever size you exported.
- **Autoplay** and **Centered**, like on any AnimatedSprite2D.

Markers and the [clip flow](help:clip-flow) travel along too, as metadata on the SpriteFrames.`,
};
