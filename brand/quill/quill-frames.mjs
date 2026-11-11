// Quill, the Frameling mascot: a hedgehog whose quills are coloured pencils.
//
// Everything here is hand-placed pixel data. Each part is an ASCII grid of palette letters
// ('.' is transparent) with the x,y where its top-left sits in the idle frame. A frame is a
// pose: which variant of each part to draw and how far to nudge the groups. build.mjs stacks
// the parts in LAYERS order to get each frame's grid (it also writes the flattened grids to
// brand/quill/frames-<size>.txt so every frame can be read as plain ASCII).
//
// Pencil quills are drawn without outlines; the builder rings each one in ink, so a pencil
// can be nudged (cheer, oops) without redrawing its outline by hand.

export const PALETTE = {
	k: '#1d1b26', // ink
	w: '#fffaf0', // paper
	y: '#ffc94a', // sunny
	Y: '#f2a91c', // sunny-deep
	p: '#ff9e6d', // peach
	P: '#e8794f', // peach shade (extra)
	r: '#ff6f91', // rose
	R: '#e04a72', // rose shade (extra)
	g: '#9b7bff', // grape
	G: '#7657e0', // grape shade (extra)
	s: '#5ab8ff', // sky
	S: '#3a8fe0', // sky shade (extra)
	m: '#4fd1a5', // mint
	M: '#2fae85', // mint shade (extra)
};

// Draw order, back to front. 'pencils' expands to every quill.
export const LAYERS = ['body', 'feet', 'hood', 'pencils', 'ear', 'face', 'cheek', 'eyes', 'mouth', 'arm', 'fx'];
// Which layers ride on the upper body (the head bobs separately from the feet).
export const UPPER = ['hood', 'pencils', 'ear', 'face', 'cheek', 'eyes', 'mouth'];

const g = s => s.trim().split('\n').map(r => r.trim());

/* ------------------------------------------------------------------ A: 32 x 32 ------ */

export const A = {
	size: 32,
	//parts are drawn in idle coordinates, this drops him to stand on the bottom row with headroom for jumps
	base: [0, 2],
	parts: {
		body: {
			idle: [13, 21, g(`
				kpppppppppppk
				kpppppppppPPk
				kpppwwwwwpPPk
				kppwwwwwwwpPk
				.kppwwwwwpPk.
				..kPPPPPPPPk.
			`)],
		},
		feet: {
			stand: [13, 27, g(`
				.kppk..kpppk.
				.kkkk..kkkkk.
			`)],
			//legs tucked up under him mid-jump
			tuck: [13, 26, g(`
				..kpk..kppk..
				..kkk..kkkk..
			`)],
		},
		hood: {
			idle: [10, 8, g(`
				.....kkkkkkk.......
				...kkgggggggkk.....
				..kgggggggggggk....
				.kgggggggggggggk...
				kgggggggggggggggk..
				kggggggggggggggggk.
				kGgggggggggggggggk.
				kGggggggggggggggggk
				kGggggggggggggggggk
				kGGgggggggggggggggk
				kGGggggggggggggggk.
				.kGGgggggggggggggk.
				.kGGGgggggggggggk..
				..kkGGk............
				....kk.............
			`)],
		},
		ear: {
			idle: [24, 9, g(`
				.kk.
				krpk
				kppk
			`)],
			//flattened back, for the startle
			flat: [25, 10, g(`
				kkk.
				kprk
			`)],
		},
		face: {
			idle: [13, 11, g(`
				....kkkkkkk.....
				..kkpppppppkk...
				.kpppppppppppk..
				kppppppppppppppk
				kpppppppppppppkk
				kpppppppppppppkk
				kppppppppppppPPk
				kppppppppppppPk.
				.kppppppppppPk..
				..kkpppppPPkk...
				....kkkkkkk.....
			`)],
		},
		cheek: {
			idle: [14, 18, g(`rr........rr`)],
			//blushing harder when happy
			big: [14, 18, g(`
				rr........rr
				.r........r.
			`)],
		},
		eyes: {
			open: [16, 15, g(`
				wk....wk
				kk....kk
				kk....kk
			`)],
			half: [16, 16, g(`
				kk....kk
				kk....kk
			`)],
			shut: [15, 17, g(`kkk...kkk`)],
			happy: [15, 15, g(`
				.kk....kk.
				k..k..k..k
			`)],
			up: [17, 14, g(`
				kw....kw
				kk....kk
				kk....kk
			`)],
			look: [17, 15, g(`
				kw....kw
				kk....kk
				kk....kk
			`)],
			down: [16, 16, g(`
				kk....kk
				kw....kw
				kk....kk
			`)],
			wide: [15, 14, g(`
				.kk....kk.
				kwwk..kwwk
				kwkk..kwkk
				.kk....kk.
			`)],
			sleep: [15, 16, g(`
				k..k..k..k
				.kk....kk.
			`)],
		},
		mouth: {
			smile: [19, 18, g(`
				k..k
				.kk.
			`)],
			open: [19, 18, g(`
				kkkk
				kRRk
				.kk.
			`)],
			o: [20, 18, g(`
				kk
				kk
			`)],
			flat: [20, 19, g(`kk`)],
			grin: [18, 18, g(`
				kkkkkk
				.kRRk.
				..kk..
			`)],
			wobble: [19, 19, g(`.k.k`)],
		},
		arm: {
			//waving paw, two beats
			wave1: [24, 17, g(`
				....kk.
				...kppk
				...kppk
				..kpkk.
				.kpk...
				ppk....
			`)],
			wave2: [24, 16, g(`
				.....kk.
				....kppk
				....kppk
				...kpkk.
				..kpk...
				.kpk....
				ppk.....
			`)],
			point: [24, 20, g(`
				....kkk.
				.kkkpppk
				ppppppk.
				.kkkkk..
			`)],
			chin: [21, 19, g(`
				.kk.
				kppk
				kppk
				.kpp
			`)],
			//both paws up for the cheer
			up: [23, 15, g(`
				...kk...
				..kppk..
				..kppk..
				..kpk...
				.kpk....
				kpk.....
			`)],
			//holding a pencil he's pulled off his back, nib down on the page
			draw1: [24, 18, g(`
				...kk...
				..kssk..
				..kssk..
				.kkppk..
				ppppppk.
				.kkkkwk.
				.....k..
			`)],
			draw2: [24, 18, g(`
				....kk..
				...kssk.
				...kssk.
				..kkppk.
				pppppppk
				.kkkkkwk
				......k.
			`)],
		},
		fx: {
			sweat: [27, 9, g(`
				.k.
				ksk
				kwsk
				.kk
			`)],
			sweat2: [27, 11, g(`
				.k.
				ksk
				kwsk
				.kk
			`)],
			z1: [25, 7, g(`
				ggg
				.g.
				ggg
			`)],
			z2: [26, 3, g(`
				gggg
				..g.
				.g..
				gggg
			`)],
			spark1: [26, 6, g(`
				.y.
				ywy
				.y.
			`)],
			spark2: [1, 2, g(`
				.y.
				ywy
				.y.
			`)],
			spark3: [28, 12, g(`w`)],
			ask: [26, 4, g(`
				ggg.
				...g
				.gg.
				....
				.g..
			`)],
			dot1: [26, 9, g(`w`)],
			dot2: [27, 7, g(`
				w.
				.w
			`)],
			scrib1: [26, 28, g(`.gg`)],
			scrib2: [24, 28, g(`gg.gg.`)],
			scrib3: [24, 28, g(`
				gg..gg.g
				..gg..g.
			`)],
		},
	},
	// Pencil quills, back to front. [colour, shade, x, y, rows] with c/C standing in for
	// the colour and shade, and spread/droop nudges for the poses that use them.
	pencils: [
		{c: 'm', C: 'M', at: [3, 18], spread: [-1, 1], droop: [0, 1], rows: g(`
			.......cc
			.....cccc
			...ccccCC
			kwwccCC..
			..wCC....
		`)},
		{c: 's', C: 'S', at: [3, 14], spread: [-1, 0], droop: [0, 1], rows: g(`
			..wcccccc
			.wwcccccc
			k.wCCCCCC
		`)},
		{c: 'r', C: 'R', at: [3, 8], spread: [-1, -1], droop: [0, 2], rows: g(`
			..wwcc...
			kwwcccc..
			...CCcccc
			.....CCcc
			.......CC
		`)},
		{c: 'y', C: 'Y', at: [7, 4], spread: [-1, -1], droop: [1, 2], rows: g(`
			k......
			.ww....
			..wcC..
			...ccC.
			....ccC
			.....ccC
		`)},
		{c: 'm', C: 'M', at: [16, 1], spread: [0, 0], droop: [1, 2], rows: g(`
			.k.
			.w.
			www
			ccC
			ccC
			ccC
			ccC
			ccC
			ccC
		`)},
		{c: 's', C: 'S', at: [21, 4], spread: [1, -1], droop: [0, 2], rows: g(`
			.....k
			...ww.
			..Ccw.
			.Ccc..
			Ccc...
		`)},
	],
	// Poses. dx,dy move the whole character; up nudges the head group against the body;
	// quills: 'rest' | 'spread' | 'droop'.
	poses: {
		idle:      {},
		breathe:   {up: [0, 1]},
		blink:     {eyes: 'shut'},
		blinkHalf: {eyes: 'half'},
		breatheBlink: {up: [0, 1], eyes: 'shut'},

		wave0:  {arm: 'wave1', mouth: 'open'},
		wave1:  {arm: 'wave1', mouth: 'open', eyes: 'happy'},
		wave2:  {arm: 'wave2', mouth: 'open', eyes: 'happy', up: [0, -1]},
		waveSquash: {up: [0, 1], arm: 'wave1', eyes: 'happy'},

		talk0: {mouth: 'open', up: [0, -1]},
		talk1: {mouth: 'smile'},
		talk2: {mouth: 'o', up: [0, -1]},
		talk3: {mouth: 'smile', eyes: 'half'},

		point0: {arm: 'point', eyes: 'look'},
		point1: {arm: 'point', eyes: 'look', up: [0, 1]},
		pointWink: {arm: 'point', eyes: 'look', mouth: 'open'},

		cheerCrouch: {up: [0, 2], dy: 0, eyes: 'happy', feet: 'stand'},
		cheerJump:   {dy: -2, quills: 'spread', eyes: 'happy', mouth: 'grin', arm: 'up', feet: 'tuck', cheek: 'big', fx: ['spark1']},
		cheerPeak:   {dy: -3, quills: 'spread', eyes: 'happy', mouth: 'grin', arm: 'up', feet: 'tuck', cheek: 'big', fx: ['spark1', 'spark2']},
		cheerLand:   {up: [0, 2], eyes: 'happy', mouth: 'grin', cheek: 'big', fx: ['spark2', 'spark3']},
		cheerSettle: {eyes: 'happy', mouth: 'smile', cheek: 'big'},

		think0: {eyes: 'up', arm: 'chin', mouth: 'flat'},
		think1: {eyes: 'up', arm: 'chin', mouth: 'flat', up: [-1, 0], fx: ['dot1']},
		think2: {eyes: 'up', arm: 'chin', mouth: 'flat', up: [-1, 0], fx: ['dot1', 'dot2']},
		think3: {eyes: 'up', arm: 'chin', mouth: 'flat', fx: ['dot1', 'dot2', 'ask']},
		think4: {eyes: 'up', arm: 'chin', mouth: 'flat', up: [1, 0], fx: ['ask']},
		thinkBlink: {eyes: 'shut', arm: 'chin', mouth: 'flat', up: [1, 0], fx: ['ask']},

		draw0: {eyes: 'down', arm: 'draw1', mouth: 'smile', fx: ['scrib1']},
		draw1: {eyes: 'down', arm: 'draw2', mouth: 'smile', up: [0, 1], fx: ['scrib2']},
		draw2: {eyes: 'down', arm: 'draw1', mouth: 'smile', fx: ['scrib3']},
		draw3: {eyes: 'happy', arm: 'draw2', mouth: 'open', up: [0, -1], fx: ['scrib3']},

		sleep0: {up: [0, 3], dy: 1, eyes: 'sleep', mouth: 'flat', quills: 'droop', feet: 'none', fx: ['z1']},
		sleep1: {up: [0, 4], dy: 1, eyes: 'sleep', mouth: 'flat', quills: 'droop', feet: 'none', fx: ['z1']},
		sleep2: {up: [0, 4], dy: 1, eyes: 'sleep', mouth: 'flat', quills: 'droop', feet: 'none', fx: ['z1', 'z2']},
		sleep3: {up: [0, 3], dy: 1, eyes: 'sleep', mouth: 'flat', quills: 'droop', feet: 'none', fx: ['z2']},

		oops0: {up: [0, 1], eyes: 'shut', mouth: 'flat'},
		oops1: {dy: -2, quills: 'spread', ear: 'flat', eyes: 'wide', mouth: 'o', feet: 'tuck', fx: ['sweat']},
		oops2: {dy: -1, quills: 'spread', ear: 'flat', eyes: 'wide', mouth: 'o', fx: ['sweat']},
		oops3: {eyes: 'wide', mouth: 'wobble', fx: ['sweat2']},
		oops4: {eyes: 'open', mouth: 'wobble', fx: ['sweat2']},
	},
};

/* ------------------------------------------------------------------ B: 48 x 48 ------ */

// Same character with more room for the face. Started as a 1.5x blow-up of A's parts with the
// outlines thinned back to one pixel, then the face, eyes, mouths, paws and effects were
// redrawn at this size by hand. Poses are A's, with their nudges scaled by 1.5.
export const B = {
	size: 48,
	base: [0, 3],
	offsetScale: 1.5,
	parts: {
		body: {
			idle: [18, 30, g(`
				..kkkkkkkkkkkkkkkkk..
				.kpppppppppppppppppk.
				.kppppppppppppppPPPk.
				.kppppppppppppppPPPk.
				.kpppppwwwwwwwppPPPk.
				.kpppwwwwwwwwwwwpPPk.
				.kpppwwwwwwwwwwwpPPk.
				..kkpppwwwwwwwppPkk..
				....kppppppppppPPk...
				....kPPPPPPPPPPPPk...
				.....kkkkkkkkkkkk....
			`)],
		},
		hood: {
			idle: [14, 11, g(`
				..............................
				........kkkkkkkkkkk...........
				.......kgggggggggggk..........
				.....kkkgggggggggggkkk........
				....kgggggggggggggggggk.......
				...kgggggggggggggggggggk......
				..kkgggggggggggggggggggkk.....
				.kgggggggggggggggggggggggk....
				.kggggggggggggggggggggggggk...
				.kggggggggggggggggggggggggk...
				.kGGggggggggggggggggggggggkk..
				.kGGggggggggggggggggggggggggk.
				.kGGggggggggggggggggggggggggk.
				.kGGggggggggggggggggggggggggk.
				.kGGGgggggggggggggggggggggggk.
				.kGGGgggggggggggggggggggggggk.
				.kGGGgggggggggggggggggggggkk..
				..kkGGGgggggggggggggggggggk...
				...kGGGgggggggggggggggggggk...
				...kGGGGgggggggggggggggggk....
				....kkkkkkkkkkkkkkkkkkkkk.....
				..............................
				..............................
				..............................
			`)],
		},
		ear: {
			idle: [35, 12, g(`
				........
				..kkk...
				.krrpk..
				.krrpk..
				.kpppk..
				..kkk...
			`)],
			flat: [36, 14, g(`
				........
				..kkk...
				.kpprk..
				.kpprk..
				..kkk...
			`)],
		},
		face: {
			//redrawn by hand at this size, the blow-up's snout was lumpy
			idle: [19, 16, g(`
				......kkkkkkkkkkkk.......
				....kkppppppppppppkk.....
				...kppppppppppppppppk....
				..kppppppppppppppppppk...
				.kppppppppppppppppppppk..
				.kppppppppppppppppppppk..
				kppppppppppppppppppppppk.
				kppppppppppppppppppppppkk
				kppppppppppppppppppppppkk
				kppppppppppppppppppppppk.
				kppppppppppppppppppppPPk.
				kppppppppppppppppppppPPk.
				.kppppppppppppppppppPPk..
				.kpppppppppppppppppPPPk..
				..kpppppppppppppppPPPk...
				...kkpppppppppppPPPkk....
				.....kkkkkkkkkkkkkk......
			`)],
		},
		cheek: {
		},
		eyes: {
		},
		mouth: {
		},
		arm: {
			//drawn by hand at 48: round paws with a palm pad, shaded on the lower right
			wave1: [36, 21, g(`
				......kkkk..
				.....kppppk.
				.....kpppPk.
				.....kprrPk.
				.....kppPPk.
				....kppPkk..
				...kppPk....
				..kppPk.....
				.kppPk......
				kppPk.......
				.pPk........
				.pk.........
			`)],
			wave2: [36, 20, g(`
				.......kkkk.
				......kppppk
				......kpppPk
				......kprrPk
				......kppPPk
				.....kppPkk.
				....kppPk...
				...kppPk....
				..kppPk.....
				.kppPk......
				kppPk.......
				.pPk........
				.pk.........
			`)],
			up: [36, 13, g(`
				.......kkkk.
				......kppppk
				......kprrPk
				......kpppPk
				......kppPPk
				.......kpPk.
				.......kpPk.
				.......kpPk.
				.......kpPk.
				.......kpPk.
				.......kpPk.
				.......kpPk.
				.......kpPk.
				......kppPk.
				.....kppPk..
				....kppPk...
				...kppPk....
				..kppPk.....
				.kppk.......
				.ppk........
			`)],
			point: [36, 30, g(`
				.....kkkk...
				.kkkkppppkkk
				kppppppppppk
				kpppppppPkk.
				kPPPPppPPk..
				.kkkkkkkkk..
			`)],
			draw1: [36, 23, g(`
				...kk......
				..krRk.....
				..kYYk.....
				...ksSk....
				...ksSk....
				....ksSk...
				....ksSk...
				....kkkkk..
				.kkkpppppk.
				kpppppppPPk
				kPPPppkpPPk
				.kkkkkkksSk
				.......kwwk
				........kwk
				.........k.
			`)],
			draw2: [37, 23, g(`
				...kk......
				..krRk.....
				..kYYk.....
				...ksSk....
				...ksSk....
				....ksSk...
				....ksSk...
				....kkkkk..
				.kkkpppppk.
				kpppppppPPk
				kPPPppkpPPk
				.kkkkkkksSk
				.......kwwk
				........kwk
				.........k.
			`)],
			chin: [30, 27, g(`
				........
				..kkk...
				.kpppk..
				.kpppk..
				.kpppkk.
				..kkpppk
				...kpppk
				....kkk.
			`)],
		},
		fx: {
		},
		feet: {
			stand: [21, 40, g(`
				kppppk...kpppppk
				kPPPPk...kPPPPPk
				.kkkk.....kkkkk.
			`)],
			tuck: [21, 38, g(`
				.kppk.....kpppk.
				.kkkk.....kkkkk.
			`)],
		},
		cheek: {
			idle: [21, 27, g(`
				rrr............rrr
			`)],
			big: [21, 27, g(`
				rrr............rrr
				.r..............r.
			`)],
		},
		eyes: {
			open: [24, 22, g(`
				wkk......wkk
				wkk......wkk
				kkk......kkk
				kkk......kkk
			`)],
			half: [24, 24, g(`
				kkk......kkk
				kkk......kkk
			`)],
			shut: [23, 25, g(`
				kkkkk....kkkkk
			`)],
			happy: [23, 23, g(`
				.kkk.....kkk..
				k...k....k...k
			`)],
			up: [25, 21, g(`
				kkw......kkw
				kkw......kkw
				kkk......kkk
				kkk......kkk
			`)],
			look: [25, 22, g(`
				kkw......kkw
				kkw......kkw
				kkk......kkk
				kkk......kkk
			`)],
			down: [24, 23, g(`
				kkk......kkk
				kkk......kkk
				wkk......wkk
			`)],
			wide: [23, 21, g(`
				.kkk.....kkk.
				kwwwk...kwwwk
				kwkkk...kwkkk
				kwkkk...kwkkk
				.kkk.....kkk.
			`)],
			sleep: [23, 24, g(`
				k...k....k...k
				.kkk......kkk.
			`)],
		},
		mouth: {
			smile: [27, 27, g(`
				k....k
				.kkkk.
			`)],
			open: [27, 27, g(`
				kkkkkk
				kRRRRk
				.kRRk.
				..kk..
			`)],
			o: [28, 27, g(`
				.kk.
				kRRk
				kRRk
				.kk.
			`)],
			flat: [28, 28, g(`
				kkkk
			`)],
			grin: [26, 27, g(`
				kkkkkkkk
				.kRRRRk.
				..kRRk..
				...kk...
			`)],
			wobble: [27, 28, g(`
				.k..k.
				k.kk.k
			`)],
		},
		fx: {
			sweat: [41, 13, g(`
				.k..
				ksk.
				kswk
				kssk
				.kk.
			`)],
			sweat2: [41, 16, g(`
				.k..
				ksk.
				kswk
				kssk
				.kk.
			`)],
			z1: [38, 10, g(`
				gggg
				..g.
				.g..
				gggg
			`)],
			z2: [39, 4, g(`
				ggggg
				...g.
				..g..
				.g...
				ggggg
			`)],
			spark1: [39, 8, g(`
				..y..
				..y..
				yywyy
				..y..
				..y..
			`)],
			spark2: [2, 3, g(`
				..y..
				..y..
				yywyy
				..y..
				..y..
			`)],
			spark3: [42, 18, g(`
				.w.
				www
				.w.
			`)],
			ask: [39, 5, g(`
				.ggg.
				g...g
				...g.
				..g..
				.....
				..g..
			`)],
			dot1: [40, 14, g(`
				ww
				ww
			`)],
			dot2: [42, 10, g(`
				.w.
				www
				.w.
			`)],
			scrib1: [42, 38, g(`
				..gg
				gg..
			`)],
			scrib2: [38, 38, g(`
				gg..gg..
				..gg..gg
			`)],
			scrib3: [35, 38, g(`
				gg..gg..gg.g
				..gg..gg..g.
			`)],
		},
	},
	pencils: [
		{c: 'm', C: 'M', at: [4, 27], spread: [-1,1], droop: [0,1], rows: g(`
			..........ccc
			.......cccccc
			.......cccccc
			....ccccccCCC
			kwwwcccCCC...
			kwwwcccCCC...
			...wCCC......
		`)},
		{c: 's', C: 'S', at: [4, 21], spread: [-1,0], droop: [0,1], rows: g(`
			...wccccccccc
			.wwwccccccccc
			.wwwccccccccc
			k..wCCCCCCCCC
		`)},
		{c: 'r', C: 'R', at: [4, 12], spread: [-1,-1], droop: [0,3], rows: g(`
			...wwwccc....
			kwwwcccccc...
			kwwwcccccc...
			....CCCcccccc
			.......CCCccc
			.......CCCccc
			..........CCC
		`)},
		{c: 'y', C: 'Y', at: [10, 6], spread: [-1,-1], droop: [1,3], rows: g(`
			k...........
			.www........
			.www........
			...wccC.....
			....cccCC...
			....cccCC...
			......cccC..
			.......cccCC
			.......cccCC
		`)},
		{c: 'm', C: 'M', at: [24, 1], spread: [0,0], droop: [1,3], rows: g(`
			.kk.
			.ww.
			.ww.
			wwww
			cccC
			cccC
			cccC
			cccC
			cccC
			cccC
			cccC
			cccC
			cccC
		`)},
		{c: 's', C: 'S', at: [31, 6], spread: [1,-1], droop: [0,3], rows: g(`
			.......kk
			....www..
			....www..
			...Cccw..
			.CCccc...
			.CCccc...
			Cccc.....
		`)},

	],
	//B has room for a proper both-arms-high cheer, A borrows the wave paw for it
	poses: {
		...A.poses,
		cheerJump: {...A.poses.cheerJump, arm: 'up'},
		cheerPeak: {...A.poses.cheerPeak, arm: 'up'},
	},
};

// Animations: frames in play order, [pose, ms]. Holds are just long frames.
export const ANIMS = {
	idle: {loop: true, frames: [
		['idle', 700], ['breathe', 500], ['idle', 700], ['breathe', 500],
		['idle', 600], ['blinkHalf', 50], ['blink', 90], ['blinkHalf', 50], ['idle', 500], ['breathe', 500],
	]},
	wave: {loop: true, frames: [
		['waveSquash', 90], ['wave0', 90], ['wave2', 160], ['wave1', 140], ['wave2', 160], ['wave1', 140], ['wave2', 160], ['wave1', 300],
	]},
	talk: {loop: true, frames: [
		['talk0', 110], ['talk1', 90], ['talk2', 110], ['talk1', 120], ['talk0', 100], ['talk3', 140],
	]},
	point: {loop: true, frames: [
		['point0', 500], ['point1', 220], ['point0', 400], ['pointWink', 160], ['point0', 300], ['point1', 220],
	]},
	cheer: {loop: false, frames: [
		['cheerCrouch', 110], ['cheerJump', 90], ['cheerPeak', 220], ['cheerJump', 80], ['cheerLand', 110], ['cheerSettle', 500],
	]},
	think: {loop: true, frames: [
		['think0', 300], ['think1', 300], ['think2', 360], ['think3', 500], ['think4', 360], ['thinkBlink', 100], ['think4', 300],
	]},
	draw: {loop: true, frames: [
		['draw0', 140], ['draw1', 120], ['draw2', 140], ['draw1', 120], ['draw2', 160], ['draw3', 320],
	]},
	sleep: {loop: true, frames: [
		['sleep0', 700], ['sleep1', 600], ['sleep2', 700], ['sleep1', 500], ['sleep3', 700],
	]},
	oops: {loop: false, frames: [
		['oops0', 70], ['oops1', 110], ['oops2', 160], ['oops3', 300], ['oops4', 500],
	]},
};
