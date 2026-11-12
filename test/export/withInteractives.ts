// Import for the side effect: registers the Interactives export card, which the Interactives feature adds in the app.
import { registerExporter } from '../../src/export/registry';
import { interactivesExporter } from '../../src/interactives/exporter';

registerExporter(interactivesExporter);
