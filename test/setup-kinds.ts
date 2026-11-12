// Every test that draws or exports gets the kinds of shape the app registers (text, particles), and their export code
// loaded, as the app has them at start. A test of what happens without a kind registers none itself.
import '../src/text/kind';
import '../src/particles/kind';
import { loadShapeExports } from '../src/export/shapeExport';
import { godotEngine } from '../src/export/godot';
import { registerEngine } from '../src/export/types';

// Godot is a sprite sheet engine its feature adds in the app; a test has it unless it turns the feature off.
registerEngine(godotEngine);
await loadShapeExports();
