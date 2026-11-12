// Every test that draws or exports gets the kinds of shape the app registers (text, particles), and their export code
// loaded, as the app has them at start. A test of what happens without a kind registers none itself.
import '../src/text/kind';
import '../src/particles/kind';
import { loadShapeExports } from '../src/export/shapeExport';

await loadShapeExports();
