// A second window that shows the drawing big and follows the drawing window, for people drawing on a tablet who want the
// picture on another screen. The drawing window's side is link.ts and mirror.ts (it sends what changed); the other window
// is page.tsx, which keeps a copy of the drawing (replica.ts) and paints it with the same renderer the canvas uses.
import './choices';
import './commands';
import './help';
import { installPopoutLink } from './link';

installPopoutLink();
