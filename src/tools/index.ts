// Registers the tools area's commands, panels, tools and help topics.
import './help';
import './wells';
import './select';
import './brush';
import './pencil';
import './eraser';
import './shapes';
import './eyedropper';
import './view-tools';
import './edit-commands';
import './merge-mode';
import './recolour-open';

// Any fill tool the fill area adds (src/tools/fill*.ts) registers itself by being loaded here.
import.meta.glob('./fill*.ts', { eager: true });

// Pixel art tools, palette and commands. Last, since it adds mirror drawing to the brush and eraser above.
import '../pixel';
import '../select';
