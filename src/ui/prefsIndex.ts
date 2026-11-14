// The rows of Preferences, for the search box at the top of it. Each carries a few other names: what Photoshop,
// Aseprite, Krita, Procreate, Flash and Clip Studio call the same thing, and what people say when they half remember it.
// The scoring is in prefsSearch.ts. Fixed rows are listed here; the ones the app builds as it starts (the remembered
// choices, the features) come from their own lists, with their other names below. test/ui/prefs-search.test.ts reads
// the pages' source and fails when a row is on a page and not in here.
import { allCommands, type Command } from '../core/registry';
import { allChoices, type ChoiceDef } from '../core/choices';
import { switchableFeatures } from '../features/host';
import type { FeatureDescriptor } from '../features/feature';
import { hasChoice } from './mascot/mascots';
import { isStaleCommand } from './dynamic';
import { effectiveKeys } from './keys';
import type { PrefsPage } from './overlays';
import type { PrefRow } from './prefsSearch';

type Extra = Partial<Pick<PrefRow, 'group' | 'find'>>;
const row = (page: PrefsPage, label: string, hint: string, also: string[], extra: Extra = {}): PrefRow => ({ id: `${page}.${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, page, label, hint, also, kind: 'setting', ...extra });

/** The fixed rows, page by page, in the order the pages show them. */
export const SETTING_ROWS: PrefRow[] = [
  // General
  row('general', 'Mode', 'Dark, light, or follow your computer.', ['dark mode', 'light mode', 'night mode', 'appearance', 'colour scheme', 'system theme', 'auto dark', 'day night']),
  row('general', 'Theme', 'Pick a theme for dark mode and one for light mode, or make your own.', ['skin', 'colour scheme', 'colours', 'appearance', 'customise', 'ui colours', 'palette']),
  row('general', 'Look', 'Cosy is soft and rounded. Crisp is tighter and sharper.', ['style', 'rounded corners', 'sharp corners', 'flat', 'corner radius', 'cosy', 'crisp']),
  row('general', 'Textures', 'The faint pattern some themes scatter round the page.', ['background pattern', 'wallpaper', 'pattern', 'decoration', 'backdrop']),
  row('general', 'Clean timeline', 'One plain block per drawing, or the detailed timeline.', ['simple timeline', 'simplified', 'minimal timeline', 'compact timeline', 'dope sheet', 'xsheet', 'exposure sheet', 'keyframe diamonds']),
  row('general', 'Interface size', 'How big everything is drawn, for a dense 4k screen or a drawing tablet.', ['ui scale', 'scaling', 'zoom interface', 'hidpi', 'retina', '4k', 'font size', 'text size', 'dpi', 'display scale', 'bigger text', 'tiny text', 'high dpi', 'magnify']),
  row('general', 'Undo steps', 'How many steps you can undo.', ['history', 'undo levels', 'undo limit', 'history states', 'undo depth', 'memory', 'how many undos', 'history size']),
  row('general', 'Units', 'How sizes are shown: pixels, mm, cm, inches or points.', ['pixels', 'millimetres', 'centimetres', 'inches', 'ruler units', 'measurements', 'points', 'print size', 'metric', 'imperial']),
  row('general', 'Sounds', 'Soft little sounds, or quiet.', ['audio feedback', 'sound effects', 'mute', 'silent', 'noises', 'beeps', 'clicks', 'quiet', 'sfx', 'ui sounds']),
  row('general', 'Volume', 'How loud the sounds are.', ['loudness', 'sound level', 'quieter', 'louder', 'sound volume']),
  row('general', 'Reduce motion', 'Stops the bouncing and fading.', ['animations off', 'accessibility', 'transitions', 'fade', 'calm', 'less animation', 'motion sickness', 'vestibular', 'no animation']),
  row('general', 'Welcome sheet', 'Show the start page when Frameling opens.', ['start page', 'start screen', 'splash', 'home screen', 'startup', 'launch screen', 'welcome screen', 'new document screen', 'open on start']),
  row('general', 'Tips', 'A friendly tip in the status bar.', ['hints', 'status bar tips', 'did you know', 'tip of the day', 'advice']),
  row('general', 'Explanations', 'The little lines that say what a panel or a setting is for, or tucked behind the ? icons.', ['hints', 'help icons', 'tooltips', 'descriptions', 'explainers', 'instructions', 'notes', 'clutter', 'show help text', 'question mark']),
  row('general', 'Workspace switcher', 'Which workspace you are in, beside the drawing name: tabs, a chip, or hidden.', ['workspace tabs', 'layout tabs', 'workspace bar', 'workspace picker', 'layout switcher']),
  row('general', 'Right side', 'Properties, a rail of panels, or the older tabs.', ['properties panel', 'inspector', 'options panel', 'panel tabs', 'right dock', 'side panels', 'panel layout', 'sidebar']),
  row('general', 'Tool rail style', 'Two wide, or stacked with a button per group.', ['toolbar', 'toolbox', 'tool bar', 'tool palette', 'tools panel', 'flyout', 'grouped tools', 'two columns', 'tool layout']),
  row('general', 'Tool group names', 'A name above each group of tools.', ['toolbar labels', 'tool labels', 'group titles', 'tool headings', 'slimmer toolbar']),
  row('general', 'Tool button size', 'How big the buttons on the tool rail are.', ['toolbar size', 'icon size', 'big buttons', 'tool icons', 'button size', 'toolbar icon size']),
  row('general', 'Tools that do not work here', 'Hide the tools a layer cannot use, or grey them out.', ['hide tools', 'grey out tools', 'disabled tools', 'unavailable tools', 'vector tools on pixel layer', 'greyed out', 'gray out']),
  row('general', 'Show Quill', 'Quill the hedgehog shows you round. Off hides him.', ['mascot', 'hedgehog', 'assistant', 'helper', 'character', 'hide mascot', 'clippy', 'guide']),
  row('general', 'Fade tile copies', 'In tile mode, fade the copies round the tile you are drawing.', ['tile preview', 'seamless', 'tiling', 'repeat mode', 'pattern preview', 'offset', 'wrap around', 'tiled mode']),
  row('general', 'Thicker pixel outlines', 'Pixel shapes get an outline thicker than one pixel.', ['stroke width', 'line width', 'outline', 'border thickness', 'line thickness', 'pixel line', 'stroke']),
  row('general', 'Outline thickness', 'How many pixels thick the outline is.', ['stroke width', 'line width', 'border size', 'stroke size', 'outline width', 'pixel stroke']),
  row('general', 'Your settings', 'Backup keeps a copy of everything you have set; Restore puts one back, on this computer or another.', ['backup', 'back up', 'restore', 'export settings', 'import settings', 'sync', 'settings file', 'transfer', 'new computer', 'reset', 'autosave', 'save settings', 'preferences file']),

  // Themes
  row('themes', 'Your two themes', 'The theme you use in dark mode and the one for light mode.', ['dark theme', 'light theme', 'day theme', 'night theme', 'colour scheme', 'skin', 'appearance'], { find: 'Your two themes' }),
  row('themes', 'Mode', 'System follows your computer; or choose dark or light.', ['dark mode', 'light mode', 'night mode', 'appearance', 'system theme', 'auto dark', 'day night'], { find: 'Mode' }),
  row('themes', 'Every theme', 'All the themes in one grid; press one to use it.', ['theme gallery', 'browse themes', 'colour schemes', 'high contrast', 'accessibility', 'dark theme', 'light theme', 'colours'], { find: 'Every theme' }),
  row('themes', 'Make my own theme', 'Change the colours and keep the result.', ['custom theme', 'edit theme', 'theme editor', 'create theme', 'duplicate theme', 'colour picker', 'customise colours', 'new theme'], { find: 'Make my own theme' }),
  row('themes', 'Import a theme file', 'Add a theme someone sent you.', ['load theme', 'theme json', 'open theme', 'share theme', 'add theme', 'download theme'], { find: 'Import a theme file' }),

  // Keyboard
  row('keyboard', 'Shortcut set', 'Start from Frameling keys, or from another app.', ['keymap', 'key bindings', 'keybindings', 'hotkeys', 'shortcuts', 'presets', 'photoshop shortcuts', 'aseprite keys', 'krita shortcuts', 'key layout', 'schemes', 'keyboard layout', 'keymaps', 'key map']),
  row('keyboard', 'Search shortcuts', 'Find a command or a key.', ['find shortcut', 'search keys', 'look up key', 'what key', 'which key'], { find: 'Search shortcuts' }),
  row('keyboard', 'Reset all', 'Put every shortcut back how it came.', ['default shortcuts', 'restore shortcuts', 'reset keys', 'factory keys', 'reset hotkeys', 'clear shortcuts']),
  row('keyboard', 'Keyboard shortcuts', 'A key for every command, and you can change them all.', ['shortcuts', 'hotkeys', 'keymap', 'key bindings', 'keybindings', 'keys', 'rebind', 'remap', 'customise keyboard', 'change shortcut', 'keybinds', 'key mapping', 'accelerators'], { find: 'Keyboard' }),
  row('keyboard', 'Shortcut used twice', 'A warning mark shows where two commands share keys.', ['conflict', 'clash', 'duplicate shortcut', 'used twice', 'overlap', 'same key'], { find: 'Search shortcuts' }),

  // Behaviour (the choices themselves are added from the app's list)
  row('behaviour', 'Answer all the questions the usual way', 'Stop the questions and do what most people like. Every answer stays listed here, and there is an Undo.', ['ask me', 'stop asking', 'do not ask again', 'dont show again', 'confirmations', 'prompts', 'warnings', 'defaults', 'questions', 'remember', 'choices', 'reset choices'], { find: 'the usual way and stop asking' }),

  // Snapping
  row('snapping', 'Snapping', 'Switch snapping on or off. Hold Ctrl to skip it for a moment.', ['snap', 'magnet', 'magnetic', 'sticky', 'smart guides', 'align', 'alignment', 'snap to grid', 'snap to guides', 'snap to pixel', 'grid', 'guides']),
  row('snapping', 'What to snap to', 'The page, guides, the grid, other shapes, perspective lines, pixels.', ['grid', 'guides', 'smart guides', 'perspective', 'centre', 'center', 'pixel grid', 'cells', 'edges', 'midpoints', 'bounding box', 'snap to grid', 'snap to guides', 'snap to pixel'], { find: 'Vector layers' }),
  row('snapping', 'All layers, not just this one', 'Look at every visible layer, or the open one only.', ['other layers', 'snap to other layers', 'visible layers', 'every layer', 'smart guides']),
  row('snapping', 'Snap distance', 'How close something has to come before it snaps.', ['snap threshold', 'snap radius', 'tolerance', 'sensitivity', 'magnet strength', 'snap strength', 'how close', 'snap range']),
  row('snapping', 'Back to the usual choices', 'Put the snapping ticks back how they came.', ['reset snapping', 'default snap', 'restore snap']),

  // Pen and tablet
  row('pen', 'Try your pen', 'A pad to see what your pen does.', ['tablet test', 'pen test', 'pressure test', 'test pad', 'check pen working', 'wacom test', 'scribble']),
  row('pen', 'Pen pressure', 'The curve from a light press to a hard one.', ['pressure curve', 'tablet pressure', 'wacom', 'huion', 'pressure sensitivity', 'stylus', 'brush dynamics', 'pen curve', 'transfer curve', 'sensitivity', 'tablet', 'xp-pen', 'pressure response'], { find: 'Pen pressure' }),
  row('pen', 'Feel', 'Soft, Firm or Normal to start from.', ['pressure presets', 'pressure curve preset', 'soft pen', 'firm pen', 'sensitivity'], { group: 'Pen pressure' }),
  row('pen', 'Lightest press that counts', 'Pressure below this is ignored.', ['minimum pressure', 'pressure threshold', 'dead zone', 'activation force', 'initial activation force', 'min pressure', 'hover marks'], { group: 'Pen pressure' }),
  row('pen', 'Press that counts as full', 'Lower it if you can never reach the thickest line.', ['maximum pressure', 'max pressure', 'full pressure', 'pressure ceiling', 'hardest press'], { group: 'Pen pressure' }),
  row('pen', 'How much leaning counts', 'How much bigger a mark gets as you lay the pen over.', ['tilt', 'tilt sensitivity', 'pen angle', 'tilt strength', 'azimuth', 'leaning', 'brush tilt', 'pen tilt'], { group: 'Pen pressure' }),
  row('pen', 'Pen buttons', 'What the buttons on the pen do.', ['barrel button', 'stylus buttons', 'side button', 'pen button', 'express keys'], { find: 'Pen buttons' }),
  row('pen', 'Eraser end of the pen', 'Flip the pen over and it erases.', ['stylus eraser', 'pen eraser', 'eraser tail', 'flip pen', 'invert', 'eraser tip'], { group: 'Pen buttons' }),
  row('pen', 'Button nearest the tip', 'What the button nearest the tip does while you hold it.', ['barrel button', 'right click', 'side button', 'button 1', 'pen button', 'stylus button', 'lower button'], { group: 'Pen buttons' }),
  row('pen', 'Other button', 'The second button on the barrel, the middle click.', ['second button', 'middle click', 'button 2', 'pen button', 'upper button', 'stylus button'], { group: 'Pen buttons' }),
  row('pen', 'Swap my two pen buttons', 'For when the buttons are numbered the other way round.', ['flip buttons', 'reverse buttons', 'left handed', 'left-handed', 'invert buttons', 'switch buttons'], { group: 'Pen buttons' }),
  row('pen', 'Fingers and palms', 'What touch does while you draw with a pen.', ['palm rejection', 'touch', 'finger', 'hand', 'touch screen', 'touchscreen'], { find: 'Fingers and palms' }),
  row('pen', 'Ignore touch while a pen is near', 'Resting your hand on the screen will not draw.', ['palm rejection', 'palm', 'ignore touch', 'disable touch', 'touch off', 'hand resting', 'accidental touch'], { group: 'Fingers and palms' }),
  row('pen', 'Two fingers move the page', 'Drag with two fingers to pan, pinch to zoom.', ['pan', 'pinch zoom', 'gestures', 'multi touch', 'touch gestures', 'two finger scroll', 'two finger pan', 'pinch'], { group: 'Fingers and palms' }),
  row('pen', 'One finger', 'What a single finger does.', ['touch drawing', 'finger painting', 'finger draw', 'touch input', 'draw with finger'], { group: 'Fingers and palms' }),
  row('pen', 'Stabilizer', 'Smooth a wobbly line by letting the brush trail behind the pen, for each tool.', ['smoothing', 'line smoothing', 'lazy mouse', 'lazy brush', 'brush smoothing', 'streamline', 'stabilization', 'steady line', 'wobble', 'jitter', 'shake reduction', 'correction', 'pulled string', 'smooth'], { find: 'What each tool does with the pen' }),
  row('pen', 'Pressure for each tool', 'Which tools change size, strength or amount with pressure, and which lean.', ['pressure size', 'pressure opacity', 'flow', 'opacity', 'brush dynamics', 'size jitter', 'tilt', 'per tool', 'shape dynamics'], { find: 'What each tool does with the pen' }),
  row('pen', 'Put the pen settings back', 'Back to how the pen came.', ['reset pen', 'default pen', 'restore pen', 'reset pressure', 'reset tablet']),

  // Performance
  row('performance', 'What Frameling found', 'The graphics card in use, how it is drawing, and whether that is good. Copy it for a bug report.', ['gpu', 'graphics card', 'video card', 'gpu info', 'gpu detected', 'which gpu', 'renderer', 'driver', 'vram', 'video memory', 'graphics memory', 'vulkan', 'opengl', 'directx', 'metal', 'software rendering', 'slow', 'lag', 'laggy', 'performance', 'system info', 'about gpu', 'bug report'], { find: 'What Frameling found' }),
  row('performance', 'Hardware drawing', 'Let the graphics card do the drawing. Needs a restart.', ['hardware acceleration', 'gpu acceleration', 'use gpu', 'gpu rendering', 'gpu', 'graphics card', 'disable gpu', 'software rendering', 'renderer', 'opengl', 'vulkan', 'angle', 'glitch', 'flicker', 'black screen', 'performance', 'graphics processor', 'cuda', 'turn off gpu', 'window will not open', 'safe mode']),
  row('performance', 'Drawings kept ready', 'How much memory keeps drawings ready, so stepping and playing do not redraw them.', ['cache', 'cache size', 'layer cache', 'memory', 'ram', 'vram', 'memory limit', 'bitmap cache', 'tile cache', 'cache limit', 'memory usage', 'performance', 'photoshop memory', 'performance memory', 'prefetch', 'pre-render']),
  row('performance', 'Scrubbing the timeline', 'Full quality, or quick while you drag along the timeline.', ['scrub', 'scrubbing', 'quality while scrubbing', 'draft mode', 'preview quality', 'low quality preview', 'proxy', 'fast preview', 'draft', 'timeline drag', 'realtime preview', 'performance', 'onion skin while scrubbing']),
  row('performance', 'Playback frame rate limit', 'The most frames a second playback shows, for a computer that cannot keep up.', ['fps limit', 'frame rate cap', 'fps cap', 'max fps', 'frame skipping', 'drop frames', 'frame dropping', 'playback speed', 'playback quality', 'realtime playback', 'slow playback', 'preview fps', 'performance', 'vsync']),
  row('performance', 'Put these back to how they were', 'Back to how the performance settings came.', ['reset performance', 'default performance', 'restore performance', 'reset cache', 'reset gpu', 'defaults']),

  // Workspaces
  row('workspaces', 'Workspaces', 'Ways of arranging your panels, and switching between them.', ['layout', 'panel layout', 'arrangement', 'window layout', 'saved layouts', 'perspectives', 'workspace presets', 'essentials', 'layouts'], { find: 'Workspaces' }),
  row('workspaces', 'Save my layout', 'Save the panels as they are now, under a name.', ['save workspace', 'new workspace', 'save layout', 'custom workspace', 'store layout', 'name layout', 'create workspace'], { find: 'Yours' }),
  row('workspaces', 'Share a workspace', 'Save one to a file, copy it as text, or add one you were sent.', ['export workspace', 'import workspace', 'workspace file', 'send layout', 'share layout', 'copy layout', 'paste workspace'], { find: 'Share' }),
  row('workspaces', 'Window style', 'How floating panels look and behave.', ['floating panels', 'detached panels', 'undock', 'tear off', 'panel windows', 'always on top', 'floating window', 'floating windows'], { find: 'Window style' }),

  // Menus
  row('menus', 'Menus', 'Move, rename, take out and add menu entries, and make menus of your own.', ['menu bar', 'customise menus', 'customize menus', 'edit menus', 'rearrange menus', 'reorder', 'hide a menu', 'remove from menu', 'submenu'], { find: 'Menus' }),
  row('menus', 'Make a menu of your own', 'A new name on the menu bar, with the commands you use most.', ['my menu', 'favourites', 'favorites', 'custom menu', 'new menu', 'add menu'], { find: 'Make a menu of your own' }),
  row('menus', 'Put the menus back', 'Every menu in this workspace back to how it came with Frameling.', ['reset menus', 'default menus', 'restore menus', 'undo menu changes'], { find: 'Put all the menus back' }),

  // Plugins
  row('plugins', 'Plugins', 'Add commands, exports, panels and tools. Each runs in its own sandbox.', ['add-ons', 'addons', 'extensions', 'scripts', 'mods', 'plug-ins', 'scripting', 'api', 'automation', 'macros'], { find: 'Plugins' }),
  row('plugins', 'Install from file', 'Add a plugin from a .zip file.', ['install plugin', 'add plugin', 'zip', 'install extension', 'add-on', 'download plugin'], { find: 'Install from file' }),
  row('plugins', 'Install from folder', 'For plugin makers: install straight from the folder you are working in.', ['develop plugin', 'plugin maker', 'plugin developer', 'dev', 'build a plugin', 'write a plugin'], { find: 'Install from folder' }),
  row('plugins', 'What a plugin may do', 'Each plugin gets only the permissions you allow.', ['permissions', 'network', 'sandbox', 'allow', 'trust', 'privacy', 'internet access', 'security', 'safe'], { find: 'Plugins' }),

  // Features (the switches themselves are added from the app's list)
  row('features', 'Turn parts of Frameling on or off', 'Switch off what you do not use, to keep things simple.', ['turn off', 'modules', 'hide features', 'simple mode', 'simplify', 'disable', 'enable', 'optional', 'extensions', 'minimal', 'beginner mode', 'declutter'], { find: 'Features' }),

  // Diagnostics
  row('diagnostics', 'Telling the makers', 'Send a bug report or crash notes, only when you press Send.', ['report a bug', 'bug report', 'feedback', 'send report', 'crash report', 'telemetry', 'analytics', 'privacy', 'beta', 'error report', 'logs', 'crash notes', 'contact'], { find: 'Telling the makers' }),
  row('diagnostics', 'Look for new versions', 'Quietly check for a newer Frameling, and say what is sent. Off means it never looks by itself.', ['update', 'updates', 'auto update', 'automatic update', 'check for updates', 'new version', 'upgrade', 'new release', 'latest version', 'skip version', 'github', 'privacy', 'offline'], { find: 'Look for new versions' }),
  row('diagnostics', 'Measure my plugins', 'See how much memory and time your plugins use.', ['plugin performance', 'profiler', 'memory', 'plugin cpu', 'plugin timing', 'slow plugin', 'performance'], { find: 'Plugins' }),
  row('diagnostics', 'Check my pen with Quill', 'A short check that saves a report when the pen or tablet is not working.', ['pen check', 'tablet not working', 'pressure not working', 'wacom problem', 'huion problem', 'windows ink', 'driver', 'pen diagnostics', 'test pen', 'tablet problem', 'pen report'], { find: 'Pen and tablet' }),
];

/** Other names for the remembered choices in Behaviour, by id. A choice with no entry is still found by its title and its question. */
export const CHOICE_ALSO: Record<string, string[]> = {
  'recolour.where': ['palette swap', 'replace colour', 'recolor', 'this layer', 'this frame', 'selection', 'cel', 'scope', 'find and replace', 'limit recolour'],
  'artboards.fit': ['letterbox', 'pillarbox', 'fit to frame', 'scale to fit', 'crop to fill', 'fill', 'aspect ratio', 'shot size', 'artboard size', 'resize to fit', 'mixed sizes'],
  'artboards.barColor': ['letterbox colour', 'bars', 'black bars', 'background colour', 'padding colour', 'border colour', 'matte'],
  'artboards.pictureSize': ['canvas size', 'image size', 'document size', 'resolution', 'export size', 'video size', 'output size', 'dimensions', 'width height'],
  'variations.frame': ['artboard canvas', 'alt size', 'resize canvas', 'different size', 'artboard fit', 'scale', 'crop'],
  'draw.heldFrame': ['hold', 'held frame', 'exposure', 'edit held', 'shared drawing', 'clone frame', 'hold frame', 'extend'],
  'draw.sharedDrawing': ['shared drawing', 'linked drawing', 'used in several places', 'unlink', 'make unique', 'own copy', 'change everywhere', 'artboards share', 'one drawing many places'],
  'draw.tweenFrame': ['inbetween', 'in-between', 'tween', 'auto key', 'autokey', 'auto keyframe', 'keyframe on edit', 'set key', 'create key'],
  'canvas.wheel': ['scroll', 'scroll wheel', 'zoom', 'pan', 'mousewheel', 'mouse scroll', 'zoom direction', 'scroll zoom', 'scrolling', 'trackpad'],
  'canvas.spaceTap': ['spacebar', 'space bar', 'play', 'pause', 'playback', 'hand tool', 'space to play', 'play pause key'],
  'timeline.newKey': ['new frame', 'blank keyframe', 'duplicate frame', 'copy frame', 'new drawing', 'insert blank keyframe', 'keyframe', 'clone'],
  'timeline.holdLonger': ['extend exposure', 'hold', 'ripple', 'insert frames', 'push frames', 'shift frames', 'frame hold', 'exposure', 'ripple edit'],
  'timeline.frameScope': ['insert frame', 'delete frame', 'remove frame', 'all layers', 'frames on every layer', 'add frame', 'ripple'],
  'timeline.newKeyHold': ['exposure', 'frame length', 'default hold', 'duration', 'default duration', 'span', 'new keyframe length', 'on twos', 'on ones'],
  'timeline.tidyEnd': ['trim', 'empty frames', 'blank frames', 'cleanup', 'clean up', 'trailing frames', 'end of timeline', 'crop timeline', 'work area'],
  'nudge.page': ['hint', 'empty page', 'blank canvas', 'new document', 'prompt', 'placeholder', 'tip'],
  'nudge.drawn': ['tip', 'hint', 'first drawing', 'quill tip', 'tutorial', 'onboarding', 'next step', 'suggestion'],
  'draw.newLayerMode': ['merge shapes', 'merge', 'draw mode', 'object drawing', 'merge drawing', 'stacking', 'separate shapes', 'shape mode', 'overlap', 'object mode', 'behind'],
  'tween.plainDrawing': ['shape tween', 'motion tween', 'classic tween', 'morph', 'inbetween', 'interpolate', 'in-betweens', 'tween type', 'morphing'],
  'select.vectorScope': ['select', 'selection', 'marquee', 'box select', 'lasso', 'whole shape', 'parts', 'points', 'one corner', 'direct select', 'partial select', 'touches', 'move a corner'],
  'eraser.vectorWay': ['erase', 'rubber', 'erase whole shape', 'partial erase', 'erase strokes', 'object eraser', 'vector eraser', 'stroke eraser'],
  'memory.onion': ['onion skin', 'onionskin', 'ghost', 'ghosting', 'light table', 'lightbox', 'light box', 'remember onion', 'onion on startup', 'tracing', 'previous frame', 'launch'],
  'palette.recolour': ['swatches', 'palette swap', 'replace colour', 'recolor', 'colour ramp', 'indexed colour', 'change colour everywhere', 'global colour', 'palette edit'],
  'workspace.follow': ['auto switch workspace', 'layout', 'switch layout', 'pixel workspace', 'draw workspace', 'panel layout', 'follow'],
  'ui.backdropClick': ['click outside', 'close dialog', 'dismiss', 'modal', 'click away', 'dim area', 'overlay click'],
  'pixel.twoBoards': ['sprite sheet', 'artboards', 'boards', 'frames', 'multiple sprites', 'tabs', 'import sheet'],
  'pixel.shareLayers': ['layers', 'shared layers', 'one stack', 'layer stack', 'board layers', 'global layers'],
  'pixel.keys': ['aseprite keys', 'aseprite shortcuts', 'b for pencil', 'compatibility', 'from aseprite'],
  'select.altInside': ['move selection', 'cut and move', 'copy selection', 'alt drag', 'duplicate selection', 'clone', 'lift', 'marquee', 'selection content', 'drag copy', 'move pixels'],
  'effects.maskScope': ['clipping mask', 'clip', 'mask', 'layer mask', 'matte', 'alpha mask', 'track matte', 'stencil', 'mask scope', 'clipping'],
  'timeline.tweenOffer': ['auto tween', 'tween offer', 'create tween', 'inbetweens', 'interpolate', 'motion tween', 'offer', 'suggest'],
  'motion.room': ['overlap', 'motion clip', 'trim', 'clip length', 'transition', 'overrun', 'longer than gap'],
  'versions.restore': ['revert', 'history', 'restore', 'previous version', 'file history', 'rollback', 'open copy', 'undo save', 'backup', 'version history', 'snapshots', 'autosave', 'auto save', 'recovery', 'saving'],
  'aseprite.drop': ['import aseprite', 'ase file', 'open aseprite', 'drag and drop', 'drop file', 'import', 'open file'],
  'import.where': ['import sequence', 'import svg', 'import psd', 'photoshop', 'openraster', 'logo', 'folder of pictures', 'png sequence', 'add or new', 'new drawing', 'import', 'open file'],
  'beta.crashOffer': ['crash', 'bug report', 'crash report', 'error report', 'send report', 'crash notes', 'feedback', 'telemetry', 'privacy', 'diagnostic'],
  'audio.scrub': ['scrubbing', 'audio scrub', 'hear sound', 'play sound while dragging', 'sound preview', 'scrub audio', 'timeline scrub'],
  'audio.longSound': ['extend animation', 'sound length', 'trim timeline', 'audio longer', 'match audio', 'timeline length', 'duration', 'fit to sound'],
  'export.mp4Sound': ['aac', 'opus', 'codec', 'mp4', 'video sound', 'audio codec', 'encoding', 'h264', 'video export', 'quicktime', 'safari', 'mov'],
  'particles.where': ['emitter', 'spawn', 'new particles', 'particle layer', 'particle placement', 'emission'],
  'quill.presents': ['gift', 'present', 'mascot', 'surprise', 'gifts', 'quill gifts', 'drawing gift'],
  'rig.newPose': ['inbetween', 'pose', 'ik', 'pose interpolation', 'new pose', 'auto key', 'bones', 'keyframe pose', 'pose to pose'],
};

/** Other names for each feature on the Features page, by id. */
export const FEATURE_ALSO: Record<string, string[]> = {
  audio: ['sound', 'music', 'waveform', 'soundtrack', 'voice', 'recording', 'import audio', 'sfx', 'sync sound', 'audio track', 'timeline audio'],
  camera: ['pan', 'zoom', 'shake', 'parallax', 'cut scene', 'cutscene', 'virtual camera', 'multiplane', 'camera move', 'screen shake', 'framing', 'ken burns'],
  flow: ['clip flow', 'state machine', 'animation graph', 'animator controller', 'transitions', 'game states', 'node graph', 'nodes', 'game clips'],
  'godot-export': ['godot', 'game engine', 'engine', 'gdscript', 'sprite frames', 'export to game', 'unity', 'game export', 'spriteframes'],
  lipsync: ['lip sync', 'mouth shapes', 'phonemes', 'visemes', 'talking', 'speech', 'dialogue', 'voice', 'papagayo', 'rhubarb', 'mouth', 'lip flap'],
  particles: ['effects', 'fx', 'sparks', 'snow', 'smoke', 'confetti', 'rain', 'emitter', 'fire', 'vfx', 'particle system', 'magic', 'explosion'],
  'quill-pet': ['mascot', 'tamagotchi', 'pet', 'companion', 'virtual pet', 'hedgehog', 'quill', 'assistant', 'friend'],
  rig: ['bones', 'skeleton', 'rigging', 'puppet', 'ik', 'inverse kinematics', 'skin', 'weights', 'spine', 'dragonbones', 'cutout animation', 'joints', 'armature', 'mesh deform'],
  text: ['type', 'typography', 'font', 'fonts', 'caption', 'subtitles', 'lettering', 'words', 'text tool', 'title', 'kinetic typography'],
  tiles: ['tilemap', 'tileset', 'tiled', 'game levels', 'level design', 'tile editor', 'autotile', 'tile map', 'level', 'sprites'],
};

export function choiceRows(choices: ChoiceDef[] = allChoices()): PrefRow[] {
  return choices.map((c) => ({
    id: `behaviour.${c.id}`,
    page: 'behaviour',
    label: c.title,
    hint: c.question,
    group: c.category,
    also: CHOICE_ALSO[c.id] ?? [],
    kind: 'choice',
  }));
}

export function featureRows(features: FeatureDescriptor[] = switchableFeatures()): PrefRow[] {
  return features.map((f) => ({ id: `features.${f.id}`, page: 'features', label: f.name, hint: f.about, also: FEATURE_ALSO[f.id] ?? [], kind: 'feature' }));
}

/** The guide picker, which is only on the page once there is more than one mascot to pick from. */
export function mascotRows(): PrefRow[] {
  return hasChoice() ? [row('general', 'Your guide', 'Who shows you round and cheers you on.', ['mascot', 'guide', 'character', 'helper', 'hedgehog', 'assistant'])] : [];
}

/** The commands the Keyboard page lists, so a command can be found by name and the page scrolls to it. */
export function commandRows(commands: Command[] = allCommands().filter((c) => !c.hidden && !isStaleCommand(c.id)), keysOf: (c: Command) => string[] = effectiveKeys): PrefRow[] {
  return commands.map((c) => {
    const keys = keysOf(c);
    return { id: `keyboard.cmd.${c.id}`, page: 'keyboard', label: c.label.replace(/\.\.\.$/, ''), group: c.category, also: [...(c.keywords ?? []), ...keys], kind: 'command', commandId: c.id };
  });
}

/** Every row there is right now: the fixed ones, the choices, the features, and the commands. */
export function allPrefRows(): PrefRow[] {
  return [...SETTING_ROWS, ...mascotRows(), ...choiceRows(), ...featureRows(), ...commandRows()];
}
