// The entry of the Stream control board (streamboard.html). Built apart from the app with the picture window
// (vite.popout.config.ts), so opening it loads only the board, none of the panels, commands or tools.
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito';
import { BoardPage } from '../streamboard/page';

createRoot(document.getElementById('root')!).render(<BoardPage />);
