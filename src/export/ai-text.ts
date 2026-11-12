/**
 * Live text for the Illustrator data of a .ai (see ai-native.ts): the text engine's own document, which Illustrator keeps
 * in the file's setup part as one block of ASCII85 text, and the small art item each text frame leaves in its layer.
 *
 * The engine's document is nested dictionaries with numbers for keys, the way Illustrator and Photoshop both save it. Only
 * what a Frameling text has is written (point text: the words, a font, a size, a colour, spacing between letters and
 * lines, left, centre or right), set against the engine's own defaults for the rest. Fonts are named by their PostScript
 * name; a font that is not installed on the computer opens as a missing font (Illustrator swaps in another one, and keeps
 * the name so installing the font fixes it). Pure.
 */

type Mat = [number, number, number, number, number, number];

/** One text frame, in the terms Illustrator keeps it. */
export interface AiTextFrame {
  text: string;
  /** PostScript name of the font, e.g. "Nunito-ExtraBold". */
  font: string;
  size: number;
  /** 0 to 1 each. */
  rgb: [number, number, number];
  /** 0 left, 1 right, 2 centre (Illustrator's numbers). */
  align: 0 | 1 | 2;
  /** Line spacing in points. */
  leading: number;
  /** Space between letters in thousandths of the size. */
  tracking: number;
  /** The text's own space (y down, the first baseline at its origin) to Illustrator's text space (y down). */
  m: Mat;
}

// ---------------------------------------------------------------- names

const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

/**
 * The PostScript name Illustrator knows a font by: the family with its spaces gone, a dash, then the style ("Nunito-ExtraBold",
 * "Nunito-BoldItalic"). The Windows Arial family and the like have their own spellings ("ArialMT", "Arial-BoldItalicMT").
 */
export function psFontName(family: string, weight: number, italic: boolean): string {
  const w = Math.min(900, Math.max(100, Math.round(weight / 100) * 100));
  const bold = w >= 600;
  const low = family.trim().toLowerCase();
  // The old Windows fonts that only come in regular, bold, italic and bold italic, each spelled its own way.
  const classic: Record<string, { name: string; mt: string }> = {
    arial: { name: 'Arial', mt: 'MT' },
    'times new roman': { name: 'TimesNewRoman', mt: 'PSMT' },
    'courier new': { name: 'CourierNewPS', mt: 'MT' },
    verdana: { name: 'Verdana', mt: '' },
    tahoma: { name: 'Tahoma', mt: '' },
    georgia: { name: 'Georgia', mt: '' },
    'trebuchet ms': { name: 'TrebuchetMS', mt: '' },
    'comic sans ms': { name: 'ComicSansMS', mt: '' },
  };
  const c = classic[low];
  if (c) {
    const style = (bold ? 'Bold' : '') + (italic ? 'Italic' : '');
    if (!c.mt) return style ? `${c.name}-${style}` : c.name;
    return style ? `${c.name}-${style}${c.mt}` : `${c.name}${c.mt}`;
  }
  const fam = family.replace(/\s+/g, '');
  // "Nunito-Italic" for a regular italic, "Nunito-BoldItalic" and so on, the way font makers name them.
  const style = italic ? (w === 400 ? 'Italic' : `${WEIGHT_NAMES[w]}Italic`) : WEIGHT_NAMES[w];
  return `${fam}-${style}`;
}

// ---------------------------------------------------------------- the engine's text format

/** A string as the engine keeps it: UTF-16 with a byte order mark, one char per byte of a binary string. */
function str(s: string): string {
  let out = '\u00fe\u00ff';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += String.fromCharCode(c >> 8, c & 255);
  }
  return '(' + out.replace(/[\\()]/g, (m) => '\\' + m) + ')';
}
/** A plain (single byte) string. */
const plain = (s: string) => '(' + s.replace(/[\\()]/g, (m) => '\\' + m) + ')';
/** A real number: the engine tells whole numbers from reals by the point (a whole number 36 is not the real 36.0). */
const n = (v: number) => {
  if (!Number.isFinite(v)) return '0.0';
  const r = Math.round(v * 100000) / 100000;
  if (Object.is(r, -0)) return '0.0';
  return Number.isInteger(r) ? r.toFixed(1) : String(r);
};

/** A repeatable id in the shape of a UUID. */
function uid(kind: number, i: number): string {
  const h = (v: number, w: number) => (v >>> 0).toString(16).padStart(w, '0').slice(-w);
  return `${h(0x46724c00 + kind, 8)}-${h(i, 4)}-4f6e-9a55-${h(0x4c697665 + i * 7919, 8)}${h(kind * 31 + i, 4)}`;
}

/** How the engine sorts the characters that break lines and words (space, return, tab, paragraph and line separators, ideographic space, soft hyphen). */
const CHAR_CLASSES = [[' ', 1], ['\r', 6], ['\t', 0], ['\u2029', 5], ['\u0003', 5], ['\u3000', 1], ['\u00ad', 3]].map(([c, k]) => `<< /0 ${str(c as string)} /1 ${str(String(k))} >>`).join(' ');

const CHAR_DEFAULTS = '/1 12.0 /2 false /3 false /4 true /5 27.0 /6 1.0 /7 1.0 /8 0 /9 0.0 /10 0.0 /11 1 /12 0 /13 0 /14 0 /15 0 /16 0 /17 0.0 /18 true /19 false /20 true /21 false /22 false /23 false /24 false /25 false /26 false /27 true /28 false /29 false /30 0 /31 false /32 false /33 false /34 false /35 1 /36 0.0 /37 2 /38 0 /39 0 /40 false /41 2 /42 0 /43 << /0 .5 >> /44 2 /45 2 /46 7 /47 0 /48 0 /49 -1.0 /50 -1.0 /51 0 /52 false /53 << /99 /SimplePaint /0 << /0 1 /1 [ 1.0 0.0 0.0 0.0 ] >> >> /54 << /99 /SimplePaint /0 << /0 1 /1 [ 1.0 0.0 0.0 0.0 ] >> >> /55 << /99 /CAITextBlender >> /56 true /57 false /58 true /59 false /60 false /61 0 /62 0 /63 1.0 /64 4.0 /65 0.0 /66 [  ] /67 [  ] /68 0 /69 0 /70 0 /71 4 /72 0.0 /73 0.0 /74 false /75 false /76 false /77 true /78 true /79 << /99 /SimplePaint /0 << /0 1 /1 [ 1.0 1.0 1.0 0.0 ] >> >> /80 false /81 0 /82 3.0 /83 3.0 /84 false /85 0 /86 << /99 /SimpleCustomFeature >> /87 100.0 /88 true /89 12.0 /90 0 /91 1 /92 0.0';
const PARA_DEFAULTS = '<< /0 0 /1 0.0 /2 0.0 /3 0.0 /4 0.0 /5 0.0 /6 1 /7 1.2 /8 0 /9 true /10 6 /11 2 /12 2 /13 0 /14 36.0 /15 true /16 .5 /17 [ .8 1.0 1.33 ] /18 [ 0.0 0.0 0.0 ] /19 [ 1.0 1.0 1.0 ] /20 6 /21 false /22 0 /23 false /24 0 /25 0 /27 /nil /26 false /28 /nil /29 false /30 <<  >> /31 36.0 /32 << /38 0 >> /33 0 /34 0 /35 0 /36 /nil /37 0 /38 false /39 0 /40 2 >>';

/** The character settings every text starts from (font index first, the way the engine lists them). */
const charDefaults = (font: number) => `<< /0 ${font} ${CHAR_DEFAULTS} >>`;

/** The ids that tie a text to its place in the document, in the order the frames are listed. */
export function storyUid(i: number): string {
  return uid(1, i);
}

/**
 * The engine's whole document for these text frames, as a binary string (every char one byte). `origin` is where the text
 * space has its (0, 0): the file's artboard corner, in the text space, so a frame's matrix can be worked out in its terms.
 */
export function textEngineData(frames: AiTextFrame[], origin: [number, number]): string {
  const fonts: string[] = [];
  for (const f of frames) if (!fonts.includes(f.font)) fonts.push(f.font);
  const fontSet = `<< /0 [ ${fonts
    .map((f, i) => `<< /0 << /99 /CoolTypeFont /97 ${plain(uid(2, i))} /0 << /0 ${str(f)} /2 0 >> >> >>`)
    .join(' ')} ] /1 [ << /0 0 >> ] >>`;
  const frameSet = `<< /0 [ ${frames
    .map((f, i) => {
      // The frame sits at the text space's origin; the matrix carries it to where the text goes.
      const [ox, oy] = origin;
      return `<< /0 << /97 ${plain(uid(3, i))} /0 [ ${n(ox)} ${n(oy)} ] /2 << /2 [ ${f.m.map(n).join(' ')} ] >> >> >>`;
    })
    .join(' ')} ] >>`;
  const stories = frames.map((f, i) => {
    const paras = f.text.split(/\r\n|\r|\n/);
    const full = paras.map((p) => p + '\r');
    const total = full.reduce((t, p) => t + p.length, 0);
    const fontIdx = fonts.indexOf(f.font);
    const props = `<< /0 ${fontIdx} /1 ${n(f.size)} /5 ${n(f.leading)} /8 ${Math.round(f.tracking)} /53 << /99 /SimplePaint /0 << /0 1 /1 [ 1.0 ${f.rgb.map(n).join(' ')} ] >> >> /89 ${n(f.size)} /92 0.0 >>`;
    const charRun = `<< /0 << /0 << /97 ${plain(uid(4, i))} /0 ${str('')} /5 0 /6 ${props} >> >> /1 ${total} >>`;
    const paraRun = f.align
      ? `/5 << /0 [ ${full
          .map((p, k) => `<< /0 << /0 << /97 ${plain(uid(5, i * 1000 + k))} /0 ${str('')} /5 << /0 ${f.align} >> /6 0 >> >> /1 ${p.length} >>`)
          .join(' ')} ] >> `
      : '';
    return `<< /0 << /0 ${str(full.join(''))} ${paraRun}/6 << /0 [ ${charRun} ] >> /10 << /0 4 /2 true >> >> /1 << /0 [ << /0 ${i} >> ] /1 << /0 [ << /0 << /1 1 >> /1 ${total} >> ] >> /2 [ ] >> >>`;
  });
  const doc =
    `/98 << /0 7 >> /0 << /1 ${fontSet} /5 << /0 [ << /0 << /97 ${plain(uid(6, 0))} /0 ${str('[Normal Character Style]')} /6 ${charDefaults(0)} >> >> ] /1 [ << /0 0 >> ] >> ` +
    `/6 << /0 [ << /0 << /97 ${plain(uid(6, 1))} /0 ${str('[Normal Paragraph Style]')} /5 ${PARA_DEFAULTS} >> >> ] /1 [ << /0 0 >> ] >> /8 ${frameSet} >> ` +
    `/1 << /0 << /0 << /0 2 /1 [ ${CHAR_CLASSES} ] >> /1 0 /2 0 /3 .583 /4 .333 /5 .583 /6 .333 /7 .7 /8 true /9 [ ] /11 6 /15 << /0 ${str('Hunspell')} >> /16 true /17 0 >> ` +
    `/1 [ ${stories.join(' ')} ] /2 ${charDefaults(0)} /3 ${PARA_DEFAULTS} >>`;
  return doc;
}

// ---------------------------------------------------------------- ASCII85

/** Adobe's ASCII85 of some bytes (one char per byte), in lines of at most 98 characters, each starting with "%" for the file. */
export function ascii85Lines(bin: string): string[] {
  const out: string[] = [];
  let line = '';
  const put = (c: string) => {
    line += c;
    if (line.length >= 98) {
      out.push('%' + line);
      line = '';
    }
  };
  for (let i = 0; i < bin.length; i += 4) {
    const k = Math.min(4, bin.length - i);
    let v = 0;
    for (let j = 0; j < 4; j++) v = v * 256 + (j < k ? bin.charCodeAt(i + j) & 255 : 0);
    if (v === 0 && k === 4) {
      put('z');
      continue;
    }
    const d: string[] = [];
    for (let j = 0; j < 5; j++) {
      d.unshift(String.fromCharCode(33 + (v % 85)));
      v = Math.floor(v / 85);
    }
    for (const c of d.slice(0, k + 1)) put(c);
  }
  put('~');
  put('>');
  if (line) out.push('%' + line);
  return out;
}

/** The setup lines of the text engine: the encodings of the fonts used, then the document. */
export function textSetupLines(frames: AiTextFrame[], origin: [number, number]): string[] {
  if (!frames.length) return [];
  const out: string[] = [];
  const fonts: string[] = [];
  for (const f of frames) if (!fonts.includes(f.font)) fonts.push(f.font);
  for (const f of fonts) out.push('%AI55J_Tsume: None', `%AI3_BeginEncoding: _${f} ${f}`, `[/_${f}/${f} 0 0 0 TZ%AI3_EndEncoding TrueType`);
  out.push('%AI11_BeginTextDocument', '/AI11TextDocument : /ASCII85Decode ,', ...ascii85Lines(textEngineData(frames, origin)), ';', '%AI11_EndTextDocument');
  return out;
}

/** The art item a text frame leaves in its layer: which story and frame it is, then how it blends. */
export function textItem(index: number, blend: number, opacity: number): string {
  return [
    '/AI11Text :',
    '0 /FreeUndo ,',
    '0 /FrameIndex ,',
    `${index} /StoryIndex ,`,
    '2 /TextAntialiasing ,',
    ';',
    '%_/ArtDictionary :',
    `%_${plain(uid(7, index))} /UnicodeString (AI24 TextStoryRawDataUUID) ,`,
    '%_;',
    '%_',
    `${blend} ${n(opacity)} 0 0 0 Xy`,
    '0 J 0 j 1 w 10 M []0 d',
    '0 XR',
    '0 0 Xd',
    '6 () XW',
  ].join('\n');
}
