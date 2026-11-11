// Quill's app icon, drawn at its two real sizes rather than shrunk from one: a 32px tile
// (scaled up by whole pixels for every size from 32 to 1024) and a 16px one (16 and 48).
// Grape tile, so every pencil colour shows; the hood goes to grape-shade to stay off the tile.
import {PALETTE} from './quill-frames.mjs';

const g = s => s.trim().split('\n').map(r => r.trim());

export const ICONS = {
	palette: PALETTE,
	icon32: g(`
		...gggggggggggggggggggggggggg...
		..gggggggggggggggggggggggggggg..
		.gggggggggggggggggggggggggggggg.
		gggggggggggggggggggggggggggggggg
		gggggggggggggggggggggggggggggggg
		ggggggggggggggggggkggggggggggggg
		gggggggggggggggggkwkgggggggggggg
		ggggggggggggggggkwwwkggggggggggg
		ggggggggkkkgggggkmmMkggggkkkgggg
		ggggggggkwwkkgggkmmMkgggkwwkgggg
		gggggggggkwyYkggkmmMkggkSswkgggg
		ggggggkkkkkyyYkgkmmMkgkSsskggggg
		gggggkwwrrkkyyYkkmmMkkSsskgggggg
		ggggkwwrrrrkkyyYkmmMkGkkkgkkgggg
		gggggkkRRrrrrkkkGkkkGGGGGkrpkggg
		gggggggkkRRrrkGGGGkkkkkkkkppkggg
		gggggggggkkRRkGGkkpppppppkkkgggg
		ggggggkkkkkkkGGkpppppppppppkkggg
		gggggkwsssssskkppppppppppppppkgg
		ggggkwwsssssskkppwkppppwkpppkkgg
		ggggkkwSSSSSSkkppkkppppkkpppkkgg
		ggggggkkkkkkkGkppkkppppkkppPPkgg
		gggggggggkkmmkkrrpppkppkprrPkggg
		gggggggkkmmmmkGkpppppkkpppPkkggg
		gggggkkmmmmMMkGGkkpppppPPkkkgggg
		ggggkwwmmMMkkkkGGkkkkkkkkggggggg
		gggggkwMMkkggggkkggggggggggggggg
		ggggggkkkggggggggggggggggggggggg
		gggggggggggggggggggggggggggggggg
		.gggggggggggggggggggggggggggggg.
		..gggggggggggggggggggggggggggg..
		...gggggggggggggggggggggggggg...
	`),
	icon16: g(`
		.gggggggggggggg.
		ggggggggkggggggg
		ggkggggkwwkggggg
		ggkwwkgkmMkggggg
		gggkrRkkmMkggggg
		ggggkrRkmMkggggg
		gggggkkkkkkkkggg
		gggggkGGGppppkgg
		ggkkkkGGppppppkg
		gkwsskGpkpppkpkg
		gkwSSkGpkpppkpkg
		ggkkkkGrppkpprkg
		gggggkpppppppPkg
		ggggggkpppppPkgg
		gggggggkkkkkkggg
		.gggggggggggggg.
	`),
};
