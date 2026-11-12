// Every test that draws or exports gets the kinds of shape the app registers (text, particles, tilemaps, bone-attached layers), and their export code
// loaded, as the app has them at start. A test of what happens without a kind registers none itself.
import '../src/text/kind';
import '../src/particles/kind';
import '../src/tiles/kind';
import '../src/rig/kind';
import { loadShapeExports } from '../src/export/shapeExport';
import { godotEngine } from '../src/export/godot';
import { registerEngine } from '../src/export/types';

// Godot is a sprite sheet engine its feature adds in the app; a test has it unless it turns the feature off.
registerEngine(godotEngine);
await loadShapeExports();

// A vector drawing whose saved text is kept is frozen under test, so a test that changes one in place after saving fails
// where it writes (see src/io/file.ts).
import { guard } from '../src/io/file';
guard.freeze = true;
