// Registers the tools area's commands, panels, tools and help topics.
import './help';
import './drawing-help';
import './wells';
import './select';
import './brush';
import './pencil';
import './eraser';
import './shapes';
import './pen';
import './points';
import './polystar';
import './gradient-tool';
import './eyedropper';
import './view-tools';
import './edit-commands';
import './merge-mode';
import './combine';
import './lineStyle';
import './quickshape';
import './rememberUi';
import './mirror-help';
import './recolour-open';

// Any fill tool the fill area adds (src/tools/fill*.ts) registers itself by being loaded here.
import.meta.glob(['./fill*.ts', '!./**/*.bodies.ts'], { eager: true });

// Pixel art tools, palette and commands. Last, since it adds mirror drawing to the brush and eraser above.
import '../pixel';
import '../select';
import '../clipboard';
import '../transform';
