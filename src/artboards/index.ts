// Artboards: several named canvases in one document (a sprite each, a shot each). See docs/artboards.md.
import { addPointerDownHook } from '../canvas/controller';
import { store } from '../core/store';
import { lookingThrough } from '../camera/ops';
import { activeArtboard, artboardAt, hasArtboards } from './model';
import { goToArtboard, installArtboards } from './ops';
import './commands';
import './tool';
import './help';

installArtboards();

// Drawing on another artboard opens it first. The Artboard tool and the view tools handle their own clicks.
addPointerDownHook((p, tool) => {
  if (tool === 'artboard' || tool === 'hand' || tool === 'zoom') return;
  const s = store();
  if (s.nestedTag()) return;
  const { doc } = s.get();
  if (!hasArtboards(doc) || doc.editing?.length || lookingThrough()) return;
  if (p.x >= 0 && p.y >= 0 && p.x < doc.width && p.y < doc.height) return;
  const a = activeArtboard(doc);
  const id = artboardAt(doc, p.x + a.x, p.y + a.y);
  if (id && id !== a.id) goToArtboard(id);
});
