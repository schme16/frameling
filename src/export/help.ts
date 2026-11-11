import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'exporting',
    title: 'Exporting',
    section: 'Exporting',
    summary: 'Turn your drawing into a video, a GIF, pictures, an SVG or a sprite sheet.',
    keywords: ['export', 'share', 'render', 'save as video', 'gif', 'png', 'mp4', 'webm'],
    body: `Saving keeps your drawing editable. **Exporting** makes something to share or use somewhere else, and leaves your drawing as it is.

Press **Ctrl+E** (**Cmd+E** on a Mac), pick a format card, tweak the options if you like, and press **Export**. Frameling asks where to put it, then draws every frame and shows a progress bar. You can cancel any time.

## Which one?

| I want to... | Pick |
| --- | --- |
| Post it or send it to someone | **MP4 video** |
| Put it on a website, with a see-through background | **WebM video** |
| Use it in a chat or forum | **Animated GIF** |
| Something sharper than a GIF, with soft edges | **Animated PNG** |
| One picture of the frame I'm on | **PNG picture** |
| One picture per frame, for a video editor | **PNG sequence** |
| Vector art that stays sharp at any size | **SVG drawing** |
| Use it in a game | **Sprite sheet** |

## Options everyone shares

- **What to export:** the whole animation, one clip, or just this frame.
- **Size:** how many times bigger than your drawing. Pixel art only offers whole numbers, so every pixel stays a crisp square.
- **Transparent background:** leave the background see-through, for formats that can do that. If a format can't, the box is greyed out and says why.

## Quick repeat

**Ctrl+Shift+E** exports again with the same settings as last time, without asking questions (it still asks where to save).

Every export is drawn exactly the way you see it on the canvas, at exact frame times, so a slow computer makes the same file as a fast one, just a little later.

More: [Video, GIF and APNG](help:export-video-gif-apng), [Sprite sheets](help:export-sprite-sheets), [SVG](help:export-svg).`,
  },
  {
    id: 'export-video-gif-apng',
    title: 'Video, GIF and APNG',
    section: 'Exporting',
    summary: 'Which animated format to pick, and what the options do.',
    keywords: ['mp4', 'webm', 'gif', 'apng', 'video', 'loop', 'dither', 'transparent', 'h264', 'vp9', 'av1', 'codec'],
    body: `## MP4 video

Plays almost everywhere: phones, social media, slides. It can't have a see-through background, so your drawing's background colour is used (white if there isn't one). Videos need an even number of pixels, so a drawing with an odd size gets one extra row or column of background.

## WebM video

Great for websites. It can keep a **transparent background** on computers that support it. If yours doesn't, the option is greyed out and says so.

WebM uses **AV1** when your computer can make it (smaller files, slower to make), and falls back to VP9, then VP8. You can pick **VP9** instead with the *Video codec* buttons in the export window, or in Preferences > Behaviour. If the codec you like can't keep a see-through background but another one can, Frameling uses that one when you ask for transparency.

## Animated GIF

Works in chats and forums where a video won't play. GIFs are limited:

- Up to **256 colours**. Frameling picks them from your whole animation, so they suit it.
- Transparency is **all or nothing**: a pixel is either there or it isn't. Soft edges become hard.
- **Smooth colours (dither)** sprinkles pixels to fake in-between shades. It helps gradients and soft shading, and looks noisy on flat colour. Leave it off for pixel art.
- No faster than 50 frames per second.

## Animated PNG (APNG)

Like a GIF with none of the limits: full colour and soft see-through edges. It works in modern browsers and most chat apps, but not everywhere, so use a GIF when you need to be sure.

## Loop

GIF and APNG can **loop forever**, or play once and stop. Videos have no loop setting. Players decide that themselves.

## Good to know

- Pixel art exports at big whole-number sizes with sharp edges, never blurry.
- The speed always matches your document's frames per second.`,
  },
  {
    id: 'export-sprite-sheets',
    title: 'Sprite sheets',
    section: 'Exporting',
    summary: 'Put every frame on one picture, with a data file that says where each one is.',
    keywords: ['sprite', 'atlas', 'sheet', 'texture', 'game', 'json', 'trim', 'padding', 'power of two'],
    body: `A sprite sheet is one picture holding all your frames in a grid. Games load that one picture and cut the frames out.

Pick **Sprite sheet** in the export dialog and choose a folder. Frameling writes:

- the **picture** (a PNG),
- a **JSON file** saying where every frame sits and which frames make up each animation,
- and, if you tick them, files for [Godot](help:export-godot).

The JSON and Godot ticks start as JSON on, Godot off, and then **remember what you last chose**, so you set them once.

## Options

- **Columns:** how many frames per row. Leave on **Auto** for a roughly square sheet.
- **Padding:** empty pixels around every frame, which stops neighbouring frames bleeding into each other when the game scales things.
- **Trim empty space:** cut each frame down to the part you drew. Smaller sheets. The data file keeps each frame's original size and position, so nothing shifts.
- **Power-of-two size:** rounds the sheet up to 64, 128, 256, 512... Some older engines and graphics cards like that.
- **Store repeated frames once:** a frame that looks the same as the one before it isn't stored again. Animating "on twos" makes sheets half the size, and the data file still plays them for the right time.

## Your clips become animations

Each **clip** (idle, run, jump...) becomes an animation in the data file, with its own loop setting. No clips? The whole timeline is one animation called **default**.

You can also pick **A clip** under "What to export" to make a sheet from just that clip.

## The JSON file

\`\`\`
{ "meta": { "image": "hero.png", "size": { "w": 256, "h": 128 }, "fps": 12 },
  "frames": [ { "frame": { "x": 0, "y": 0, "w": 64, "h": 64 }, "sourceSize": { "w": 64, "h": 64 }, "duration": 83 } ],
  "animations": { "idle": { "fps": 12, "loop": true, "frames": [0, 1, 2] } } }
\`\`\`

\`frames\` lists where each picture is. Each animation lists frame numbers into that list.`,
  },
  {
    id: 'export-godot',
    title: 'Using sprites in Godot',
    section: 'Exporting',
    summary: 'Step by step: from Frameling to an animated sprite in your Godot 4 project.',
    keywords: ['godot', 'animatedsprite2d', 'spriteframes', 'tres', 'tscn', 'game engine', 'res://'],
    body: `This takes about a minute. It's written for Godot 4.

## In Frameling

1. Press **Ctrl+E** and pick **Sprite sheet**.
2. Tick **Godot sprite frames (.tres)**. Tick **Godot scene** too if you'd like a ready-made animated sprite.
3. Under **Where the picture will live in your Godot project**, check the path. The default is \`res://sprites/<your name>.png\`. Change it if your project keeps pictures somewhere else, for example \`res://art/hero.png\`.
4. Press **Export** and choose the folder **inside your Godot project** that matches that path. For \`res://sprites/\`, that's the \`sprites\` folder in your project (make it if it doesn't exist).

Each of your clips becomes an animation, with its speed set to your frames per second and its loop setting kept. With no clips, the whole timeline is one animation called **default**.

## In Godot

1. Switch to Godot. It notices the new files and imports them.
2. Add an **AnimatedSprite2D** node to your scene.
3. In the Inspector, click **Sprite Frames**, then **Load**, and pick your \`.tres\` file. (Or just drag the \`.tscn\` into your scene if you made one.)
4. Choose an animation in the **Animation** list and press play to preview it.
5. To play it from a script:

\`\`\`
$AnimatedSprite2D.play("run")
\`\`\`

## Pixel art looks blurry?

Turn off texture smoothing. In **Project Settings**, find **Rendering > Textures > Default Texture Filter** and set it to **Nearest**.

## If Godot says a file is missing

The path you typed in Frameling has to match where the picture really is in your Godot project. Fix the path in the export dialog and export again, replacing the old files.`,
  },
  {
    id: 'export-svg',
    title: 'SVG',
    section: 'Exporting',
    summary: 'Export the frame you are on as a vector picture that stays sharp at any size.',
    keywords: ['svg', 'vector', 'paths', 'illustrator', 'inkscape', 'scalable'],
    body: `**SVG drawing** exports the frame you're looking at as a picture made of shapes, not dots. It stays sharp at any size, and you can open it in other vector programs to keep working on it.

## What you get

- **Vector layers** become real paths: every brush stroke becomes one filled shape, and shapes keep their curves, fills and outlines.
- **Pixel layers** become small rectangles: one for each run of pixels in the same colour. Nothing is lost, every pixel is still there, but a big pixel drawing makes a big file.
- Each layer is its own group named after the layer, so it's easy to find in other programs. Layer opacity is kept. Hidden layers are left out.
- **Size** only changes how large the picture is when it opens. You can scale it freely later.

## Good to know

- SVG is a single still. To get more frames, use [PNG sequence](help:exporting) or one SVG per frame by moving the playhead and exporting again.
- Brush strokes are exported as their finished outline, so they look right but won't be editable as brush strokes in other programs.`,
  },
]);
