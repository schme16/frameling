// Bringing in work from elsewhere: a folder or zip of pictures as frames, an SVG or logo as vector layers, and a layered
// Photoshop or OpenRaster file as pixel layers. The reading and building are plain functions (sequence/, svg/, layered/);
// this registers the commands, the file openers, the drop and the help. The code itself loads the first time one is used.
import './where';
import './help';
import { registerCommands } from '../core/registry';
import { registerOpener } from '../io/document';
import { lazyModule } from '../core/lazy';

const sequence = lazyModule(() => import('./sequence/run'));
const svg = lazyModule(() => import('./svg/run'));
const layered = lazyModule(() => import('./layered/run'));
const video = lazyModule(() => import('./video/run'));

// What the opener and the drop need to know before any of that is loaded.
const SVG_EXT = /\.(svg|svgz)$/i;
const LAYERED_EXT = /\.(psd|ora)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;

registerCommands([
  {
    id: 'file.importSequenceFiles',
    label: 'Pictures or a zip, as frames...',
    category: 'File',
    description: 'Bring in several pictures, or a zip of them (a PNG sequence), as the frames of one animation, sorted by the numbers in their names.',
    help: 'import-sequence',
    keywords: ['png sequence', 'image sequence', 'frames', 'zip', 'pictures', 'import', 'render', 'numbered', 'folder', 'round trip', 'jpg', 'scan'],
    run: () => sequence().then((m) => m.pickSequenceFiles()),
  },
  {
    id: 'file.importSequenceFolder',
    label: 'Folder of pictures, as frames...',
    category: 'File',
    description: 'Bring in a whole folder of pictures as the frames of one animation, sorted by the numbers in their names.',
    help: 'import-sequence',
    keywords: ['png sequence', 'image sequence', 'frames', 'folder', 'directory', 'pictures', 'import', 'render', 'numbered', 'scan'],
    run: () => sequence().then((m) => m.pickSequenceFolder()),
  },
  {
    id: 'file.importSvg',
    label: 'SVG or logo...',
    category: 'File',
    description: 'Bring in an SVG (from Illustrator, Inkscape or Figma) as vector shapes on layers, and be told what could not come across.',
    help: 'import-svg',
    keywords: ['svg', 'svgz', 'vector', 'logo', 'icon', 'illustrator', 'inkscape', 'figma', 'import', 'open', 'paths'],
    run: () => svg().then((m) => m.pickAndImportSvg()),
  },
  {
    id: 'file.importLayered',
    label: 'Layered file (Photoshop, OpenRaster)...',
    category: 'File',
    description: 'Bring in a .psd or .ora file with every layer on its own: names, order, opacity, groups and visibility kept.',
    help: 'import-layered',
    keywords: ['psd', 'photoshop', 'ora', 'openraster', 'krita', 'gimp', 'procreate', 'layers', 'import', 'open', 'groups'],
    run: () => layered().then((m) => m.pickAndImportLayered()),
  },
  {
    id: 'file.importVideo',
    label: 'Video, to trace over...',
    category: 'File',
    description: 'Pick a video, choose the stretch, the pictures a second and the size, and its frames come in as a reference layer or as pixel frames to draw over.',
    help: 'reference-video',
    keywords: ['video', 'rotoscope', 'rotoscoping', 'trace', 'footage', 'mp4', 'webm', 'mov', 'frames from video', 'screen recording', 'import', 'reference', 'film'],
    run: () => video().then((m) => m.pickVideo()),
  },
]);

// File > Open, Open recent and a double-click hand these over by path: each opens as a new drawing.
registerOpener((p) => SVG_EXT.test(p), (bytes, path) => svg().then((m) => m.openSvgBytes(bytes, path)));
registerOpener((p) => LAYERED_EXT.test(p), (bytes, path) => layered().then((m) => m.openLayeredBytes(bytes, path)));
registerOpener((p) => VIDEO_EXT.test(p), (bytes, path) => video().then((m) => m.openVideoBytes(bytes, path)));

/** Dropping SVG or layered files on the window; several pictures are handled with the picture drop (src/pixel/import). */
function installDrop(target: Window = window): void {
  const kind = (name: string) => (SVG_EXT.test(name) ? 'svg' : LAYERED_EXT.test(name) ? 'layered' : VIDEO_EXT.test(name) ? 'video' : null);
  target.addEventListener('dragover', (e) => {
    if (e.defaultPrevented) return;
    const items = e.dataTransfer?.items;
    if (!items || ![...items].some((i) => i.kind === 'file' && (i.type === 'image/svg+xml' || i.type === 'image/vnd.adobe.photoshop' || i.type === 'image/x-photoshop' || i.type === 'video/mp4' || i.type === 'video/webm' || i.type === 'video/quicktime'))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  target.addEventListener('drop', (e) => {
    if (e.defaultPrevented) return;
    const files = [...(e.dataTransfer?.files ?? [])];
    const svgs = files.filter((f) => kind(f.name) === 'svg');
    const layers = files.filter((f) => kind(f.name) === 'layered');
    const videos = files.filter((f) => kind(f.name) === 'video');
    if (!svgs.length && !layers.length && !videos.length) return;
    e.preventDefault();
    if (svgs.length) void svg().then((m) => m.dropSvg(svgs));
    if (layers.length) void layered().then((m) => m.dropLayered(layers));
    if (videos.length) void video().then((m) => m.dropVideo(videos));
  });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') setTimeout(() => installDrop(), 0);

// With ?debug in the page address, bringing a file in from bytes is exposed for the help picture capture and the checks.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  const w = window as unknown as { __framelingImport: unknown };
  w.__framelingImport = {
    sequence: (files: { path: string; bytes: number[] }[], name?: string) =>
      sequence().then((m) => m.importSequenceFiles(files.map((f) => ({ path: f.path, file: new File([Uint8Array.from(f.bytes)], f.path.slice(f.path.lastIndexOf('/') + 1)) })), name ?? '')),
    zip: (bytes: number[], path: string) => sequence().then((m) => m.importSequenceZip(Uint8Array.from(bytes), path)),
    svg: (text: string, path: string, asked = true) => svg().then((m) => m.importSvgBytes(new TextEncoder().encode(text), path, asked)),
    layered: (bytes: number[], path: string, asked = true) => layered().then((m) => m.importLayeredBytes(Uint8Array.from(bytes), path, asked)),
    video: (bytes: number[], name: string) => video().then((m) => m.openVideoBytes(Uint8Array.from(bytes), name)),
  };
}
