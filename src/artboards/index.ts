// Artboards: several named canvases in one document (a sprite each, a shot each). See docs/artboards.md.
import { addPointerDownHook } from '../canvas/controller';
import { installArtboards, openArtboardUnder } from './ops';
import './commands';
import './tool';
import './help';

installArtboards();

// Pressing on another artboard (any tool but the view tools and the Artboard tool, which handle their own clicks)
// opens it first, so the timeline and the tool follow where you are working.
addPointerDownHook((p, tool) => void openArtboardUnder(p, tool));
